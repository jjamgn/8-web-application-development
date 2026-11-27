import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, type Location } from 'react-router';
import { api, errorMessage, RequestError } from './api';
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
  const ref = useRef<HTMLDialogElement>(null), navigate = useNavigate(), location = useLocation();
  useEffect(() => {
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const opener = document.activeElement, dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = previous; if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="photo-modal" aria-label="Chi tiết ảnh" onCancel={e => { if (e.target !== e.currentTarget) return; e.preventDefault(); navigate(-1); }}>
    <button className="modal-close button secondary" aria-label="Đóng chi tiết ảnh" onClick={() => navigate(-1)}>×</button>
    <PhotoDetail modal key={location.pathname} />
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
