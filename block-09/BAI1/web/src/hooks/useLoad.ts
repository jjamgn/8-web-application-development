import { useCallback, useEffect, useState } from 'react';
import { ApiError, request } from '../lib/api';

type LoadState<T> =
  | { path: string | null; status: 'idle' | 'loading'; data: null; error: null }
  | { path: string; status: 'success'; data: T; error: null }
  | { path: string; status: 'error'; data: null; error: unknown };

export function useLoad<T>(path: string | null, shape: 'record' | 'list' = 'record') {
  const [state, setState] = useState<LoadState<T>>({ path: null, status: 'idle', data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    if (path === null) {
      setState({ path, status: 'idle', data: null, error: null });
      return;
    }
    const controller = new AbortController();
    setState({ path, status: 'loading', data: null, error: null });
    request<T>(path, { signal: controller.signal }).then(data => {
      const isRecord = (value: unknown) => value !== null && typeof value === 'object' && 'id' in value && typeof value.id === 'number' && 'name' in value && typeof value.name === 'string';
      if (shape === 'list' ? !Array.isArray(data) || !data.every(isRecord) : !isRecord(data)) {
        throw new ApiError('response', 'Dữ liệu nhận được chưa đúng định dạng. Vui lòng thử lại.');
      }
      if (!controller.signal.aborted) setState({ path, status: 'success', data, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ path, status: 'error', data: null, error });
    });
    return () => controller.abort();
  }, [path, attempt, shape]);
  // Hide previous records immediately, before the next effect starts its request.
  const current: LoadState<T> = state.path === path ? state
    : { path, status: path === null ? 'idle' : 'loading', data: null, error: null };
  return { ...current, reload };
}
