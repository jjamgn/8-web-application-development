import { Link } from 'react-router-dom';
import { ApiError, errorMessage } from '../lib/api';

interface Props { status?: string; error?: unknown; empty?: boolean; onRetry?: () => void }
export default function PageState({ status, error, empty, onRetry }: Props) {
  if (status === 'loading' || status === 'idle') return <div className="page-state" role="status"><span className="loading-mark" aria-hidden="true">✳</span><p>Đang chuẩn bị từ căn bếp…</p></div>;
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
