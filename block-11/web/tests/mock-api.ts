import { expect, type Page, type Request } from '@playwright/test';
import type { PhotoDto, User } from '../src/types';

export const owner: User = { id: '11111111-1111-4111-8111-111111111111', name: 'Linh Nguyễn' };
export const other: User = { id: '22222222-2222-4222-8222-222222222222', name: 'Minh Trần' };
export function photo(index = 1): PhotoDto {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  return {
    id, title: ['Bình yên bên sườn núi', 'Một ngày nhiều nắng', 'Dọc theo dòng xanh'][((index - 1) % 3)],
    alt: `Khung cảnh thiên nhiên số ${index}`, uploader: index % 2 ? owner : other,
    width: 1800, height: 1200, createdAt: '2026-11-27T03:00:00.000Z',
    variants: [320, 960, 1600].map(width => ({ width, height: Math.round(width * 2 / 3), mime: 'image/webp', bytes: width * 20, url: `/media/photos/${id}/${width}.webp` })),
  };
}
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=', 'base64');
export type MockState = {
  user: User | null; photos: PhotoDto[]; total: number;
  meError?: boolean; listError?: boolean; uploadMode?: 'mixed' | 'all-failed' | 'request-error' | 'network-error' | 'expired';
  favorites: string[]; following: string[]; collections: { id: string; title: string; count: number; photoIds: string[] }[]; bio: string; avatarUrl: string | null;
  deleteStatus: 204 | 202 | 403;
  writes: Request[]; csrf: string; uploadDelay: number;
};
export async function mockApi(page: Page, options: Partial<MockState> = {}) {
  const state: MockState = { user: null, photos: [photo(1), photo(2), photo(3)], total: 3, favorites: [], following: [], collections: [], bio: '', avatarUrl: null, deleteStatus: 204, writes: [], csrf: 'pre-login-csrf', uploadDelay: 0, ...options };
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('**/media/photos/**', route => {
    const index = Number(new URL(route.request().url()).pathname.split('/')[3].slice(-2));
    const colors = index % 2 ? ['#b8d7c4', '#527c68', '#294f3c'] : ['#e5d4a1', '#98b4a0', '#45664f'];
    return route.fulfill({ contentType: 'image/svg+xml', headers: { 'Cache-Control': 'no-store' }, body: `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067" viewBox="0 0 1600 1067"><rect fill="${colors[0]}" width="1600" height="1067"/><circle fill="#f9e6ae" cx="1180" cy="220" r="100"/><path fill="${colors[1]}" d="M0 800L460 220 940 850 1300 400 1600 650V1067H0Z"/><path fill="${colors[2]}" d="M0 960L550 580 1000 980 1400 650 1600 820V1067H0Z"/></svg>` });
  });
  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const ok = (data: unknown, status = 200) => route.fulfill({ status, json: { ok: true, data } });
    const fail = (status: number, code: string, message = 'Yêu cầu không hợp lệ.') => route.fulfill({ status, json: { ok: false, error: { code, message } } });
    if (method === 'GET' && path === '/api/auth/csrf') return ok({ csrfToken: state.csrf });
    if (method === 'GET' && path === '/api/auth/me') return state.meError ? fail(503, 'INTERNAL_ERROR') : state.user ? ok({ user: state.user }) : fail(401, 'AUTH_REQUIRED');
    if (method !== 'GET') {
      state.writes.push(req);
      if (req.headers()['x-csrf-token'] !== state.csrf) return fail(403, 'CSRF_INVALID');
    }
    if (path === '/api/auth/login') { state.user = owner; state.csrf = 'rotated-csrf'; return ok({ user: owner, csrfToken: state.csrf }); }
    if (path === '/api/auth/register') return ok({ user: owner }, 201);
    if (path === '/api/auth/logout') { state.user = null; state.csrf = 'after-logout-csrf'; return route.fulfill({ status: 204 }); }
    if (path.startsWith('/api/users/')) {
      const id = path.split('/')[3], target = id === owner.id ? { ...owner, ...(state.user?.id === id ? {name:state.user.name} : {}) } : id === other.id ? other : null;
      if (!target) return fail(404, 'NOT_FOUND');
      if (path.endsWith('/follow')) { state.following = method === 'DELETE' ? state.following.filter(v => v !== id) : [...new Set([...state.following,id])]; return route.fulfill({status:204}); }
      return ok({ ...target, bio: state.bio, avatarUrl: state.avatarUrl, photoCount: state.photos.filter(p=>p.uploader.id===id).length, followers: state.following.includes(id) ? 1 : 0, following: 0, isFollowing: state.following.includes(id) });
    }
    if (path === '/api/me/profile') { const data = req.postDataJSON(); if(state.user) state.user.name=data.name;state.bio=data.bio;return ok({ ...state.user,bio:state.bio,avatarUrl:state.avatarUrl }); }
    if (path === '/api/me/avatar') { state.avatarUrl=photo(1).variants[0].url;return ok({ ...state.user,bio:state.bio,avatarUrl:state.avatarUrl }); }
    if (/^\/api\/photos\/[^/]+\/activity$/.test(path)) { const id=path.split('/')[3];return ok({liked:state.favorites.includes(id),likes:state.favorites.includes(id)?1:0}); }
    if (path.endsWith('/favorite')) {const id=path.split('/')[3];state.favorites=method==='DELETE'?state.favorites.filter(v=>v!==id):[...new Set([...state.favorites,id])];return route.fulfill({status:204});}
    if (path.startsWith('/api/me/collections')) {
      const parts=path.split('/'), id=parts[4], photoId=parts[6];
      if (!id && method==='GET')return ok({items:state.collections});
      if (!id && method==='POST'){const c={id:'33333333-3333-4333-8333-'+String(state.collections.length+1).padStart(12,'0'),title:req.postDataJSON().title,count:0,photoIds:[] as string[]};state.collections.push(c);return ok(c,201);}
      const c=state.collections.find(c=>c.id===id);if(!c)return fail(404,'NOT_FOUND');
      if(photoId){c.photoIds=method==='DELETE'?c.photoIds.filter(v=>v!==photoId):[...new Set([...c.photoIds,photoId])];c.count=c.photoIds.length;}
      else if(method==='PATCH')c.title=req.postDataJSON().title;
      else if(method==='DELETE')state.collections=state.collections.filter(c=>c.id!==id);
      return route.fulfill({status:204});
    }
    if (path === '/api/photos' && method === 'GET') {
      if (state.listError) return fail(503, 'INTERNAL_ERROR', 'Không tải được thư viện.');
      const current = Number(url.searchParams.get('page') ?? 1);
      const mine = url.searchParams.get('mine') === 'true';
      if (mine && !state.user) return fail(401, 'AUTH_REQUIRED');
      let filtered = mine ? state.photos.filter(p => p.uploader.id === state.user!.id) : state.photos;
      if (url.searchParams.has('user')) filtered = filtered.filter(p => p.uploader.id === url.searchParams.get('user'));
      if (url.searchParams.has('q')) { const q = url.searchParams.get('q')!.toLowerCase(); filtered = filtered.filter(p => [p.title,p.alt,p.uploader.name].join(' ').toLowerCase().includes(q)); }
      if (url.searchParams.has('favorites')) filtered = filtered.filter(p => state.favorites.includes(p.id));
      if (url.searchParams.has('following')) filtered = filtered.filter(p => state.following.includes(p.uploader.id));
      if (url.searchParams.has('collection')) filtered = filtered.filter(p => state.collections.find(c => c.id === url.searchParams.get('collection'))?.photoIds.includes(p.id));
      const subset = mine || ['user','q','favorites','following','collection'].some(key => url.searchParams.has(key));
      return ok({ items: filtered.slice((current - 1) * 12, current * 12), page: current, pageSize: 12, total: subset ? filtered.length : state.total, totalPages: Math.ceil((subset ? filtered.length : state.total) / 12) });
    }
    if (path === '/api/photos' && method === 'POST') {
      if (state.uploadDelay) await new Promise(resolve => setTimeout(resolve, state.uploadDelay));
      if (state.uploadMode === 'network-error') return route.abort('failed');
      if (state.uploadMode === 'expired') return fail(401, 'AUTH_REQUIRED', 'Phiên đăng nhập hết hạn.');
      if (state.uploadMode === 'request-error') return fail(400, 'INVALID_METADATA', 'Metadata không hợp lệ.');
      if (state.uploadMode === 'all-failed') return ok({ results: [{ index: 0, ok: false, error: { code: 'INVALID_IMAGE', message: 'Ảnh bị hỏng.' } }], succeeded: 0, failed: 1 });
      return ok({ results: [{ index: 0, ok: true, photo: photo(1) }, { index: 1, ok: false, error: { code: 'INVALID_IMAGE', message: 'Ảnh bị hỏng.' } }], succeeded: 1, failed: 1 });
    }
    const found = state.photos.find(p => path === `/api/photos/${p.id}`);
    if (!found) return fail(404, 'NOT_FOUND');
    if (method === 'DELETE') {
      if (state.deleteStatus === 403) return fail(403, 'FORBIDDEN', 'Bạn không sở hữu ảnh này.');
      state.photos = state.photos.filter(p => p.id !== found.id); state.total--;
      return state.deleteStatus === 204 ? route.fulfill({ status: 204 }) : ok({ id: found.id, status: 'DELETING' }, 202);
    }
    return ok(found);
  });
  return state;
}
export async function chooseFiles(page: Page, count = 1) {
  await page.getByLabel('Chọn ảnh', { exact: true }).setInputFiles(Array.from({ length: count }, (_, index) => ({ name: `photo-${index}.png`, mimeType: 'image/png', buffer: png })));
  for (let index = 0; index < count; index++) {
    await page.getByLabel(`Tiêu đề ảnh ${index + 1}`, { exact: true }).fill(`Ảnh ${index + 1}`);
    await page.getByLabel(`Mô tả thay thế ảnh ${index + 1}`, { exact: true }).fill(`Mô tả ảnh ${index + 1}`);
  }
  await page.getByText('Xem so sánh trước/sau xử lý', { exact: true }).first().click();
  await expect(page.getByAltText('Xem trước photo-0.png')).toBeVisible();
}
