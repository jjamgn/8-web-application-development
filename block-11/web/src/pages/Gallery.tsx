import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { api, errorMessage } from '../api';
import { Notice, PhotoImage, SkeletonGrid } from '../components';
import { PhotoActions } from '../PhotoActions';
import { photoUrl } from '../lib/photo-url';
import { useAuth } from '../auth';
import { feeds, type Feed } from '../lib/gallery-cache';
import type { User } from '../types';

export function Gallery({ profile, filter = {}, heading, compact = false }: { profile?: User; filter?: Record<string, string>; heading?: string; compact?: boolean }) {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const selection = { ...filter, ...(profile ? { mine: 'true' } : {}), ...(q ? { q } : {}) };
  const key = 'feed:' + JSON.stringify(selection);
  return <FeedView key={key} cacheKey={key} profile={profile} filter={selection} heading={heading} compact={compact} />;
}
function FeedView({ cacheKey: key, profile, filter, heading, compact }: { cacheKey: string; profile?: User; filter: Record<string, string>; heading?: string; compact: boolean }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [, setParams] = useSearchParams();
  const rawPage = params.get('page');
  const invalidPage = rawPage !== null && (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(Number(rawPage)));
  const [data, setData] = useState<Feed | null>(() => feeds.get(key) ?? null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useLayoutEffect(() => {
    const saved = feeds.get(key);
    window.scrollTo(0, saved?.scroll ?? 0);
  }, [key]);
  useEffect(() => {
    const save = () => { const value = feeds.get(key); if (value) value.scroll = window.scrollY; };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [key]);
  useEffect(() => {
    if (invalidPage || feeds.has(key)) return;
    const controller = new AbortController();
    setBusy(true); setError('');
    api.list(1, controller.signal, filter).then(result => {
      const next = { ...result, scroll: 0 }; feeds.set(key, next); setData(next);
    }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [key, retry, invalidPage]);
  useEffect(() => {
    const changed = (event: Event) => {
      const kind = (event as CustomEvent<string>).detail;
      for (const entry of feeds.keys()) if (entry.includes(kind)) feeds.delete(entry);
      if (key.includes(kind)) { setData(null); setRetry(n => n + 1); }
    };
    window.addEventListener('social-feed-change', changed);
    return () => window.removeEventListener('social-feed-change', changed);
  }, [key]);
  async function more() {
    if (lock.current || !data) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await api.list(data.page + 1, undefined, filter);
      if (!feeds.has(key)) return; // A mutation/logout invalidated this in-flight feed.
      const seen = new Set(data.items.map(p => p.id));
      const next = { ...result, items: [...data.items, ...result.items.filter(p => !seen.has(p.id))], scroll: feeds.get(key)?.scroll ?? 0 };
      feeds.set(key, next); setData(next);
    } catch (e) { setError(errorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section>
    {!compact && (profile ? <div className="profile-heading"><div className="profile-avatar" aria-hidden="true">{Array.from(profile.name.trim())[0]?.toUpperCase()}</div><div><p className="eyebrow">HỒ SƠ CỦA BẠN</p><h1>{profile.name}</h1><p className="intro">Những khoảnh khắc bạn đã chia sẻ.</p></div><Link to="/photos/upload" className="button">Đăng ảnh mới</Link></div>
      : <div className="gallery-heading"><div><p className="eyebrow">GÓC NHÌN ĐƯỢC CHIA SẺ</p><h1>Những điều đáng giữ<span className="accent">.</span></h1><p className="intro">Một khung hình, một câu chuyện. Khám phá những khoảnh khắc qua góc nhìn của mọi người.</p></div><Link to="/photos/upload" className="button">Đăng ảnh của bạn</Link></div>)}
    {!compact && <form className="search-bar" role="search" onSubmit={e => { e.preventDefault(); const next = new URLSearchParams(location.search); if (search.trim()) next.set('q', search.trim()); else next.delete('q'); next.delete('page'); setParams(next); }}><label className="sr-only" htmlFor="photo-search">Tìm ảnh</label><input id="photo-search" type="search" value={search} maxLength={120} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tiêu đề, mô tả, người đăng…" /><button className="button">Tìm kiếm</button></form>}
    {!compact && user && <div className="feed-tabs"><Link to="/photos">Khám phá</Link><Link to="/following">Đang theo dõi</Link></div>}
    {location.state?.deletion && <Notice>{location.state.deletion === 'pending' ? 'Ảnh đã được ẩn khỏi thư viện và đang chờ dọn dữ liệu.' : 'Đã xóa ảnh và dọn dữ liệu thành công.'}</Notice>}
    <div className="section-bar"><h2>{heading ?? (profile ? 'Ảnh của bạn' : filter.following ? 'Ảnh từ người bạn theo dõi' : filter.q ? 'Kết quả tìm kiếm' : 'Thư viện ảnh')}</h2><span>{data ? data.total + ' bức ảnh · Mới nhất trước' : 'Mới nhất trước'}</span></div>
    {invalidPage ? <Notice error>Số trang phải là số nguyên dương.</Notice> : <>
      {data?.items.length ? <div className="photo-grid">{data.items.map(photo => <article className="photo-card" key={photo.id}>
        <div className="photo-frame">
          <Link to={photoUrl(photo)} state={{ background: location, feedKey: key, from: location.pathname + location.search }} className="photo-link"><PhotoImage photo={photo} /></Link>
          <PhotoActions photo={photo} collectionId={filter.collection} />
        </div>
        <Link className="photo-title-link" to={photoUrl(photo)} state={{ background: location, feedKey: key, from: location.pathname + location.search }}><div className="card-caption"><h3>{photo.title}</h3></div></Link>
        <Link className="card-author" to={'/users/' + photo.uploader.id}>{photo.uploader.name}</Link>
      </article>)}</div> : data && <div className="empty-state"><span aria-hidden="true" className="empty-icon">▧</span><h3>{profile ? 'Bạn chưa chia sẻ ảnh nào' : filter.q ? 'Không tìm thấy ảnh phù hợp' : filter.following ? 'Chưa có ảnh từ người bạn theo dõi' : filter.favorites ? 'Bạn chưa yêu thích ảnh nào' : filter.collection ? 'Bộ sưu tập chưa có ảnh' : 'Thư viện đang chờ khoảnh khắc đầu tiên'}</h3><p>Chia sẻ một bức ảnh và kể câu chuyện của bạn.</p><Link className="button secondary" to="/photos/upload">Đăng ảnh đầu tiên</Link></div>}
      {busy && <SkeletonGrid count={12} />}
      {error && <Notice error>{error} <button disabled={busy} onClick={() => data ? void more() : setRetry(v => v + 1)}>Thử lại</button></Notice>}
      {data && <div className="load-more"><p role="status">Đã hiển thị {data.items.length}/{data.total} ảnh</p>{data.page < data.totalPages && <button className="button secondary" disabled={busy} onClick={() => void more()}>{busy ? 'Đang tải ảnh…' : 'Xem thêm ảnh'}</button>}</div>}
    </>}
  </section>;
}
