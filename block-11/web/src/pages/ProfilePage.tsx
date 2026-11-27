import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { api, errorMessage, RequestError } from '../api';
import { useAuth } from '../auth';
import { Loading, NotFound, Notice } from '../components';
import { Gallery } from './Gallery';
import { refreshSocialFeed } from '../lib/photo-url';
import type { PublicProfile, CollectionDto } from '../../../contracts/index.js';

export function ProfilePage({ own = false }: { own?: boolean }) {
  const { user, loading: authLoading, error: authError, setUser } = useAuth();
  const { id: routeId } = useParams();
  const id = own ? user?.id : routeId;
  const [params] = useSearchParams();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    setProfile(null); setError(''); setMissing(false); setEditing(false);
    if (!id) return;
    const abort = new AbortController();
    api.user(id, abort.signal).then(p => { setProfile(p); setName(p.name); setBio(p.bio); }).catch(e => {
      if (abort.signal.aborted) return;
      if (e instanceof RequestError && e.status === 404) setMissing(true); else setError(errorMessage(e));
    });
    return () => abort.abort();
  }, [id, retry, user?.id]);
  useEffect(() => {
    if (!avatar) { setPreview(''); return; }
    const url = URL.createObjectURL(avatar); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !profile) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (avatar && (avatar.size > 10_485_760 || !['image/jpeg', 'image/png'].includes(avatar.type))) throw new Error('Avatar cần JPEG hoặc PNG, tối đa 10 MiB.');
      const updated = await api.updateProfile(name.trim(), bio.trim());
      setProfile(old => old ? { ...old, ...updated } : old);
      setUser({ id: updated.id, name: updated.name });
      if (avatar) {
        const uploaded = await api.avatar(avatar);
        setProfile(old => old ? { ...old, ...uploaded } : old); setAvatar(null);
      }
      refreshSocialFeed(''); setEditing(false);
    } catch (e) { setError(errorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function follow() {
    if (lock.current || !profile) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await api.follow(profile.id, profile.isFollowing);
      setProfile({ ...profile, isFollowing: !profile.isFollowing, followers: profile.followers + (profile.isFollowing ? -1 : 1) });
      refreshSocialFeed('following');
    } catch (e) { setError(errorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  if (own && authLoading) return <Loading />;
  if (own && authError) return <Notice error>{authError}</Notice>;
  if (own && !user) return <Navigate to="/login?returnTo=/profile" replace />;
  if (missing) return <NotFound />;
  if (!profile && error) return <Notice error>{error} <button onClick={() => setRetry(n => n + 1)}>Thử lại</button></Notice>;
  if (!profile) return <Loading />;
  const mine = user?.id === profile.id;
  const tab = params.get('tab') ?? 'photos';
  const collection = params.get('collection');
  return <section>
    <div className="profile-heading">
      <div className="profile-avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt={'Ảnh đại diện ' + profile.name} /> : <span aria-hidden="true">{Array.from(profile.name)[0]?.toUpperCase()}</span>}</div>
      <div className="profile-info"><p className="eyebrow">{own ? 'KHÔNG GIAN CỦA BẠN' : 'NGƯỜI CHIA SẺ KHOẢNH KHẮC'}</p><h1>{profile.name}</h1><p className="profile-bio">{profile.bio || 'Mỗi bức ảnh, một câu chuyện.'}</p><p className="profile-stats">{profile.photoCount} ảnh · {profile.followers} người theo dõi · Đang theo dõi {profile.following}</p></div>
      {mine ? <div className="profile-buttons">{!own && <Link className="button secondary" to="/profile">Quản lý hồ sơ</Link>}<button className="button secondary" onClick={() => setEditing(!editing)} disabled={busy}>Chỉnh sửa hồ sơ</button></div>
        : user ? <button className="button" disabled={busy} onClick={() => void follow()}>{profile.isFollowing ? 'Bỏ theo dõi' : 'Theo dõi'}</button> : <Link className="button" to={'/login?returnTo=/users/' + profile.id}>Đăng nhập để theo dõi</Link>}
    </div>
    {error && <Notice error>{error}</Notice>}
    {editing && mine && <form className="profile-editor" onSubmit={save}>
      <h2>Chỉnh sửa hồ sơ</h2><p>Tên, giới thiệu và avatar sẽ hiển thị công khai.</p>
      <fieldset disabled={busy}>
        <label>Tên hiển thị<input value={name} onChange={e => setName(e.target.value)} maxLength={120} required /></label>
        <label>Giới thiệu<textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={300} rows={3} /></label>
        <label>Ảnh đại diện<input aria-label="Chọn avatar" type="file" accept="image/jpeg,image/png" onChange={e => setAvatar(e.target.files?.[0] ?? null)} /></label>
        <p className="field-help">JPEG/PNG, tối đa 10 MiB. Ảnh được cắt vuông ở giữa, tối đa 512px và bỏ EXIF/GPS trên máy chủ.</p>
        {preview && <img className="avatar-preview" src={preview} alt="Xem trước avatar mới" />}
        <button className="button" disabled={busy}>{busy ? 'Đang lưu hồ sơ…' : 'Lưu thay đổi'}</button><button type="button" className="text-button" onClick={() => { setEditing(false); setAvatar(null); setName(profile.name); setBio(profile.bio); }}>Hủy</button>
      </fieldset>
    </form>}
    {own && <nav className="feed-tabs" aria-label="Nội dung hồ sơ"><Link aria-current={tab === 'photos' && !collection ? 'page' : undefined} to="/profile">Ảnh của bạn</Link><Link aria-current={tab === 'favorites' ? 'page' : undefined} to="/profile?tab=favorites">Yêu thích</Link><Link aria-current={tab === 'collections' || collection ? 'page' : undefined} to="/profile?tab=collections">Bộ sưu tập</Link><Link to={'/users/' + profile.id}>Xem hồ sơ công khai</Link></nav>}
    {own && tab === 'collections' && !collection ? <Collections /> : <Gallery compact heading={collection ? 'Ảnh trong bộ sưu tập riêng tư' : own && tab === 'favorites' ? 'Ảnh yêu thích' : mine ? 'Ảnh của bạn' : 'Ảnh đã chia sẻ'} filter={collection && own ? { collection } : own && tab === 'favorites' ? { favorites: 'true' } : { user: profile.id }} />}
  </section>;
}

function Collections() {
  const [items, setItems] = useState<CollectionDto[] | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; api.collections().then(data => { if (active) setItems(data); }).catch(e => { if (active) setError(errorMessage(e)); }); return () => { active = false; }; }, [retry]);
  async function change(work: () => Promise<unknown>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await work(); setItems(await api.collections()); refreshSocialFeed('collection'); } catch (e) { setError(errorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="collections-page"><h2>Bộ sưu tập riêng tư</h2><p>Chỉ bạn xem được các bộ này. Xóa bộ sưu tập không xóa ảnh gốc.</p>
    {error && <Notice error>{error} <button onClick={() => { setError(''); setRetry(n => n + 1); }}>Thử tải lại</button></Notice>}
    <form className="search-bar" onSubmit={e => { e.preventDefault(); void change(async () => { await api.createCollection(title.trim()); setTitle(''); }); }}><input aria-label="Tên bộ sưu tập" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required placeholder="Tên bộ sưu tập mới" /><button className="button" disabled={busy}>Tạo bộ sưu tập</button></form>
    {!items ? !error && <Loading /> : !items.length ? <Notice>Bạn chưa có bộ sưu tập. Tạo bộ rồi dùng nút Lưu trên ảnh để thêm vào.</Notice> : <div className="collection-grid">{items.map(c => <article className="collection-card" key={c.id}><span aria-hidden="true">▧</span><h3><Link to={'/profile?collection=' + c.id}>{c.title}</Link></h3><p>{c.count} ảnh · Riêng tư</p>
      {editing === c.id ? <form onSubmit={e => { e.preventDefault(); void change(async () => { await api.renameCollection(c.id, newTitle.trim()); setEditing(null); }); }}><input aria-label="Tên mới" value={newTitle} onChange={e => setNewTitle(e.target.value)} maxLength={120} required /><button className="button secondary" disabled={busy}>Lưu tên</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Hủy</button></form> : <button className="text-button" disabled={busy} onClick={() => { setEditing(c.id); setNewTitle(c.title); }}>Đổi tên</button>}
      <button className="text-button" disabled={busy} onClick={() => { if (window.confirm('Xóa bộ “' + c.title + '”? Ảnh gốc vẫn được giữ.')) void change(() => api.deleteCollection(c.id)); }}>Xóa bộ</button>
    </article>)}</div>}
  </div>;
}
