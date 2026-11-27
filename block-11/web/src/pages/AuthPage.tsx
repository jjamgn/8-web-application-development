import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, errorMessage } from '../api';
import { safeReturnTo, useAuth } from '../auth';
import { Notice } from '../components';

export function AuthPage({ register = false }: { register?: boolean }) {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email')).trim().toLowerCase();
    const password = String(form.get('password'));
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    setError('');
    if (register && (!name || [...name].length > 120)) { setError('Tên cần có từ 1 đến 120 ký tự.'); return; }
    if (register && ([...password].length < 8 || new TextEncoder().encode(password).length > 72)) {
      setError('Mật khẩu cần ít nhất 8 ký tự và tối đa 72 bytes UTF-8.'); return;
    }
    if (register && password !== confirmPassword) { setError('Xác nhận mật khẩu chưa khớp.'); return; }
    lock.current = true; setBusy(true);
    try {
      if (register) {
        await api.register({ name, email, password, confirmPassword });
        navigate(`/login?registered=1&returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      } else { setUser(await api.login(email, password)); navigate(returnTo, { replace: true }); }
    } catch (e) { setError(errorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  const suffix = `?returnTo=${encodeURIComponent(returnTo)}`;
  return <section className="auth-layout" key={register ? 'register' : 'login'}>
    <div className="auth-intro"><p className="eyebrow">KHÔNG GIAN CỦA BẠN</p><h1>{register ? 'Bắt đầu bằng một khoảnh khắc.' : 'Chào mừng bạn trở lại.'}</h1><p>Lưu lại điều bạn thấy. Chia sẻ điều bạn yêu.</p><div className="abstract-frame" aria-hidden="true"><span /></div></div>
    <div className="form-card"><h2>{register ? 'Tạo tài khoản' : 'Đăng nhập'}</h2><p className="muted">Bạn luôn có thể <Link to="/photos">xem thư viện</Link> mà không cần tài khoản.</p>
      {!register && params.get('registered') === '1' && <Notice>Đăng ký thành công. Hãy đăng nhập để tiếp tục.</Notice>}
      {error && <Notice error>{error}</Notice>}
      <form onSubmit={submit} key={register ? 'register' : 'login'}>
        <fieldset disabled={busy}>
          {register && <label>Tên hiển thị<input name="name" autoComplete="name" required /></label>}
          <label>Email<input name="email" type="email" autoComplete="username" required /></label>
          <label>Mật khẩu<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required aria-describedby={register ? 'password-help' : undefined} /></label>
          {register && <><p className="field-help" id="password-help">Ít nhất 8 ký tự, tối đa 72 bytes UTF-8.</p><label>Xác nhận mật khẩu<input name="confirmPassword" type="password" autoComplete="new-password" required /></label></>}
          <button className="button full-width" type="submit">{busy ? 'Đang xử lý…' : register ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
        </fieldset>
      </form>
      <p className="auth-switch">{register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <Link to={`${register ? '/login' : '/register'}${suffix}`} onClick={() => setError('')}>{register ? 'Đăng nhập' : 'Đăng ký'}</Link></p>
    </div>
  </section>;
}
