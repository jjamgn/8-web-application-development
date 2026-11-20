import { Router, type Request, type Response, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { registrationSchema } from '../validation/registration.js';
import { verifyCaptcha, CaptchaError } from '../services/captcha.js';
import { registerPendingAccount } from '../services/registration.js';
import { requestVerificationEmail, verifyEmailCode } from '../services/email-verification.js';

declare module 'express-session' {
  interface SessionData {
    pendingRegistrationUserId?: number;
    registrationVerified?: boolean;
    registrationNotice?: string;
  }
}

export interface RegistrationRouterOptions {
  csrf: RequestHandler;
  captcha?: typeof verifyCaptcha;
  register?: typeof registerPendingAccount;
  verification?: { requestVerificationEmail: typeof requestVerificationEmail; verifyEmailCode: typeof verifyEmailCode };
}

const requested = 'Nếu email có thể sử dụng, mã xác minh sẽ được gửi đến hộp thư. Khi gửi lại, hãy chờ ít nhất 60 giây; nếu đã nhập sai 5 lần, hãy chờ 15 phút.';
const invalidCode = 'Mã xác minh không hợp lệ hoặc không còn hiệu lực. Vui lòng kiểm tra mã mới nhất; nếu đã nhập sai 5 lần, hãy chờ 15 phút rồi yêu cầu mã mới.';
function saveSession(req: Request) { return new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve())); }

export function createRegistrationRouter(options: RegistrationRouterOptions) {
  const router = Router();
  const captcha = options.captcha ?? verifyCaptcha;
  const register = options.register ?? registerPendingAccount;
  const verification = options.verification ?? { requestVerificationEmail, verifyEmailCode };
  const registrationPage = (res: Response, extras: Record<string, unknown> = {}) => res.render('register', {
    title: 'Đăng ký tài khoản · Bếp Nhà', error: '', errors: {}, values: {}, siteKey: process.env.TURNSTILE_SITE_KEY?.trim() || '', ...extras,
  });
  const verificationPage = (req: Request, res: Response, extras: Record<string, unknown> = {}) => res.render('verify-email', {
    title: 'Xác minh email · Bếp Nhà', error: '', notice: '', verified: Boolean(req.session.registrationVerified), ...extras,
  });
  const enabled: RequestHandler = (_req, res, next) => {
    if (process.env.DEMO_MODE === 'true') return res.status(503).render('error', { title: 'Đăng ký tạm dừng', message: 'Chức năng đăng ký hiện chưa được bật. Vui lòng thử lại sau.' });
    next();
  };
  const registerLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => registrationPage(res.status(429), { error: 'Bạn đã gửi quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau.' }),
  });
  const resendLimit = rateLimit({
    windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (req, res) => verificationPage(req, res.status(429), { error: 'Bạn đã gửi quá nhiều yêu cầu mã mới. Vui lòng thử lại sau.' }),
  });

  router.get('/register', (_req, res) => registrationPage(res));
  router.post('/register', registerLimit, options.csrf, enabled, async (req, res) => {
    const parsed = registrationSchema.safeParse(req.body);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().slice(0, 254) : '';
    if (!parsed.success) return registrationPage(res.status(400), {
      values: { email }, errors: parsed.error.flatten().fieldErrors, error: 'Vui lòng kiểm tra thông tin đăng ký.',
    });
    try { await captcha(req.body?.['cf-turnstile-response']); }
    catch (error) {
      const invalid = error instanceof CaptchaError && error.code === 'CAPTCHA_TOKEN_INVALID';
      return registrationPage(res.status(invalid ? 400 : 503), { values: { email }, error: invalid ? 'Vui lòng hoàn thành lại CAPTCHA.' : 'Chưa thể xác minh CAPTCHA. Vui lòng thử lại sau.' });
    }
    let userId: number;
    try { userId = await register(parsed.data); }
    catch { return registrationPage(res.status(503), { values: { email }, error: 'Chưa tạo được tài khoản. Vui lòng thử lại sau.' }); }
    req.session.pendingRegistrationUserId = userId;
    req.session.registrationVerified = false;
    await saveSession(req);
    try { await verification.requestVerificationEmail(userId); }
    catch { /* Keep the same public response for existing accounts and delivery failures. */ }
    req.session.registrationNotice = requested;
    await saveSession(req);
    res.redirect(303, '/auth/verify-email');
  });

  router.get('/verify-email', (req, res) => {
    const notice = req.session.registrationNotice || '';
    delete req.session.registrationNotice;
    return verificationPage(req, res, { notice });
  });
  router.post('/verify-email', options.csrf, enabled, async (req, res) => {
    const userId = req.session.pendingRegistrationUserId;
    if (!userId) return verificationPage(req, res.status(400), { error: invalidCode });
    try { await verification.verifyEmailCode(userId, typeof req.body?.otp === 'string' ? req.body.otp.trim() : req.body?.otp); }
    catch { return verificationPage(req, res.status(400), { error: invalidCode }); }
    delete req.session.pendingRegistrationUserId;
    req.session.registrationVerified = true;
    req.session.registrationNotice = 'Email đã được xác minh. Bạn có thể đăng nhập bằng tài khoản của mình.';
    await saveSession(req);
    res.redirect(303, '/auth/verify-email');
  });
  router.post('/verify-email/resend', resendLimit, options.csrf, enabled, async (req, res) => {
    if (req.session.pendingRegistrationUserId) {
      try { await verification.requestVerificationEmail(req.session.pendingRegistrationUserId); }
      catch { /* Do not disclose account state, cooldown or SMTP details through this endpoint. */ }
    }
    req.session.registrationNotice = requested;
    await saveSession(req);
    res.redirect(303, '/auth/verify-email');
  });
  return router;
}
