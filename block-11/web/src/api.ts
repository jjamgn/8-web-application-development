import type { PublicProfile, ProfileIdentity, CollectionDto } from '../../contracts/index.js';
import { invalidateFeeds } from './lib/gallery-cache';
import type { GalleryData, PhotoDto, UploadData, User } from './types';

export class RequestError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}

let csrfToken: string | undefined;
let csrfRequest: Promise<string> | undefined;

async function request<T>(path: string, init: RequestInit = {}): Promise<{ data: T; status: number }> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: 'same-origin' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new RequestError('NETWORK_ERROR', 'Không thể kết nối máy chủ. Kiểm tra kết nối rồi thử lại.');
  }
  if (response.status === 204) return { data: undefined as T, status: 204 };
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    if (response.status === 401 || body?.error?.code === 'CSRF_INVALID') csrfToken = undefined;
    const retry = response.headers.get('Retry-After');
    throw new RequestError(body?.error?.code ?? 'INVALID_RESPONSE',
      response.status === 429 ? `Bạn đã thử quá nhiều lần. Vui lòng thử lại${retry ? ` sau ${retry} giây` : ' sau'}.`
        : body?.error?.message ?? 'Máy chủ chưa sẵn sàng hoặc trả dữ liệu không hợp lệ.', response.status);
  }
  return { data: body.data as T, status: response.status };
}

async function token(): Promise<string> {
  if (csrfToken) return csrfToken;
  csrfRequest ??= request<{ csrfToken: string }>('/api/auth/csrf', { cache: 'no-store' })
    .then(({ data }) => (csrfToken = data.csrfToken)).finally(() => { csrfRequest = undefined; });
  return csrfRequest;
}

async function write<T>(path: string, method: 'POST' | 'DELETE' | 'PATCH', body?: object | FormData) {
  const headers = new Headers({ 'X-CSRF-Token': await token() });
  const multipart = body instanceof FormData;
  if (body && !multipart) headers.set('Content-Type', 'application/json');
  // Never retry mutations automatically: the server may already have committed.
  return request<T>(path, { method, headers, body: body ? (multipart ? body : JSON.stringify(body)) : undefined });
}

export const api = {
  me: (signal?: AbortSignal) => request<{ user: User }>('/api/auth/me', { cache: 'no-store', signal }).then(r => r.data.user),
  login: async (email: string, password: string) => {
    const { data } = await write<{ user: User; csrfToken: string }>('/api/auth/login', 'POST', { email, password });
    invalidateFeeds();
    csrfToken = data.csrfToken;
    return data.user;
  },
  register: (data: { name: string; email: string; password: string; confirmPassword: string }) =>
    write<{ user: User }>('/api/auth/register', 'POST', data),
  logout: async () => { await write('/api/auth/logout', 'POST'); csrfToken = undefined; invalidateFeeds(); },
  list: (page: number, signal?: AbortSignal, filter: Record<string, string> | boolean = {}) => request<GalleryData>('/api/photos?' + new URLSearchParams({ ...(typeof filter === 'boolean' ? filter ? { mine: 'true' } : {} : filter), page: String(page) }), { signal }).then(r => r.data),
  user: (id: string, signal?: AbortSignal) => request<PublicProfile>('/api/users/' + encodeURIComponent(id), { signal, cache: 'no-store' }).then(r => r.data),
  updateProfile: (name: string, bio: string) => write<ProfileIdentity>('/api/me/profile', 'PATCH', { name, bio }).then(r => r.data),
  avatar: (file: File) => { const data = new FormData(); data.append('photos', file); data.append('metadata', JSON.stringify([{ title: 'Avatar', alt: 'Avatar' }])); return write<ProfileIdentity>('/api/me/avatar', 'POST', data).then(r => r.data); },
  follow: (id: string, followed: boolean) => write('/api/users/' + encodeURIComponent(id) + '/follow', followed ? 'DELETE' : 'POST'),
  activity: (id: string) => request<{ likes: number; liked: boolean }>('/api/photos/' + encodeURIComponent(id) + '/activity', { cache: 'no-store' }).then(r => r.data),
  favorite: (id: string, liked: boolean) => write('/api/photos/' + encodeURIComponent(id) + '/favorite', liked ? 'DELETE' : 'POST'),
  collections: () => request<{ items: CollectionDto[] }>('/api/me/collections', { cache: 'no-store' }).then(r => r.data.items),
  createCollection: (title: string) => write<CollectionDto>('/api/me/collections', 'POST', { title }).then(r => r.data),
  renameCollection: (id: string, title: string) => write('/api/me/collections/' + encodeURIComponent(id), 'PATCH', { title }),
  deleteCollection: (id: string) => write('/api/me/collections/' + encodeURIComponent(id), 'DELETE'),
  collect: (id: string, photoId: string, remove = false) => write('/api/me/collections/' + encodeURIComponent(id) + '/photos/' + encodeURIComponent(photoId), remove ? 'DELETE' : 'POST'),
  photo: (id: string, signal?: AbortSignal) => request<PhotoDto>(`/api/photos/${encodeURIComponent(id)}`, { signal }).then(r => r.data),
  upload: (body: FormData) => write<UploadData>('/api/photos', 'POST', body).then(r => r.data),
  remove: (id: string) => write<{ id: string; status: 'DELETING' }>(`/api/photos/${encodeURIComponent(id)}`, 'DELETE'),
};

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
