import type { Dish } from '../types';
import { ApiError, request } from './api';

export type SearchMode = 'auto' | 'basic' | 'advanced' | 'fulltext' | 'fuzzy';
export type DishQuery = { mode: SearchMode; q: string; category: string; minPrice: string; maxPrice: string; available: string; sort: string; page: number; pageSize: number };
export type DishPage = { items: Dish[]; total: number; page: number; pageSize: number; searchMode?: SearchMode };
export const defaultQuery: DishQuery = { mode: 'auto', q: '', category: '', minPrice: '', maxPrice: '', available: '', sort: 'name_asc', page: 1, pageSize: 12 };
const integer = (s: string | null, fallback: number, max: number) => s && /^[1-9]\d*$/.test(s) && Number(s) <= max ? Number(s) : fallback;
export function parseQuery(params: URLSearchParams): DishQuery {
  const sort = params.get('sort') || '';
  const price = (key: string) => /^\d{1,9}$/.test(params.get(key) || '') ? params.get(key)! : '';
  const result: DishQuery = {
    ...defaultQuery,
    q: (params.get('q') || '').slice(0, 160), category: ['Khai vị', 'Món chính', 'Món chay', 'Tráng miệng'].includes(params.get('category') || '') ? params.get('category')! : '',
    minPrice: price('minPrice'), maxPrice: price('maxPrice'), available: ['true', 'false'].includes(params.get('available') || '') ? params.get('available')! : '',
    sort: ['name_asc', 'name_desc', 'price_asc', 'price_desc'].includes(sort) ? sort : 'name_asc',
    page: integer(params.get('page'), 1, 1000000), pageSize: integer(params.get('pageSize'), 12, 100),
  };
  return result;
}
export function queryParams(query: DishQuery, includePage = true): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ['mode', 'q', 'category', 'minPrice', 'maxPrice', 'available', 'sort'] as const) {
    if (query[key] !== '' && !(key === 'mode' && query.mode === 'auto')) params.set(key, query[key]);
  }
  if (includePage) params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  return params;
}
export async function fetchDishPage(query: DishQuery, signal: AbortSignal, resolvedMode?: SearchMode) {
  const hasFilters = ['category', 'minPrice', 'maxPrice', 'available'].some(key => query[key as keyof DishQuery] !== '');
  const nameMode: SearchMode = hasFilters ? 'advanced' : 'basic';
  const modes: SearchMode[] = resolvedMode ? [resolvedMode] : query.q.trim() ? ['fuzzy', nameMode, 'fulltext'] : [nameMode];
  let result: DishPage | undefined;
  for (const mode of modes) {
    const data = await request<DishPage>(`/dishes?${queryParams({ ...query, mode })}`, { signal });
    if (!data || !Array.isArray(data.items) || !data.items.every(d => Number.isInteger(d.id) && typeof d.name === 'string') || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isInteger(data.page) || data.page < 1 || data.pageSize !== query.pageSize || data.page !== query.page || data.items.length > data.pageSize) {
      throw new ApiError('response', 'Dữ liệu phân trang chưa hợp lệ. Vui lòng thử lại.');
    }
    result = { ...data, searchMode: mode };
    if (data.total > 0) break;
  }
  return result!;
}
export async function uploadDishImage(file: File) {
  const body = new FormData(); body.set('file', file);
  return request<{ imagePath: string; imageUrl: string }>('/uploads/dishes', { method: 'POST', body });
}
export function adminReturnPath(resource: string, value: string | null) {
  const base = `/admin/${resource}`;
  return value === base || value?.startsWith(`${base}?`) ? value : base;
}
