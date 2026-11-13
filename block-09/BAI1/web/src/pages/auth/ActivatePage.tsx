import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthMessage, AuthPage, fieldError } from './AuthPage';
import { errorMessage, request } from '../../lib/api';

export default function ActivatePage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage('');
    setBusy(true);
    try {
      await request<unknown>('auth/activate', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
      });
      setMessage('Tài khoản đã được kích hoạt. Bạn có thể đăng nhập ngay.');
      setOtp('');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setMessage('');
    setResending(true);
    try {
      await request<unknown>('auth/activate/resend', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setMessage('Nếu email cần xác minh, hướng dẫn mới sẽ được gửi khi có thể.');
      setCooldown(60);
    } catch (caught) {
      setError(caught);
    } finally {
      setResending(false);
    }
  }

  return <AuthPage eyebrow="XÁC MINH EMAIL" title="Nhập mã OTP" description="Mã gồm 6 chữ số được gửi đến email bạn đã đăng ký.">
    <form className="auth-form" onSubmit={activate}>
      {message && <AuthMessage kind="success">{message}</AuthMessage>}
      {Boolean(error) && <AuthMessage>{errorMessage(error)}</AuthMessage>}
      <label className="auth-field">Email
        <input name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required aria-invalid={!!fieldError(error, 'email')} />
        {fieldError(error, 'email') && <small className="auth-field-error">{fieldError(error, 'email')}</small>}
      </label>
      <label className="auth-field">Mã OTP
        <input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required aria-invalid={!!fieldError(error, 'otp')} />
        {fieldError(error, 'otp') && <small className="auth-field-error">{fieldError(error, 'otp')}</small>}
      </label>
      <button className="button primary auth-submit" type="submit" disabled={busy || otp.length !== 6}>{busy ? 'Đang xác minh…' : 'Kích hoạt tài khoản'}</button>
    </form>
    <div className="auth-secondary-actions">
      <button className="text-button" type="button" onClick={() => void resend()} disabled={resending || cooldown > 0 || !email.trim()}>
        {resending ? 'Đang gửi…' : cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã OTP'}
      </button>
      <Link to="/login">Đến đăng nhập</Link>
    </div>
  </AuthPage>;
}
