import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { resources } from '../config/resources';
import type { Resource } from '../types';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';

export default function Layout() {
  const { pathname } = useLocation();
  const { user, loading, logout } = useAuth();
  const [logoutError, setLogoutError] = useState('');
  const admin = pathname.startsWith('/admin');
  useEffect(() => {
    document.body.classList.toggle('admin-body', admin);
    return () => document.body.classList.remove('admin-body');
  }, [admin]);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  async function handleLogout() {
    setLogoutError('');
    try {
      await logout();
    } catch (error) {
      setLogoutError(`Chưa xác nhận được việc thu hồi phiên: ${errorMessage(error)}`);
    }
  }
  return <>
    <header className="site-header">
      <Link className="brand" to="/dishes" aria-label="Bếp Nhà — thực đơn"><span className="brand-mark">b.</span><span>Bếp Nhà<small>VIETNAMESE KITCHEN</small></span></Link>
      <nav aria-label="Điều hướng chính"><NavLink to="/dishes">Thực đơn</NavLink><NavLink to="/explore">Khám phá món</NavLink><NavLink to="/admin/dishes" className={() => admin ? 'active' : ''}>Quản trị</NavLink></nav>
      <div className="header-account">
        {logoutError && <span className="account-error" role="alert">{logoutError}</span>}
        {loading ? <span>Đang kiểm tra phiên…</span> : user ? <>
          <Link className="account-profile" to="/profile" title="Xem hồ sơ cá nhân">{user.name || 'Tài khoản'}</Link>
          <button type="button" onClick={() => void handleLogout()}>Đăng xuất</button>
        </> : <>
          <Link to="/login">Đăng nhập</Link>
          <Link to="/register">Đăng ký</Link>
        </>}
      </div>
    </header>
    {admin ? <div className="admin-layout"><aside className="admin-nav" aria-label="Quản trị tài nguyên"><div className="admin-nav-title">KHÔNG GIAN QUẢN TRỊ</div>
      {(Object.keys(resources) as Resource[]).map(key => <NavLink key={key} to={`/admin/${key}`} className={({ isActive }) => isActive ? 'selected' : ''}><span aria-hidden="true">{resources[key].icon}</span>{resources[key].label}</NavLink>)}
      <div className="admin-nav-bottom"><p>Một căn bếp ngăn nắp,<br />một trải nghiệm trọn vẹn.</p><Link to="/dishes">← Xem trang thực đơn</Link></div>
    </aside><main className="admin-main"><Outlet /></main></div> : <Outlet />}
    <footer id="our-story"><div><Link className="footer-brand" to="/dishes">Bếp Nhà<span aria-hidden="true">✳</span></Link><p>Món ngon từ những điều giản dị.<br />Một căn bếp, thật nhiều yêu thương.</p></div>
      <div><small>CHUYỆN CỦA BẾP</small><p>Chúng mình tin rằng một bữa ăn ngon bắt đầu<br />từ nguyên liệu tươi và sự chăm chút mỗi ngày.</p></div>
      <div className="footer-end"><small>HẸN BẠN Ở BẾP</small><p>Thưởng thức chậm. Cảm nhận nhiều.</p><span>© {new Date().getFullYear()} Bếp Nhà · Vietnamese Kitchen</span></div>
    </footer>
  </>;
}
