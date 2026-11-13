import type { ErrorKind, FieldErrors } from '../types';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/+$/, '');

export class ApiError extends Error {
  kind: ErrorKind;
  status?: number;
  code?: string;
  fields: FieldErrors;

  constructor(kind: ErrorKind, message: string, options: { status?: number; code?: string; fields?: FieldErrors } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
    this.fields = options.fields || {};
  }
}

type ApiRequestInit = RequestInit & { skipAuthRefresh?: boolean };
type TokenResponse = { accessToken: string; csrfToken: string };

let accessToken: string | null = null;
let csrfToken: string | null = null;
let refreshInFlight: Promise<void> | null = null;
let tokenRevision = 0;
let failedRefreshRevision: number | null = null;

function endpointName(path: string): string {
  return path.replace(/^\/+/, '').split(/[?#]/, 1)[0].replace(/^api\//, '');
}

function isPublicAuthEndpoint(path: string): boolean {
  const name = endpointName(path);
  return name.startsWith('auth/') && name !== 'auth/me' && name !== 'auth/change-password';
}

function usesRefreshCookie(path: string): boolean {
  return new Set(['auth/login', 'auth/csrf', 'auth/refresh', 'auth/logout', 'auth/change-password']).has(endpointName(path));
}

function authExpired(): void {
  clearAuthTokens();
  failedRefreshRevision = tokenRevision;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bep:auth-expired'));
}

function readFields(value: unknown): FieldErrors {
  const fields: FieldErrors = {};
  if (!value || typeof value !== 'object') return fields;
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === 'string') fields[key] = field;
    else if (Array.isArray(field)) fields[key] = field.filter(item => typeof item === 'string').join(' ');
  }
  return fields;
}

async function fetchEnvelope<T>(path: string, options: RequestInit = {}, bearer: string | null = null): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (typeof options.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (bearer && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${bearer}`);

  let response: Response;
  try {
    const timeout = AbortSignal.timeout(12000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    response = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, '')}`, {
      ...options,
      headers,
      signal,
      credentials: usesRefreshCookie(path) ? 'include' : (options.credentials ?? 'omit'),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('network', 'Chưa kết nối được với bếp. Vui lòng kiểm tra kết nối và thử lại.');
  }

  let body: unknown;
  try {
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('not-json');
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError('http', response.status === 413
        ? 'Ảnh quá lớn. Vui lòng chọn ảnh tối đa 5 MB.'
        : 'Chưa thể tải hoặc lưu dữ liệu. Vui lòng thử lại sau.', { status: response.status });
    }
    throw new ApiError('response', 'Phản hồi dữ liệu chưa hợp lệ. Vui lòng thử lại.', { status: response.status });
  }

  if (!body || typeof body !== 'object' || !('ok' in body) || typeof body.ok !== 'boolean') {
    if (!response.ok) {
      throw new ApiError('http', response.status >= 500
        ? 'Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại sau.'
        : 'Yêu cầu chưa được chấp nhận. Vui lòng thử lại.', { status: response.status });
    }
    throw new ApiError('response', 'Phản hồi dữ liệu chưa hợp lệ. Vui lòng thử lại.', { status: response.status });
  }

  if (body.ok) {
    if (!response.ok) throw new ApiError('http', 'Chưa thể tải hoặc lưu dữ liệu. Vui lòng thử lại sau.', { status: response.status });
    if (!('data' in body)) throw new ApiError('response', 'Phản hồi dữ liệu bị thiếu. Vui lòng thử lại.', { status: response.status });
    return body.data as T;
  }

  if (!('error' in body) || !body.error || typeof body.error !== 'object' || !('code' in body.error) || typeof body.error.code !== 'string') {
    throw new ApiError('response', 'Phản hồi lỗi chưa hợp lệ. Vui lòng thử lại.', { status: response.status });
  }
  const apiError = body.error;
  const fields = 'fields' in apiError ? readFields(apiError.fields) : {};
  throw new ApiError(
    'business',
    'message' in apiError && typeof apiError.message === 'string'
      ? apiError.message
      : 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
    { status: response.status, code: apiError.code as string, fields },
  );
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setAuthTokens(tokens: TokenResponse): void {
  if (!tokens.accessToken || !tokens.csrfToken) {
    throw new ApiError('response', 'Phản hồi đăng nhập thiếu token cần thiết.');
  }
  accessToken = tokens.accessToken;
  csrfToken = tokens.csrfToken;
  tokenRevision += 1;
  failedRefreshRevision = null;
}

export function clearAuthTokens(): void {
  accessToken = null;
  csrfToken = null;
  tokenRevision += 1;
}

export async function fetchCsrfFromCookie(): Promise<string> {
  const result = await fetchEnvelope<{ csrfToken: string }>('auth/csrf', { method: 'GET' });
  if (!result?.csrfToken) throw new ApiError('response', 'Phản hồi CSRF chưa hợp lệ.');
  setCsrfToken(result.csrfToken);
  return result.csrfToken;
}

export async function refreshSessionFromCookie(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  const startRevision = tokenRevision;
  refreshInFlight = (async () => {
    const csrf = csrfToken || await fetchCsrfFromCookie();
    const result = await fetchEnvelope<TokenResponse>('auth/refresh', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrf },
    });
    if (startRevision === tokenRevision) setAuthTokens(result);
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Chưa thể hoàn tất thao tác. Vui lòng thử lại.';
}

export async function request<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const { skipAuthRefresh = false, ...requestOptions } = options;
  const attachBearer = !isPublicAuthEndpoint(path);
  const originalToken = attachBearer ? accessToken : null;
  try {
    return await fetchEnvelope<T>(path, requestOptions, originalToken);
  } catch (error) {
    const canRefresh = !skipAuthRefresh && attachBearer && error instanceof ApiError && error.status === 401;
    if (!canRefresh) throw error;
    if (failedRefreshRevision === tokenRevision) throw error;

    // Another request may already have refreshed while this 401 was in flight.
    if (accessToken && accessToken !== originalToken) {
      try {
        return await fetchEnvelope<T>(path, requestOptions, accessToken);
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 401) authExpired();
        throw retryError;
      }
    }

    try {
      await refreshSessionFromCookie();
    } catch {
      // A password change/login may have installed a newer session while the
      // previous family's refresh failed. Do not discard that newer session.
      if (!accessToken || accessToken === originalToken) {
        authExpired();
        throw error;
      }
    }
    if (!accessToken) {
      authExpired();
      throw error;
    }
    try {
      return await fetchEnvelope<T>(path, requestOptions, accessToken);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) authExpired();
      throw retryError;
    }
  }
}
