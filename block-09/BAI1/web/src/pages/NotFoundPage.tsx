import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return <section className="error-page"><span className="error-flower" aria-hidden="true">✳</span><h1>Không tìm thấy trang</h1><p>Địa chỉ bạn tìm chưa có trong căn bếp. Hãy quay lại thực đơn nhé.</p><Link className="button primary" to="/dishes">Về thực đơn</Link></section>;
}
