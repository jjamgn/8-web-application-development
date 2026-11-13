import type { CSSProperties, ReactNode } from 'react';

export type SkeletonVariant = 'cards' | 'table' | 'detail' | 'form' | 'confirm' | 'field' | 'image';

type Props = {
  variant?: SkeletonVariant;
  label?: string;
  columns?: number;
  count?: number;
};

function Bars({ count = 3 }: { count?: number }) {
  return <div className="skeleton-bars">
    {Array.from({ length: count }, (_, index) => <span key={index} className={'skeleton-shimmer skeleton-line skeleton-line-' + (index + 1)} />)}
  </div>;
}

export default function Skeleton({ variant = 'table', label = 'Đang tải dữ liệu…', columns = 4, count = 6 }: Props) {
  const columnCount = Math.max(2, Math.min(8, columns));
  const gridStyle: CSSProperties = { gridTemplateColumns: 'repeat(' + columnCount + ', minmax(0, 1fr))' };
  let visual: ReactNode;

  if (variant === 'cards') {
    visual = <div className="skeleton-card-grid">
      {Array.from({ length: count }, (_, index) => <div className="skeleton-card" key={index}>
        <span className="skeleton-shimmer skeleton-card-image" />
        <div className="skeleton-card-body"><Bars count={3} /></div>
      </div>)}
    </div>;
  } else if (variant === 'table') {
    visual = <div className="skeleton-table">
      <div className="skeleton-table-row skeleton-table-head" style={gridStyle}>
        {Array.from({ length: columnCount }, (_, index) => <span className="skeleton-shimmer" key={index} />)}
      </div>
      {Array.from({ length: 5 }, (_, row) => <div className="skeleton-table-row" style={gridStyle} key={row}>
        {Array.from({ length: columnCount }, (_, column) => <span className="skeleton-shimmer" key={column} />)}
      </div>)}
    </div>;
  } else if (variant === 'detail') {
    visual = <div className="skeleton-detail">
      <span className="skeleton-shimmer skeleton-detail-image" />
      <div className="skeleton-detail-copy"><Bars count={6} /></div>
    </div>;
  } else if (variant === 'form') {
    visual = <div className="skeleton-form">
      <span className="skeleton-shimmer skeleton-form-title" />
      {Array.from({ length: 5 }, (_, index) => <div className="skeleton-form-field" key={index}>
        <span className="skeleton-shimmer skeleton-form-label" />
        <span className="skeleton-shimmer skeleton-form-input" />
      </div>)}
      <div className="skeleton-form-actions"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></div>
    </div>;
  } else if (variant === 'confirm') {
    visual = <div className="skeleton-confirm">
      <span className="skeleton-shimmer skeleton-confirm-icon" />
      <span className="skeleton-shimmer skeleton-confirm-title" />
      <Bars count={2} />
      <div className="skeleton-form-actions"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></div>
    </div>;
  } else if (variant === 'field') {
    visual = <div className="skeleton-field">
      <span className="skeleton-shimmer skeleton-form-label" />
      <span className="skeleton-shimmer skeleton-form-input" />
    </div>;
  } else {
    visual = <span className="skeleton-shimmer skeleton-image" />;
  }

  return <div className={'loading-skeleton loading-skeleton-' + variant} role="status" aria-label={label} aria-busy="true">
    <span className="visually-hidden">{label}</span>
    <div aria-hidden="true">{visual}</div>
  </div>;
}
