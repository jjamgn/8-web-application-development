import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { invalidateFeeds } from '../lib/gallery-cache';
import { api, errorMessage, RequestError } from '../api';
import { useAuth } from '../auth';
import { Loading, NotFound, Notice, PhotoImage } from '../components';
import type { PhotoDto } from '../types';

export function PhotoDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const back = location.state?.from === '/profile' ? '/profile' : '/photos';
  const { user, setUser } = useAuth();
  const [photo, setPhoto] = useState<PhotoDto | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [deleteError, setDeleteError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    setPhoto(null); setError(''); setMissing(false); setDeleteError('');
    const controller = new AbortController();
    api.photo(id, controller.signal).then(setPhoto).catch(e => {
      if (controller.signal.aborted) return;
      if (e instanceof RequestError && e.status === 404) setMissing(true); else setError(errorMessage(e));
    });
    return () => controller.abort();
  }, [id, retry]);
  async function remove() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setDeleteError('');
    try {
      const { status } = await api.remove(id);
      invalidateFeeds();
      dialog.current?.close();
      navigate('/photos', { replace: true, state: { deletion: status === 202 ? 'pending' : 'done' } });
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) setUser(null);
      setDeleteError(`${errorMessage(e)} Nếu kết nối bị gián đoạn, kiểm tra thư viện trước khi thử xóa lại.`);
    } finally { lock.current = false; setBusy(false); }
  }
  if (missing) return <NotFound />;
  if (error) return <Notice error>{error} <button onClick={() => setRetry(v => v + 1)}>Thử lại</button></Notice>;
  if (!photo) return <Loading />;
  return <article className="detail">
    <Link className="back-link" to={back}>{back === "/profile" ? "Về hồ sơ" : "Về thư viện"}</Link>
    <div className="detail-heading"><div><p className="eyebrow">MỘT KHOẢNH KHẮC ĐƯỢC LƯU GIỮ</p><h1>{photo.title}</h1><p className="muted">Ảnh của <strong>{photo.uploader.name}</strong> · <time dateTime={photo.createdAt}>{new Date(photo.createdAt).toLocaleDateString('vi-VN')}</time></p></div>
      {user?.id === photo.uploader.id && <button className="button danger-outline" onClick={() => { setDeleteError(''); dialog.current?.showModal(); }}>Xóa ảnh</button>}
    </div>
    <div className="detail-image"><PhotoImage photo={photo} detail /></div>
    <p className="image-description">{photo.alt}</p>
    <dialog ref={dialog} onCancel={e => { if (lock.current) e.preventDefault(); }} aria-labelledby="delete-title" aria-describedby="delete-description">
      <h2 id="delete-title">Xóa bức ảnh này?</h2><p id="delete-description">“{photo.title}” sẽ được gỡ khỏi thư viện. Thao tác này không thể hoàn tác.</p>
      {deleteError && <Notice error>{deleteError}</Notice>}
      <div className="dialog-actions"><button className="button secondary" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>Hủy</button><button className="button danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Đang xóa…' : 'Xác nhận xóa'}</button></div>
    </dialog>
  </article>;
}
