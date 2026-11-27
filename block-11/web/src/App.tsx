import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, type Location } from 'react-router';
import { api, errorMessage, RequestError } from './api';
import { feeds } from './lib/gallery-cache';
import { photoUrl } from './lib/photo-url';
import { useAuth } from './auth';
import { Loading, NotFound, Notice } from './components';
import { AuthPage } from './pages/AuthPage';
import { Gallery } from './pages/Gallery';
import { PhotoDetail } from './pages/PhotoDetail';
import { ProfilePage } from './pages/ProfilePage';
import { UploadPage } from './pages/UploadPage';

function ProtectedUpload() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (auth.error) return <Notice error>{auth.error} <button onClick={() => void auth.refresh()}>Kiểm tra lại phiên</button></Notice>;
  return auth.user ? <UploadPage /> : <Navigate to="/login?returnTo=/photos/upload" replace />;
}

function Following() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (auth.error) return <Notice error>{auth.error}</Notice>;
  return auth.user ? <Gallery key={auth.user.id} filter={{ following: 'true' }} /> : <Navigate to="/login?returnTo=/following" replace />;
}
function HeaderIdentity({ id, name }: { id: string; name: string }) {
  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const update = (e?: Event) => { if (e && (e as CustomEvent<string>).detail !== '') return; void api.user(id).then(p => { if (active) setAvatar(p.avatarUrl); }).catch(() => {}); };
    update(); window.addEventListener('social-feed-change', update);
    return () => { active = false; window.removeEventListener('social-feed-change', update); };
  }, [id]);
  return <NavLink to="/profile" className="current-user">{avatar && <img className="header-avatar" src={avatar} alt="" />}{name}</NavLink>;
}
function PhotoOverlay() {
  const { id } = useParams();
  const content = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDialogElement>(null), navigate = useNavigate(), location = useLocation();
  useEffect(() => {
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const opener = document.activeElement, dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = previous; if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  const items = feeds.get(location.state?.feedKey)?.items ?? [];
  const index = items.findIndex(item => item.id === id);
  const move = (step: number) => { const next = items[index + step]; if (index >= 0 && next) navigate(photoUrl(next), { replace: true, state: location.state }); };
  useEffect(() => { content.current?.scrollTo(0, 0); }, [location.pathname]);
  return <dialog ref={ref} className="photo-modal" aria-label="Chi tiết ảnh" onCancel={e => { if (e.target !== e.currentTarget) return; e.preventDefault(); navigate(-1); }}>
    <button className="modal-close modal-control" aria-label="Đóng chi tiết ảnh" onClick={() => navigate(-1)}><svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="m5 5 14 14M19 5 5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
    {items.length > 1 && <nav className="modal-photo-nav" aria-label="Chuyển ảnh">
      <button className="modal-previous modal-control" aria-label="Ảnh trước" disabled={index <= 0} onClick={() => move(-1)}><svg aria-hidden="true" width="28" height="36" viewBox="0 0 24 32" fill="none"><path d="M17 4 5 16l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      <button className="modal-next modal-control" aria-label="Ảnh tiếp" disabled={index < 0 || index >= items.length - 1} onClick={() => move(1)}><svg aria-hidden="true" width="28" height="36" viewBox="0 0 24 32" fill="none"><path d="m7 4 12 12L7 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    </nav>}
    <div className="photo-modal-panel"><div className="photo-modal-content" ref={content}><PhotoDetail modal key={location.pathname} /></div></div>
  </dialog>;
}

export default function App() {
  const location = useLocation();
  const initialKey = useRef(location.key);
  const background = location.key !== initialKey.current ? location.state?.background as Location | undefined : undefined;
  const isPhoto = /^\/photos\/(?:[^/]+\/)?[0-9a-f-]{36}$/.test(location.pathname);
  const modal = !!background && isPhoto && (['/photos', '/profile', '/following'].includes(background.pathname) || /^\/users\/[0-9a-f-]{36}$/.test(background.pathname));
  const { user, setUser, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function logout() {
    if (busy) return;
    setBusy(true); setError('');
    try { await api.logout(); setUser(null); navigate('/photos'); }
    catch (e) {
      if (e instanceof RequestError && e.status === 401) { setUser(null); navigate('/photos'); }
      else setError(errorMessage(e));
    } finally { setBusy(false); }
  }
  return <>
    <a className="skip-link" href="#main">Đến nội dung chính</a>
    <header className="site-header"><div className="shell header-inner">
      <Link className="brand" to="/photos" aria-label="Khoảnh khắc — thư viện ảnh"><span className="brand-symbol" aria-hidden="true">◈</span> khoảnh khắc<span className="brand-dot">.</span></Link>
      <nav aria-label="Điều hướng chính">
        <NavLink to="/photos" end>Thư viện</NavLink>
        <NavLink to="/photos/upload" className="nav-upload">Đăng ảnh</NavLink>
        {user ? <><HeaderIdentity id={user.id} name={user.name} /><button className="text-button" disabled={busy} onClick={() => void logout()}>{busy ? 'Đang thoát…' : 'Đăng xuất'}</button></>
          : !loading && <NavLink to="/login">Đăng nhập</NavLink>}
      </nav>
    </div></header>
    <main id="main" className="shell" tabIndex={-1}>
      {error && <Notice error>{error}</Notice>}
      <Routes location={modal ? background : location}>
        <Route path="/" element={<Navigate to="/photos" replace />} />
        <Route path="/photos" element={<Gallery />} />
        <Route path="/profile" element={<ProfilePage own />} />
        <Route path="/users/:id" element={<ProfilePage />} />
        <Route path="/following" element={<Following />} />
        <Route path="/photos/upload" element={<ProtectedUpload />} />
        <Route path="/photos/:id" element={<PhotoDetail />} />
        <Route path="/photos/:slug/:id" element={<PhotoDetail />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage register />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {modal && <Routes location={location}><Route path="/photos/:id" element={<PhotoOverlay />} /><Route path="/photos/:slug/:id" element={<PhotoOverlay />} /></Routes>}
    </main>
    <footer className="shell site-footer"><span>Khoảnh khắc · Photo Gallery</span><span>Mỗi bức ảnh, một câu chuyện.</span></footer>
  </>;
}
