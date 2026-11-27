import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, errorMessage } from './api';
import { useAuth } from './auth';
import { Notice } from './components';
import { photoUrl, refreshSocialFeed } from './lib/photo-url';
import type { PhotoDto } from './types';
import type { CollectionDto } from '../../contracts/index.js';

export function PhotoActions({ photo, detail = false, collectionId }: { photo: PhotoDto; detail?: boolean; collectionId?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<{ likes: number; liked: boolean } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [collections, setCollections] = useState<CollectionDto[]>([]);
  const [title, setTitle] = useState('');
  const [width, setWidth] = useState(Math.max(...photo.variants.map(v => v.width)));
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const activityRevision = useRef(0);
  useEffect(() => {
    let active = true; setActivity(null);
    const update = () => { if (detail || user) void api.activity(photo.id).then(data => { if (active) setActivity(data); }).catch(() => {}); };
    const changed = (e: Event) => { if ((e as CustomEvent<string>).detail === 'favorites') update(); };
    update(); window.addEventListener('social-feed-change', changed);
    return () => { active = false; window.removeEventListener('social-feed-change', changed); };
  }, [photo.id, user?.id, detail]);
  function authenticated() {
    if (user) return true;
    navigate('/login?returnTo=' + encodeURIComponent(photoUrl(photo))); return false;
  }
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(errorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function like() {
    if (!authenticated()) return;
    activityRevision.current++;
    await action(async () => {
      const old = activity ?? await api.activity(photo.id);
      await api.favorite(photo.id, old.liked);
      setActivity({ liked: !old.liked, likes: Math.max(0, old.likes + (old.liked ? -1 : 1)) });
      refreshSocialFeed('favorites');
    });
  }
  async function save() {
    if (!authenticated()) return;
    await action(async () => { setCollections(await api.collections()); dialog.current?.showModal(); });
  }
  return <div className={'photo-actions' + (detail ? ' detail-actions' : ' card-actions')}>
    <div className="action-buttons">
      <div className="quick-actions">
      <button className="button secondary action-button" disabled={busy} aria-label={activity?.liked ? 'Bỏ yêu thích' : 'Yêu thích'} aria-pressed={activity?.liked ?? false} onClick={() => void like()}><svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill={activity?.liked ? "currentColor" : "none"}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>{detail && <span> {activity?.likes ?? 'Yêu thích'}</span>}</button>
      <button className="button secondary action-button" disabled={busy} aria-label="Lưu vào bộ sưu tập" title="Lưu vào bộ sưu tập" onClick={() => void save()}><svg aria-hidden="true" width="16" height="18" viewBox="0 0 16 18" fill="none"><path d="M3 2h10v14l-5-3-5 3V2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg><span className="sr-only">Lưu</span></button>
      </div>
      <div className="download-actions">
      {detail && <label className="download-size"><span className="sr-only">Kích thước tải xuống</span><select aria-label="Kích thước tải xuống" value={width} onChange={e => setWidth(Number(e.target.value))}>{photo.variants.map(v => <option key={v.width} value={v.width}>{v.width} × {v.height}</option>)}</select></label>}
      <a className="button secondary action-button" href={'/media/photos/' + photo.id + '/' + (detail ? width : Math.max(...photo.variants.map(v => v.width))) + '.webp?download=1'} download><span>Tải WebP</span></a>
      </div>
      {collectionId && <button className="button secondary remove-from-collection" disabled={busy} onClick={() => void action(async () => { await api.collect(collectionId, photo.id, true); refreshSocialFeed('collection'); })}>Gỡ khỏi bộ</button>}
    </div>
    {error && <Notice error>{error}</Notice>}
    {notice && <Notice>{notice}</Notice>}
    <dialog ref={dialog} className="collection-dialog" aria-label="Lưu vào bộ sưu tập" onCancel={e => { if (lock.current) e.preventDefault(); }}>
      <h2>Lưu vào bộ sưu tập</h2><p>Bộ sưu tập chỉ mình bạn xem được.</p>
      {error && <Notice error>{error}</Notice>}
      <div className="collection-choices">{collections.map(c => <button className="button secondary" key={c.id} disabled={busy} onClick={() => void action(async () => { await api.collect(c.id, photo.id); refreshSocialFeed('collection'); setNotice('Đã lưu vào “' + c.title + '”.'); dialog.current?.close(); })}>{c.title} · {c.count}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); void action(async () => { const created = await api.createCollection(title.trim()); setCollections(await api.collections()); setTitle(''); await api.collect(created.id, photo.id); refreshSocialFeed('collection'); setNotice('Đã tạo bộ sưu tập và lưu ảnh.'); dialog.current?.close(); }); }}>
        <label>Tên bộ sưu tập mới<input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required /></label>
        <button className="button" disabled={busy || !title.trim()}>Tạo và lưu ảnh</button>
      </form>
      <button className="text-button" disabled={busy} onClick={() => { dialog.current?.close(); setError(''); }}>Đóng</button>
    </dialog>
  </div>;
}
