import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import CaptchaWidget from './CaptchaWidget';
import { AuthMessage, AuthPage, errorCode, fieldError } from './AuthPage';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/api';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!loading && user) return <Navigate to="/dishes" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const usedCaptcha = Boolean(captchaToken);
    try {
      await login({ email: email.trim(), password, ...(captchaToken ? { captchaToken } : {}) });
      const state = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
      const destination = state?.from?.pathname
        ? `${state.from.pathname}${state.from.search || ''}${state.from.hash || ''}`
        : '/dishes';
      navigate(destination, { replace: true });
    } catch (caught) {
      setError(caught);
      if (errorCode(caught) === 'CAPTCHA_REQUIRED' || errorCode(caught) === 'INVALID_CAPTCHA') {
        setShowCaptcha(true);
      }
    } finally {
      setBusy(false);
      if (usedCaptcha) {
        setCaptchaToken(null);
        setCaptchaReset(value => value + 1);
      }
    }
  }

  return <AuthPage eyebrow="MỪNG BẠN TRỞ LẠI" title="Đăng nhập" description="Đăng nhập để tiếp tục khám phá và quản lý căn bếp của bạn."
    footer={<>Chưa có tài khoản? <Link to="/register">Tạo tài khoản</Link></>}>
    <form className="auth-form" onSubmit={submit}>
      {searchParams.get('reset') === 'success' && <AuthMessage kind="success">Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.</AuthMessage>}
      {Boolean(error) && <AuthMessage>{errorMessage(error)}</AuthMessage>}
      {errorCode(error) === 'ACCOUNT_NOT_ACTIVATED' && <p className="auth-inline-link"><Link to={`/activate?email=${encodeURIComponent(email.trim())}`}>Nhập mã OTP để kích hoạt tài khoản</Link></p>}
      <label className="auth-field">Email
        <input name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required aria-invalid={!!fieldError(error, 'email')} />
        {fieldError(error, 'email') && <small className="auth-field-error">{fieldError(error, 'email')}</small>}
      </label>
      <label className="auth-field">Mật khẩu
        <input name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required aria-invalid={!!fieldError(error, 'password')} />
        {fieldError(error, 'password') && <small className="auth-field-error">{fieldError(error, 'password')}</small>}
      </label>
      {showCaptcha && <CaptchaWidget onToken={setCaptchaToken} resetKey={captchaReset} />}
      <div className="auth-forgot-row"><Link to="/forgot-password">Quên mật khẩu?</Link></div>
      <button className="button primary auth-submit" type="submit" disabled={busy || loading || (showCaptcha && !captchaToken)}>{loading ? 'Đang kiểm tra phiên…' : busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    </form>
  </AuthPage>;
}
