import { useEffect, useRef } from 'react';
import type { useDishPagination } from '../hooks/useDishPagination';
type Load = ReturnType<typeof useDishPagination>;
export function PageNumbers({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const count = Math.ceil(total / pageSize);
  if (!count) return null;
  const pages = [...new Set([1, page - 1, page, page + 1, count].filter(n => n >= 1 && n <= count))].sort((a, b) => a - b);
  return <nav className="page-numbers" aria-label="Phân trang món ăn"><span>Trang {page} / {count} · {total} món</span><div><button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">←</button>{pages.map((n, i) => <span key={n}>{i > 0 && n - pages[i - 1] > 1 && <span className="page-gap">…</span>}<button aria-label={`Trang ${n}`} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button></span>)}<button disabled={page >= count} onClick={() => onPage(page + 1)} aria-label="Trang sau">→</button></div></nav>;
}
export function MoreDishes({ load, infinite = false }: { load: Load; infinite?: boolean }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const action = useRef(load.loadMore); action.current = load.loadMore;
  useEffect(() => {
    if (!infinite || !load.hasMore || load.loadingMore || load.moreError || !sentinel.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) action.current(); }, { rootMargin: '300px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [infinite, load.hasMore, load.loadingMore, load.moreError, load.page, load.key]);
  if (load.status !== 'success' || load.total === 0) return null;
  return <div className="more-dishes"><div ref={sentinel} aria-hidden="true" /><p role="status" aria-live="polite">Đã xem {load.items.length} / {load.total} món{!load.hasMore && ' · Bạn đã xem hết thực đơn này.'}</p>
    {load.moreError && <p className="field-error" role="alert">{load.moreError}</p>}{load.hasMore && <button className="button outline" onClick={load.loadMore} disabled={load.loadingMore}>{load.loadingMore ? 'Đang tải món…' : load.moreError ? 'Thử tải lại' : infinite ? 'Xem tiếp món ăn' : 'Tải thêm món'}</button>}
    {infinite && <small>Cuộn để khám phá tiếp. Mở lại liên kết sẽ bắt đầu từ món đầu tiên.</small>}</div>;
}
