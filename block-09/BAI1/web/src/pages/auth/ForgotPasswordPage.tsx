import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import CaptchaWidget from './CaptchaWidget';
import { AuthMessage, AuthPage, fieldError } from './AuthPage';
import { errorMessage, request } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(false);
    if (!captchaToken) return;
    setBusy(true);
    try {
      await request<unknown>('auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), captchaToken }),
      });
      setSent(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
      setCaptchaToken(null);
      setCaptchaReset(value => value + 1);
    }
  }

  return <AuthPage eyebrow="KHÔI PHỤC TÀI KHOẢN" title="Quên mật khẩu?" description="Nhập email của bạn. Nếu tài khoản phù hợp, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email đó."
    footer={<>Nhớ lại mật khẩu? <Link to="/login">Đăng nhập</Link></>}>
    <form className="auth-form" onSubmit={submit}>
      {sent && <AuthMessage kind="success">Nếu email có tài khoản phù hợp, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.</AuthMessage>}
      {Boolean(error) && <AuthMessage>{errorMessage(error)}</AuthMessage>}
      <label className="auth-field">Email
        <input name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required aria-invalid={!!fieldError(error, 'email')} />
        {fieldError(error, 'email') && <small className="auth-field-error">{fieldError(error, 'email')}</small>}
      </label>
      <CaptchaWidget onToken={setCaptchaToken} resetKey={captchaReset} />
      <button className="button primary auth-submit" type="submit" disabled={busy || !captchaToken}>{busy ? 'Đang gửi…' : 'Gửi hướng dẫn'}</button>
    </form>
  </AuthPage>;
}
