import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { api, errorMessage } from '../api';
import { Loading, Notice, PhotoImage } from '../components';
import type { GalleryData } from '../types';

export function Gallery() {
  const [params] = useSearchParams();
  const location = useLocation();
  const rawPage = params.get('page') ?? '1';
  const page = /^[1-9]\d*$/.test(rawPage) && Number.isSafeInteger(Number(rawPage)) ? Number(rawPage) : null;
  const [data, setData] = useState<GalleryData | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setData(null); setError('');
    if (page === null) { setError('Số trang phải là số nguyên dương.'); return; }
    const controller = new AbortController();
    api.list(page, controller.signal).then(setData).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, [page, retry]);
  return <section>
    <div className="gallery-heading"><div><p className="eyebrow">GÓC NHÌN ĐƯỢC CHIA SẺ</p><h1>Những điều đáng giữ<span className="accent">.</span></h1><p className="intro">Một khung hình, một câu chuyện. Khám phá những khoảnh khắc qua góc nhìn của mọi người.</p></div><Link to="/photos/upload" className="button">Đăng ảnh của bạn</Link></div>
    {location.state?.deletion && <Notice>{location.state.deletion === 'pending' ? 'Ảnh đã được ẩn khỏi thư viện và đang chờ dọn dữ liệu.' : 'Đã xóa ảnh và dọn dữ liệu thành công.'}</Notice>}
    <div className="section-bar"><h2>Thư viện ảnh</h2><span>{data ? `${data.total} bức ảnh · Mới nhất trước` : 'Mới nhất trước'}</span></div>
    {error ? <Notice error>{error} <button onClick={() => setRetry(v => v + 1)}>Thử lại</button></Notice> : !data ? <Loading /> : <>
      {data.items.length ? <div className="photo-grid">{data.items.map(photo => <article className="photo-card" key={photo.id}>
        <Link to={`/photos/${photo.id}`} className="photo-link"><PhotoImage photo={photo} /><div className="card-caption"><h3>{photo.title}</h3><p>{photo.uploader.name}</p></div></Link>
      </article>)}</div> : <div className="empty-state"><span aria-hidden="true" className="empty-icon">▧</span><h3>{data.total === 0 ? 'Thư viện đang chờ khoảnh khắc đầu tiên' : 'Trang này chưa có ảnh'}</h3><p>{data.total === 0 ? 'Chia sẻ một bức ảnh và kể câu chuyện của bạn.' : 'Hãy quay lại trang trước để tiếp tục khám phá.'}</p><Link className="button secondary" to={data.total === 0 ? '/photos/upload' : '/photos'}>{data.total === 0 ? 'Đăng ảnh đầu tiên' : 'Về trang đầu'}</Link></div>}
      {(data.totalPages > 1 || data.page > 1) && <nav className="pagination" aria-label="Phân trang">
        {data.page > 1 && <Link className="button secondary" to={`?page=${Math.max(1, Math.min(data.page - 1, data.totalPages || 1))}`}>Trang trước</Link>}
        <span aria-current="page">Trang {data.page} / {data.totalPages}</span>
        {data.page < data.totalPages && <Link className="button secondary" to={`?page=${data.page + 1}`}>Trang sau</Link>}
      </nav>}
    </>}
  </section>;
}
