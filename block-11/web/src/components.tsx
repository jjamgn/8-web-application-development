import type { PhotoDto } from './types';

// Shell: max 1200px, 24px side padding; grid gaps 24px.
export const gallerySizes = '(min-width: 1248px) 384px, (min-width: 1024px) calc((100vw - 96px) / 3), (min-width: 600px) calc((100vw - 72px) / 2), calc(100vw - 48px)';
export const detailSizes = '(min-width: 1248px) 1200px, calc(100vw - 48px)';

export function PhotoImage({ photo, detail = false }: { photo: PhotoDto; detail?: boolean }) {
  const variants = [...photo.variants].sort((a, b) => a.width - b.width);
  const fallback = variants.reduce((best, v) => Math.abs(v.width - 960) < Math.abs(best.width - 960) ? v : best);
  return <img src={fallback.url} srcSet={variants.map(v => `${v.url} ${v.width}w`).join(', ')}
    sizes={detail ? detailSizes : gallerySizes} width={photo.width} height={photo.height}
    loading={detail ? 'eager' : 'lazy'} fetchPriority={detail ? 'high' : 'auto'}
    decoding="async" alt={photo.alt} />;
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`notice${error ? ' notice-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>;
}
export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return <div role="status" aria-label="Đang tải ảnh" className="skeleton-grid"><span className="sr-only">Đang tải ảnh…</span>{Array.from({ length: count }, (_, i) => <div className="skeleton-card" aria-hidden="true" key={i}><div className="skeleton skeleton-image" /><div className="skeleton skeleton-title" /><div className="skeleton skeleton-author" /></div>)}</div>;
}
export function Loading() { return <div className="loading-skeleton" role="status" aria-label="Đang tải"><span className="sr-only">Đang tải…</span><div aria-hidden="true" className="skeleton skeleton-title" /><div aria-hidden="true" className="skeleton skeleton-image" /></div>; }
export function NotFound() {
  return <div className="state"><p className="eyebrow">404</p><h1>Không tìm thấy trang</h1><p>Ảnh có thể đã bị xóa hoặc đường dẫn không tồn tại.</p><a className="button" href="/photos">Về thư viện</a></div>;
}
