import { Link } from 'react-router-dom';
import { ApiError, errorMessage } from '../lib/api';
import Skeleton, { type SkeletonVariant } from './Skeleton';

interface Props { status?: string; error?: unknown; empty?: boolean; onRetry?: () => void; loading?: SkeletonVariant; loadingCount?: number; tableColumns?: number }
export default function PageState({ status, error, empty, onRetry, loading = 'content', loadingCount, tableColumns }: Props) {
  if (status === 'loading' || status === 'idle') return <Skeleton variant={loading} count={loadingCount} columns={tableColumns} />;
  if (status === 'error') {
    const notFound = error instanceof ApiError && error.code === 'NOT_FOUND';
    return <div className="page-state" role="alert"><span className="state-symbol" aria-hidden="true">{notFound ? '⌕' : '!'}</span>
      <h2>{notFound ? 'Không tìm thấy thông tin' : 'Chưa thể tải dữ liệu'}</h2>
      <p>{notFound ? 'Thông tin này không còn tồn tại. Bạn có thể quay lại thực đơn hoặc danh sách.' : errorMessage(error)}</p>
      <div className="state-actions">{!notFound && onRetry && <button className="button primary" onClick={onRetry}>Thử lại</button>}<Link className="button outline" to="/dishes">Về thực đơn</Link></div>
    </div>;
  }
  if (empty) return <div className="empty-state" role="status"><span aria-hidden="true">⌕</span><h3>Chưa có kết quả phù hợp</h3><p>Thử một tên khác hoặc thêm dữ liệu mới cho căn bếp.</p></div>;
  return null;
}
