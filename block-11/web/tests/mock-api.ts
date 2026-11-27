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
  deleteStatus: 204 | 202 | 403;
  writes: Request[]; csrf: string; uploadDelay: number;
};
export async function mockApi(page: Page, options: Partial<MockState> = {}) {
  const state: MockState = { user: null, photos: [photo(1), photo(2), photo(3)], total: 3, deleteStatus: 204, writes: [], csrf: 'pre-login-csrf', uploadDelay: 0, ...options };
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
    if (path === '/api/photos' && method === 'GET') {
      if (state.listError) return fail(503, 'INTERNAL_ERROR', 'Không tải được thư viện.');
      const current = Number(url.searchParams.get('page') ?? 1);
      return ok({ items: current === 1 ? state.photos : [], page: current, pageSize: 12, total: state.total, totalPages: Math.ceil(state.total / 12) });
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
  await expect(page.getByAltText('Xem trước photo-0.png')).toBeVisible();
}
