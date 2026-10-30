import { useEffect, useState } from 'react';
import { ApiError, request } from '../lib/api';
import type { IngredientPage } from '../lib/ingredients';
type State = { key: string; status: 'loading' | 'success' | 'error'; data: IngredientPage | null; error: unknown };
export function useIngredientPage(q: string, page: number, pageSize = 12, delay = 0) {
  const key = new URLSearchParams({ q: q.trim(), page: String(page), pageSize: String(pageSize) }).toString();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ key: '', status: 'loading', data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, status: 'loading', data: null, error: null });
    const timer = setTimeout(() => {
      request<IngredientPage>(`/ingredients?${key}`, { signal: controller.signal }).then(data => {
        if (!data || !Array.isArray(data.items) || !data.items.every(item => item && Number.isInteger(item.id) && typeof item.name === 'string' && typeof item.unit === 'string') || !Number.isSafeInteger(data.total) || data.total < 0 || data.page !== page || data.pageSize !== pageSize || data.items.length > pageSize) throw new ApiError('response', 'Dữ liệu nguyên liệu chưa đúng định dạng.');
        if (!controller.signal.aborted) setState({ key, status: 'success', data, error: null });
      }).catch((error: unknown) => { if (!controller.signal.aborted) setState({ key, status: 'error', data: null, error }); });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, attempt, delay, page, pageSize]);
  return { ...(state.key === key ? state : { key, status: 'loading' as const, data: null, error: null }), reload: () => setAttempt(n => n + 1) };
}
