import { Router, type Request, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { createCaptcha, consumeCaptcha } from './captcha.js';
import { mailer, verificationEmail, resetEmail } from './email.js';
import { emailSchema, registerSchema, resetSchema } from './validation.js';
import { createLoginRouter } from './login.js';
import { authClock, authTransaction, AuthError, tokenHash, newOtp, newResetToken, OTP_TTL_MS, RESET_TTL_MS, RESEND_COOLDOWN_MS, MAX_SENDS_PER_HOUR, MAX_OTP_ATTEMPTS } from './tokens.js';

const emailOf = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : '';
const notice = (value: string) => `?notice=${encodeURIComponent(value)}`;
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function render(req: Request, res: Response, page: string, status = 200, error = '', errors: Record<string, string[] | undefined> = {}) {
  const titles: Record<string, string> = { register: 'Đăng ký quản trị', 'verify-email': 'Xác minh email quản trị', login: 'Đăng nhập quản trị', 'forgot-password': 'Quên mật khẩu quản trị', 'reset-password': 'Đặt lại mật khẩu quản trị', account: 'Tài khoản quản trị' };
  const input = req.method === 'GET' ? req.query : req.body;
  return res.status(status).render(`auth/${page}`, {
    title: `${titles[page]} · Bếp Nhà`, error, errors,
    values: {
      name: typeof input.name === 'string' ? input.name.slice(0, 120) : '',
      email: emailOf(input.email || (page === 'verify-email' ? req.session.pendingEmail : '')),
      token: typeof input.token === 'string' && /^[a-f0-9]{64}$/.test(input.token) ? input.token : '',
    },
  });
}

async function issueOtp(userId: number): Promise<void> {
  const now = authClock.now();
  const otp = newOtp();
  const row = await authTransaction(prisma, async tx => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) throw new AuthError(400, 'Tài khoản không tồn tại hoặc đã xác minh.');
    const previous = await tx.emailVerification.findUnique({ where: { userId } });
    if (previous && now.getTime() - previous.lastSentAt.getTime() < RESEND_COOLDOWN_MS) throw new AuthError(429, 'Vui lòng chờ 60 giây giữa hai lần gửi mã.');
    const inWindow = previous && now.getTime() - previous.sendWindowStartedAt.getTime() < 60 * 60 * 1000;
    if (inWindow && previous.sendCount >= MAX_SENDS_PER_HOUR) throw new AuthError(429, 'Bạn đã gửi mã 5 lần trong một giờ. Vui lòng thử lại sau.');
    const data = {
      otpHash: tokenHash('EMAIL_VERIFICATION', otp, userId), expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      usedAt: null, attempts: 0, lastSentAt: now,
      sendWindowStartedAt: inWindow ? previous.sendWindowStartedAt : now,
      sendCount: inWindow ? previous.sendCount + 1 : 1,
    };
    await tx.emailVerification.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return { email: user.email, hash: data.otpHash };
  });
  try {
    await mailer.send(verificationEmail(row.email, otp));
  } catch {
    // Never leave a deliverable token active after a reported send failure.
    await prisma.emailVerification.updateMany({ where: { userId, otpHash: row.hash, usedAt: null }, data: { usedAt: authClock.now() } });
    throw new AuthError(503, 'Chưa gửi được email xác minh. Tài khoản đang chờ xác minh; vui lòng thử gửi lại mã sau 60 giây.');
  }
}

async function verifyOtp(email: string, otp: string): Promise<boolean> {
  const now = authClock.now();
  return authTransaction(prisma, async tx => {
    const user = await tx.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return false;
    const verification = await tx.emailVerification.findUnique({ where: { userId: user.id } });
    if (!verification || verification.usedAt || verification.expiresAt <= now || verification.attempts >= MAX_OTP_ATTEMPTS) return false;
    const matches = /^\d{6}$/.test(otp) && sameHash(verification.otpHash, tokenHash('EMAIL_VERIFICATION', otp, user.id));
    if (!matches) {
      const attempts = verification.attempts + 1;
      await tx.emailVerification.updateMany({ where: { userId: user.id, usedAt: null, attempts: verification.attempts }, data: { attempts, ...(attempts >= MAX_OTP_ATTEMPTS ? { usedAt: now } : {}) } });
      // Return instead of throw: the failed-attempt increment must commit.
      return false;
    }
    const consumed = await tx.emailVerification.updateMany({ where: { userId: user.id, usedAt: null, attempts: { lt: MAX_OTP_ATTEMPTS }, expiresAt: { gt: now }, otpHash: verification.otpHash }, data: { usedAt: now } });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now, status: 'active' } });
    return true;
  });
}

