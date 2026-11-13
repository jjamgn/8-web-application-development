import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthMessage, AuthPage, fieldError, passwordByteLength } from './AuthPage';
import { errorMessage, request } from '../../lib/api';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice('');
    if (!token) { setNotice('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã thiếu mã xác nhận.'); return; }
    if ([...password].length < 8) { setNotice('Mật khẩu cần có ít nhất 8 ký tự.'); return; }
    if (passwordByteLength(password) > 72) { setNotice('Mật khẩu không được vượt quá 72 byte UTF-8.'); return; }
    if (password !== confirmPassword) { setNotice('Mật khẩu xác nhận chưa khớp.'); return; }

    setBusy(true);
    try {
      await request<unknown>('auth/reset', {
        method: 'POST',
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      navigate('/login?reset=success', { replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return <AuthPage eyebrow="ĐẶT LẠI MẬT KHẨU" title="Chọn mật khẩu mới" description="Mật khẩu mới sẽ đăng xuất các phiên đã cấp trước đó.">
    <form className="auth-form" onSubmit={submit}>
      {notice && <AuthMessage kind="info">{notice}</AuthMessage>}
      {Boolean(error) && <AuthMessage>{errorMessage(error)}</AuthMessage>}
      <label className="auth-field">Mật khẩu mới
        <input name="password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required aria-invalid={!!fieldError(error, 'password')} />
        <small className="auth-hint">Tối thiểu 8 ký tự, tối đa 72 byte UTF-8.</small>
        {fieldError(error, 'password') && <small className="auth-field-error">{fieldError(error, 'password')}</small>}
      </label>
      <label className="auth-field">Nhập lại mật khẩu mới
        <input name="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required aria-invalid={!!fieldError(error, 'confirmPassword')} />
        {fieldError(error, 'confirmPassword') && <small className="auth-field-error">{fieldError(error, 'confirmPassword')}</small>}
      </label>
      <button className="button primary auth-submit" type="submit" disabled={busy || !token}>{busy ? 'Đang cập nhật…' : 'Đặt lại mật khẩu'}</button>
    </form>
    <p className="auth-card-footer">Quay lại <Link to="/login">đăng nhập</Link></p>
  </AuthPage>;
}
