import type { CSSProperties } from 'react';
import './skeleton.css';

export type SkeletonVariant = 'cards' | 'table' | 'detail' | 'form' | 'content' | 'options';
type Props = { variant?: SkeletonVariant; count?: number; columns?: number; label?: string };
const Line = ({ className = '' }: { className?: string }) => <span className={`skeleton-surface skeleton-line ${className}`} />;

export default function Skeleton({ variant = 'content', count = 6, columns = 6, label = 'Đang tải dữ liệu…' }: Props) {
  const rows = Array.from({ length: Math.max(1, Math.min(count, 12)) }, (_, i) => i);
  return <div className={`skeleton-state skeleton-${variant}`} role="status" aria-label={label}>
    <span className="visually-hidden">{label}</span>
    {variant === 'options' && <div className="skeleton-option-list" aria-hidden="true">{rows.map(i => <div className="skeleton-option" key={i}><span className="skeleton-surface skeleton-option-check" /><Line className="skeleton-short" /></div>)}</div>}
    {variant === 'cards' && <div className="dish-grid" aria-hidden="true">{rows.map(i => <div className="skeleton-card" key={i}>
      <div className="skeleton-surface skeleton-card-image" />
      <div className="skeleton-card-body"><div className="skeleton-card-title"><Line className="skeleton-title" /><Line className="skeleton-price" /></div>
        <Line /><Line className="skeleton-short" /><div className="skeleton-card-bottom"><Line /><Line /></div></div>
    </div>)}</div>}
    {variant === 'table' && <div className="table-scroll skeleton-table-scroll" aria-hidden="true"><div className="skeleton-table-inner" style={{ '--skeleton-columns': columns, minWidth: columns > 4 ? 790 : 560 } as CSSProperties}>
      <div className="skeleton-table-row skeleton-table-head">{Array.from({ length: columns }, (_, i) => <div key={i}><Line /></div>)}</div>
      {rows.map(i => <div className="skeleton-table-row" key={i}>{Array.from({ length: columns }, (_, col) => <div key={col}>
        {col === 1 ? <div className="skeleton-table-name"><span className="skeleton-surface skeleton-thumbnail" /><Line /></div> : <Line />}
      </div>)}</div>)}
    </div></div>}
    {variant === 'detail' && <div className="detail-grid" aria-hidden="true"><div className="skeleton-surface skeleton-detail-image" /><div className="skeleton-detail-copy">
      <Line className="skeleton-short" /><Line className="skeleton-heading" /><Line className="skeleton-badge" />
      <div className="skeleton-description"><Line /><Line /><Line className="skeleton-short" /></div>
      <Line className="skeleton-heading skeleton-short" /><div className="skeleton-chef"><span className="skeleton-surface skeleton-avatar" /><div><Line /><Line className="skeleton-short" /></div></div>
      <Line /><Line /><Line className="skeleton-short" />
    </div></div>}
    {variant === 'form' && <div className="skeleton-form-fields" aria-hidden="true"><Line className="skeleton-heading skeleton-short" /><div className="form-panel">{Array.from({ length: 5 }, (_, i) => <div className="skeleton-field" key={i}><Line className="skeleton-short" /><span className="skeleton-surface skeleton-input" /></div>)}</div></div>}
    {variant === 'content' && <div className="skeleton-content-body" aria-hidden="true"><Line className="skeleton-heading skeleton-short" /><Line /><Line /><Line className="skeleton-short" /></div>}
  </div>;
}
