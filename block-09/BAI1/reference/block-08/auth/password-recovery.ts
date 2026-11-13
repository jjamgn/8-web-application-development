import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { consumeCaptcha } from './captcha.js';
import { mailer, resetEmail } from './email.js';
import { emailSchema, resetSchema } from './validation.js';
import { authClock, authTransaction, tokenHash, newResetToken, RESET_TTL_MS, RESEND_COOLDOWN_MS, MAX_SENDS_PER_HOUR } from './tokens.js';

const invalidLink = 'Liên kết đặt lại mật khẩu không hợp lệ, đã dùng hoặc hết hạn.';
const notice = (message: string) => `?notice=${encodeURIComponent(message)}`;
const eligible = (user: { status: string; emailVerifiedAt: Date | null } | null) => user?.status === 'active' && Boolean(user.emailVerifiedAt);

// All callers receive the same result, including unknown/inactive accounts,
// cooldowns and SMTP failures. Only the shared mail utility sees the raw token.
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !eligible(user)) return;
  const now = authClock.now();
  const raw = newResetToken();
  const hash = tokenHash('PASSWORD_RESET', raw);
  const issued = await authTransaction(prisma, async tx => {
    if (!eligible(await tx.user.findUnique({ where: { id: user.id } }))) return false;
    const latest = await tx.passwordResetToken.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    const count = await tx.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } } });
    if ((latest && now.getTime() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) || count >= MAX_SENDS_PER_HOUR) return false;
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt: new Date(now.getTime() + RESET_TTL_MS), createdAt: now } });
    return true;
  });
  if (!issued) return;
  try { await mailer.send(resetEmail(user.email, raw)); }
  catch {
    await prisma.passwordResetToken.updateMany({ where: { tokenHash: hash, usedAt: null }, data: { usedAt: authClock.now() } });
  }
}

export async function resetPassword(token: string, password: string): Promise<boolean> {
  const hash = tokenHash('PASSWORD_RESET', token);
  // Do not spend a bcrypt operation on arbitrary, expired or used tokens.
  const candidate = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hash } });
  if (!candidate || candidate.usedAt || candidate.expiresAt <= authClock.now()) return false;
  const passwordHash = await bcrypt.hash(password, 12);
  return authTransaction(prisma, async tx => {
    const now = authClock.now();
    const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    if (!record || record.usedAt || record.expiresAt <= now) return false;
    const user = await tx.user.findUnique({ where: { id: record.userId } });
    if (!user || !eligible(user)) return false;
    const consumed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordVersion: { increment: 1 } } });
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    // Same transaction as the password update: revoke every device, while
    // passwordVersion also rejects requests holding a previously loaded session.
    await tx.session.deleteMany({ where: { userId: user.id } });
    return true;
  });
}

function render(req: Request, res: Response, page: 'forgot-password' | 'reset-password', status = 200, error = '', errors: Record<string, string[] | undefined> = {}) {
  const input = req.method === 'GET' ? req.query : req.body;
  return res.status(status).render(`auth/${page}`, {
    title: `${page === 'forgot-password' ? 'Quên mật khẩu' : 'Đặt lại mật khẩu'} quản trị · Bếp Nhà`, error, errors,
    values: {
      email: typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0, 254) : '',
      token: typeof input.token === 'string' && /^[a-f0-9]{64}$/.test(input.token) ? input.token : '',
    },
  });
}

// Mount after the shared CSRF/demo guard. GET only renders; mail scanners and
// repeated link previews never consume the reset token or update a password.
export function createPasswordRecoveryRouter() {
  const router = Router();
  const limiter = (limit: number) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false, handler: (_req, res) => res.status(429).render('error', { title: 'Vui lòng thử lại sau', message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.' }) });
  router.get('/forgot-password', (req, res) => render(req, res, 'forgot-password'));
  router.get('/reset-password', (req, res) => render(req, res, 'reset-password'));
  router.post('/forgot-password', limiter(10), async (req, res) => {
    const email = emailSchema.safeParse(req.body.email);
    const captcha = consumeCaptcha(req);
    if (!email.success || !captcha) return render(req, res, 'forgot-password', 400, 'Vui lòng kiểm tra email và mã xác nhận.', { ...(!email.success ? { email: ['Email không hợp lệ.'] } : {}), ...(!captcha ? { captcha: ['Mã xác nhận sai, đã sử dụng hoặc hết hạn.'] } : {}) });
    await requestPasswordReset(email.data);
    return res.redirect(303, `/auth/forgot-password${notice('Nếu email thuộc tài khoản đã xác minh, bạn sẽ nhận được liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư và thư rác.')}`);
  });
  router.post('/reset-password', limiter(20), async (req, res, next) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) return render(req, res, 'reset-password', 400, 'Vui lòng kiểm tra mật khẩu và liên kết khôi phục.', parsed.error.flatten().fieldErrors);
    if (!await resetPassword(parsed.data.token, parsed.data.password)) return render(req, res, 'reset-password', 400, invalidLink);
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie('connect.sid', { path: '/' });
      return res.redirect(303, `/auth/login${notice('Đã đổi mật khẩu. Vui lòng đăng nhập lại.')}`);
    });
  });
  return router;
}
