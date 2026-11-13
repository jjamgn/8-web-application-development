import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CaptchaWidget from './CaptchaWidget';
import { AuthMessage, AuthPage, errorCode, fieldError, passwordByteLength } from './AuthPage';
import { errorMessage, request } from '../../lib/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice('');
    if ([...password].length < 8) { setNotice('Mật khẩu cần có ít nhất 8 ký tự.'); return; }
    if (passwordByteLength(password) > 72) { setNotice('Mật khẩu không được vượt quá 72 byte UTF-8.'); return; }
    if (password !== confirmPassword) { setNotice('Mật khẩu xác nhận chưa khớp.'); return; }
    if (!captchaToken) { setNotice('Vui lòng hoàn tất xác minh CAPTCHA.'); return; }

    setBusy(true);
    try {
      await request<unknown>('auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, confirmPassword, captchaToken }),
      });
      navigate(`/activate?email=${encodeURIComponent(email.trim())}`, { state: { fromRegister: true } });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
      setCaptchaToken(null);
      setCaptchaReset(value => value + 1);
    }
  }

  return <AuthPage eyebrow="CHÀO MỪNG ĐẾN VỚI BẾP" title="Tạo tài khoản" description="Đăng ký để cùng Bếp Nhà lưu lại những món ngon yêu thích.">
    <form className="auth-form" onSubmit={submit}>
      {notice && <AuthMessage kind="info">{notice}</AuthMessage>}
      {Boolean(error) && <AuthMessage>{errorMessage(error)}</AuthMessage>}
      <label className="auth-field">Họ và tên
        <input name="name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required aria-invalid={!!fieldError(error, 'name')} />
        {fieldError(error, 'name') && <small className="auth-field-error">{fieldError(error, 'name')}</small>}
      </label>
      <label className="auth-field">Email
        <input name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required aria-invalid={!!fieldError(error, 'email')} />
        {fieldError(error, 'email') && <small className="auth-field-error">{fieldError(error, 'email')}</small>}
      </label>
      <label className="auth-field">Mật khẩu
        <input name="password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required aria-invalid={!!fieldError(error, 'password')} />
        <small className="auth-hint">Tối thiểu 8 ký tự, tối đa 72 byte UTF-8.</small>
        {fieldError(error, 'password') && <small className="auth-field-error">{fieldError(error, 'password')}</small>}
      </label>
      <label className="auth-field">Nhập lại mật khẩu
        <input name="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required aria-invalid={!!fieldError(error, 'confirmPassword')} />
        {fieldError(error, 'confirmPassword') && <small className="auth-field-error">{fieldError(error, 'confirmPassword')}</small>}
      </label>
      <CaptchaWidget onToken={setCaptchaToken} resetKey={captchaReset} />
      {errorCode(error) === 'CAPTCHA_REQUIRED' && <AuthMessage kind="info">Hãy hoàn tất CAPTCHA rồi gửi lại biểu mẫu.</AuthMessage>}
      <button className="button primary auth-submit" type="submit" disabled={busy || !captchaToken}>{busy ? 'Đang gửi…' : 'Tạo tài khoản'}</button>
    </form>
    <p className="auth-card-footer">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
  </AuthPage>;
}
