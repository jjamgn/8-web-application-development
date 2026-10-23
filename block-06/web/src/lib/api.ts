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

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Chưa thể hoàn tất thao tác. Vui lòng thử lại.';
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (typeof options.body === 'string') headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(12000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    response = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, '')}`, { ...options, headers, signal });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('network', 'Chưa kết nối được với bếp. Vui lòng kiểm tra kết nối và thử lại.');
  }
  if (!response.ok) {
    throw new ApiError('http', 'Chưa thể tải hoặc lưu dữ liệu. Vui lòng thử lại sau.', { status: response.status });
  }
  let body: unknown;
  try {
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error();
    body = await response.json();
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('response', 'Phản hồi dữ liệu chưa hợp lệ. Vui lòng thử lại.');
  }
  if (!body || typeof body !== 'object' || !('ok' in body) || typeof body.ok !== 'boolean') {
    throw new ApiError('response', 'Phản hồi dữ liệu chưa hợp lệ. Vui lòng thử lại.');
  }
  if (body.ok) {
    if (!('data' in body)) throw new ApiError('response', 'Phản hồi dữ liệu bị thiếu. Vui lòng thử lại.');
    return body.data as T;
  }
  if (!('error' in body) || !body.error || typeof body.error !== 'object' || !('code' in body.error) || typeof body.error.code !== 'string') {
    throw new ApiError('response', 'Phản hồi lỗi chưa hợp lệ. Vui lòng thử lại.');
  }
  const apiError = body.error;
  const fields: FieldErrors = {};
  if ('fields' in apiError && apiError.fields && typeof apiError.fields === 'object') {
    for (const [key, value] of Object.entries(apiError.fields)) {
      if (typeof value === 'string') fields[key] = value;
      else if (Array.isArray(value)) fields[key] = value.filter(v => typeof v === 'string').join(' ');
    }
  }
  throw new ApiError('business', 'message' in apiError && typeof apiError.message === 'string'
    ? apiError.message : 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
  { code: apiError.code as string, fields });
}
