import nodemailer from 'nodemailer';

export type EmailMessage = { to: string; subject: string; text: string; html?: string };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

// Both email verification and password recovery use this single SMTP utility.
// No console/outbox fallback: a failed delivery must never appear successful.
export const mailer = {
  async send(message: EmailMessage): Promise<void> {
    const host = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM;
    if (!host || !from) throw new Error('SMTP is not configured');
    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP port');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    if (Boolean(user) !== Boolean(pass)) throw new Error('Incomplete SMTP authentication');
    const localSmtp = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (process.env.SMTP_REQUIRE_TLS === 'false' && (!localSmtp || process.env.NODE_ENV === 'production')) throw new Error('Unencrypted SMTP is only allowed on local development servers');
    const transport = nodemailer.createTransport({
      host, port, secure: process.env.SMTP_SECURE === 'true',
      requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      logger: false, debug: false,
    });
    const result = await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.text, html: message.html, disableFileAccess: true, disableUrlAccess: true });
    if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP rejected recipient');
  },
};

export function verificationEmail(to: string, otp: string): EmailMessage {
  const text = `Mã xác minh tài khoản Bếp Nhà của bạn là: ${otp}\nMã có hiệu lực trong 10 phút, chỉ dùng một lần. Nếu không yêu cầu đăng ký, bạn có thể bỏ qua email này.`;
  return { to, subject: 'Bếp Nhà — Mã xác minh email', text, html: `<p>Mã xác minh tài khoản Bếp Nhà của bạn:</p><p><strong>${escapeHtml(otp)}</strong></p><p>Mã có hiệu lực trong 10 phút và chỉ dùng một lần. Nếu không yêu cầu đăng ký, bạn có thể bỏ qua email này.</p>` };
}

export function resetEmail(to: string, token: string): EmailMessage {
  const base = new URL(process.env.APP_URL || 'http://localhost:3000');
  const localApp = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash || (base.protocol === 'http:' && (!localApp || process.env.NODE_ENV === 'production'))) throw new Error('Invalid APP_URL');
  const link = new URL('/auth/reset-password', base);
  link.searchParams.set('token', token);
  return { to, subject: 'Bếp Nhà — Đặt lại mật khẩu', text: `Đặt lại mật khẩu Bếp Nhà tại: ${link.href}\nLiên kết có hiệu lực trong 30 phút, chỉ dùng một lần. Nếu không yêu cầu, hãy bỏ qua email này.`, html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu Bếp Nhà.</p><p><a href="${escapeHtml(link.href)}">Đặt lại mật khẩu</a></p><p>Liên kết có hiệu lực trong 30 phút và chỉ dùng một lần. Nếu không yêu cầu, hãy bỏ qua email này.</p>` };
}
