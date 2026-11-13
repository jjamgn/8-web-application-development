import { useEffect, useRef, useState } from 'react';
import type { Dish } from '../types';
import { errorMessage } from '../lib/api';
import { fetchDishPage, parseQuery, queryParams, type DishQuery, type SearchMode } from '../lib/dishes';

type State = { key: string; status: 'loading' | 'success' | 'error'; items: Dish[]; total: number; page: number; hasMore: boolean; loadingMore: boolean; error: unknown; moreError: string; searchMode?: SearchMode };
const initial = (key: string): State => ({ key, status: 'loading', items: [], total: 0, page: 0, hasMore: false, loadingMore: false, error: null, moreError: '' });
export function useDishPagination(query: DishQuery, append: boolean) {
  const key = queryParams(query, !append).toString();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>(() => initial(key));
  const nextRef = useRef<null | (() => void)>(null);
  const activeKey = useRef(key); activeKey.current = key;
  useEffect(() => {
    let active = true, pending = false, page = 0, hasMore = false;
    let resolvedMode: SearchMode | undefined;
    const controller = new AbortController();
    const base = parseQuery(new URLSearchParams(key));
    setState(initial(key));
    async function load(next: number, first: boolean) {
      if (!active || pending || activeKey.current !== key) return;
      pending = true;
      if (!first) setState(s => ({ ...s, loadingMore: true, moreError: '' }));
      try {
        const data = await fetchDishPage({ ...base, page: next }, controller.signal, resolvedMode);
        if (!active || activeKey.current !== key) return;
        page = next; hasMore = data.items.length > 0 && page * data.pageSize < data.total;
        resolvedMode = data.searchMode;
        setState(s => {
          const seen = new Set<number>();
          const items = (first ? data.items : [...s.items, ...data.items]).filter(dish => !seen.has(dish.id) && !!seen.add(dish.id));
          return { key, status: 'success', items, total: data.total, page, hasMore, loadingMore: false, error: null, moreError: '', searchMode: data.searchMode };
        });
      } catch (error) {
        if (active && activeKey.current === key) setState(s => first ? { ...initial(key), status: 'error', error } : { ...s, loadingMore: false, moreError: errorMessage(error) });
      } finally { pending = false; }
    }
    nextRef.current = () => { if (append && hasMore) void load(page + 1, false); };
    void load(append ? 1 : base.page, true);
    return () => { active = false; controller.abort(); nextRef.current = null; };
  }, [key, attempt, append]);
  const current = state.key === key ? state : initial(key);
  return { ...current, reload: () => setAttempt(n => n + 1), loadMore: () => { if (activeKey.current === key) nextRef.current?.(); } };
}