export function createAuthRouter(demo: boolean, csrf: RequestHandler) {
  const router = Router();
  router.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  router.use(createLoginRouter(demo, csrf));
  const limiter = (limit: number) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false, handler: (_req, res) => res.status(429).render('error', { title: 'Vui lòng thử lại sau', message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.' }) });
  const registerLimit = limiter(30), verificationLimit = limiter(40), resendLimit = limiter(20), forgotLimit = limiter(10), resetLimit = limiter(20);
  router.get('/captcha', (req, res) => res.type('svg').send(createCaptcha(req)));
  for (const page of ['register', 'verify-email', 'forgot-password', 'reset-password']) router.get(`/${page}`, (req, res) => render(req, res, page));
  router.get('/account', (req, res) => {
    if (!res.locals.currentUser) return res.redirect(303, '/auth/login');
    return render(req, res, 'account');
  });
  router.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    return csrf(req, res, error => {
      if (error) return next(error);
      if (demo) return res.status(503).render('error', { title: 'Chế độ xem thử', message: 'Đăng ký và xác thực quản trị chưa bật trong bản xem thử. Vui lòng cấu hình dịch vụ tài khoản để tiếp tục.' });
      return next();
    });
  });

  router.post('/register', registerLimit, async (req, res) => {
    const validCaptcha = consumeCaptcha(req);
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success || !validCaptcha) return render(req, res, 'register', 400, 'Vui lòng kiểm tra các thông tin được đánh dấu.', { ...(!parsed.success ? parsed.error.flatten().fieldErrors : {}), ...(!validCaptcha ? { captcha: ['Mã xác nhận sai, đã sử dụng hoặc hết hạn. Vui lòng nhập mã mới.'] } : {}) });
    const expectedInvite = process.env.ADMIN_REGISTRATION_CODE || '';
    if (expectedInvite.length < 16) return render(req, res, 'register', 503, 'Đăng ký quản trị chưa được mở. Vui lòng liên hệ người quản lý.');
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(parsed.data.invitationCode), digest(expectedInvite))) return render(req, res, 'register', 400, 'Mã mời quản trị không hợp lệ.', { invitationCode: ['Mã mời quản trị không hợp lệ.'] });
    const { name, email, password } = parsed.data;
    let created = false;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({ data: { name, email, passwordHash, role: 'viewer', status: 'pending' } });
      created = true;
      req.session.pendingEmail = user.email;
      await issueOtp(user.id);
      return res.redirect(303, `/auth/verify-email${notice('Mã xác minh đã được gửi đến email của bạn.')}`);
    } catch (error: any) {
      if (error.code === 'P2002') return render(req, res, 'register', 400, 'Email đã được đăng ký. Hãy đăng nhập hoặc gửi lại mã xác minh.', { email: ['Email đã được đăng ký.'] });
      if (error instanceof AuthError) return render(req, res, 'verify-email', error.status, error.message);
      if (created) return render(req, res, 'verify-email', 503, 'Tài khoản đã được tạo nhưng chưa gửi được mã. Vui lòng thử gửi lại mã xác minh sau.');
      return render(req, res, 'register', 503, 'Chưa tạo được tài khoản. Vui lòng thử lại sau.');
    }
  });

  router.post('/verify-email', verificationLimit, async (req, res) => {
    const email = emailSchema.safeParse(req.body.email);
    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
    if (!email.success || !await verifyOtp(email.data, otp)) return render(req, res, 'verify-email', 400, 'Mã xác minh không hợp lệ, đã dùng hoặc hết hạn. Bạn có tối đa 5 lần thử cho mỗi mã.');
    delete req.session.pendingEmail;
    return res.redirect(303, `/auth/login${notice('Email đã được xác minh. Bạn có thể đăng nhập.')}`);
  });

  router.post(['/verify-email/resend', '/resend-otp'], resendLimit, async (req, res) => {
    const email = emailSchema.safeParse(req.body.email);
    if (!email.success) return render(req, res, 'verify-email', 400, 'Vui lòng nhập email hợp lệ.');
    const user = await prisma.user.findUnique({ where: { email: email.data } });
    if (!user || user.emailVerifiedAt) return render(req, res, 'verify-email', 400, 'Tài khoản không tồn tại hoặc đã xác minh.');
    req.session.pendingEmail = user.email;
    try {
      await issueOtp(user.id);
      return res.redirect(303, `/auth/verify-email${notice('Đã gửi mã mới. Mã trước đó không còn hiệu lực.')}`);
    } catch (error) {
      if (error instanceof AuthError) return render(req, res, 'verify-email', error.status, error.message);
      throw error;
    }
  });

  router.post('/forgot-password', forgotLimit, async (req, res) => {
    const email = emailSchema.safeParse(req.body.email);
    const captcha = consumeCaptcha(req);
    if (!email.success || !captcha) return render(req, res, 'forgot-password', 400, 'Vui lòng kiểm tra email và mã xác nhận.', { ...(!email.success ? { email: ['Email không hợp lệ.'] } : {}), ...(!captcha ? { captcha: ['Mã xác nhận sai, đã sử dụng hoặc hết hạn.'] } : {}) });
    const user = await prisma.user.findUnique({ where: { email: email.data } });
    if (user?.emailVerifiedAt) {
      const now = authClock.now();
      const raw = newResetToken();
      const hash = tokenHash('PASSWORD_RESET', raw);
      const issued = await authTransaction(prisma, async tx => {
        const latest = await tx.passwordResetToken.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
        const count = await tx.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } } });
        if ((latest && now.getTime() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) || count >= MAX_SENDS_PER_HOUR) return false;
        await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
        await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt: new Date(now.getTime() + RESET_TTL_MS), createdAt: now } });
        return true;
      });
      if (issued) {
        try { await mailer.send(resetEmail(user.email, raw)); }
        catch {
          await prisma.passwordResetToken.updateMany({ where: { tokenHash: hash, usedAt: null }, data: { usedAt: authClock.now() } });
          // Keep the public response identical for absent accounts and SMTP
          // failures; never disclose whether this email owns an account.
        }
      }
    }
    return res.redirect(303, `/auth/forgot-password${notice('Nếu email thuộc tài khoản đã xác minh, bạn sẽ nhận được liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư và thư rác.')}`);
  });

  router.post('/reset-password', resetLimit, async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) return render(req, res, 'reset-password', 400, 'Vui lòng kiểm tra mật khẩu và liên kết khôi phục.', parsed.error.flatten().fieldErrors);
    const { token, password } = parsed.data;
    const hash = tokenHash('PASSWORD_RESET', token);
    const passwordHash = await bcrypt.hash(password, 12);
    const now = authClock.now();
    const reset = await authTransaction(prisma, async tx => {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: hash } });
      if (!record || record.usedAt || record.expiresAt <= now) return false;
      const user = await tx.user.findUnique({ where: { id: record.userId } });
      if (!user?.emailVerifiedAt) return false;
      const consumed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (consumed.count !== 1) return false;
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordVersion: { increment: 1 } } });
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      return true;
    });
    if (!reset) return render(req, res, 'reset-password', 400, 'Liên kết đặt lại mật khẩu không hợp lệ, đã dùng hoặc hết hạn.');
    delete req.session.userId;
    delete req.session.passwordVersion;
    return res.redirect(303, `/auth/login${notice('Đã đổi mật khẩu. Vui lòng đăng nhập lại.')}`);
  });
  return router;
}
