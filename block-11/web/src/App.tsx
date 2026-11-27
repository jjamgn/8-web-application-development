import { useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import { api, errorMessage, RequestError } from './api';
import { useAuth } from './auth';
import { Loading, NotFound, Notice } from './components';
import { AuthPage } from './pages/AuthPage';
import { Gallery } from './pages/Gallery';
import { PhotoDetail } from './pages/PhotoDetail';
import { UploadPage } from './pages/UploadPage';

function ProtectedUpload() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (auth.error) return <Notice error>{auth.error} <button onClick={() => void auth.refresh()}>Kiểm tra lại phiên</button></Notice>;
  return auth.user ? <UploadPage /> : <Navigate to="/login?returnTo=/photos/upload" replace />;
}

function Profile() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (auth.error) return <Notice error>{auth.error} <button onClick={() => void auth.refresh()}>Thử lại</button></Notice>;
  return auth.user ? <Gallery key={auth.user.id} profile={auth.user} /> : <Navigate to="/login" replace />;
}

export default function App() {
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
        {user ? <><NavLink to="/profile" className="current-user">{user.name}</NavLink><button className="text-button" disabled={busy} onClick={() => void logout()}>{busy ? 'Đang thoát…' : 'Đăng xuất'}</button></>
          : !loading && <NavLink to="/login">Đăng nhập</NavLink>}
      </nav>
    </div></header>
    <main id="main" className="shell" tabIndex={-1}>
      {error && <Notice error>{error}</Notice>}
      <Routes>
        <Route path="/" element={<Navigate to="/photos" replace />} />
        <Route path="/photos" element={<Gallery />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/photos/upload" element={<ProtectedUpload />} />
        <Route path="/photos/:id" element={<PhotoDetail />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage register />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
    <footer className="shell site-footer"><span>Khoảnh khắc · Photo Gallery</span><span>Mỗi bức ảnh, một câu chuyện.</span></footer>
  </>;
}
