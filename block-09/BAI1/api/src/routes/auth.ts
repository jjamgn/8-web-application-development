import { Router, type Request, type Response } from 'express';
import type { z } from 'zod';
import { registerSchema, activateSchema, resendSchema, loginSchema, forgotSchema, resetSchema, changePasswordSchema, profileSchema } from '../validation/auth.js';
import { AuthError, type AuthErrorCode } from '../lib/auth-errors.js';
import { ACCESS_TTL_SECONDS, signAccessToken } from '../lib/auth-jwt.js';
import { clearRefreshCookie, csrfToken, readRefreshCookie, requireCsrf, requireOrigin, setRefreshCookie } from '../lib/auth-http.js';
import { liveSession, publicUser, type AuthContext, type AuthServices, type SessionGrant } from '../lib/auth-services.js';
import { requireAuth } from '../middleware/require-auth.js';
import { verifyCaptcha } from '../services/auth/captcha.js';

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown, invalid?: AuthErrorCode): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  if (invalid) throw new AuthError(invalid);
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? 'body')] ??= issue.message;
  throw new AuthError('VALIDATION_FAILED', fields);
}
function context(req: Request): AuthContext {
  const ip = req.ip || 'unknown';
  const verified = new Map<string, Promise<void>>();
  return { ip, verifyCaptcha(token) {
    let result = verified.get(token);
    if (!result) { result = verifyCaptcha(token, ip); verified.set(token, result); }
    return result;
  } };
}
const notices = {
  register: 'Nếu thông tin phù hợp, bạn sẽ nhận email hướng dẫn kích hoạt tài khoản.',
  resend: 'Nếu tài khoản cần xác minh, bạn sẽ nhận email hướng dẫn kích hoạt.',
  forgot: 'Nếu email thuộc tài khoản đã xác minh, bạn sẽ nhận liên kết đặt lại mật khẩu.',
};

export function authRouter(services: AuthServices, origins: ReadonlySet<string>) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/register', async (req, res) => {
    const ctx = context(req);
    await services.enforceIpLimit('register', ctx.ip);
    const input = parse(registerSchema, req.body);
    await ctx.verifyCaptcha(input.captchaToken); // Must happen before A performs bcrypt.
    await services.register(input, ctx);
    res.json({ ok: true, data: { message: notices.register } });
  });
  router.post('/activate', async (req, res) => {
    const ctx = context(req);
    await services.enforceIpLimit('activate', ctx.ip);
    await services.activate(parse(activateSchema, req.body, 'INVALID_OTP'), ctx);
    res.json({ ok: true, data: { message: 'Đã kích hoạt tài khoản. Vui lòng đăng nhập.' } });
  });
  router.post('/activate/resend', async (req, res) => {
    const ctx = context(req);
    await services.enforceIpLimit('resend', ctx.ip);
    await services.resend(parse(resendSchema, req.body), ctx);
    res.json({ ok: true, data: { message: notices.resend } });
  });
  async function grantResponse(grant: SessionGrant, res: Response) {
    if (!liveSession(grant) || !/^[A-Za-z0-9_-]{43}$/.test(grant.refreshToken)) throw new AuthError('INVALID_REFRESH_TOKEN');
    const accessToken = await signAccessToken(grant.user, grant.familyId);
    const csrf = csrfToken(grant.familyId);
    setRefreshCookie(res, grant.refreshToken, grant);
    res.json({ ok: true, data: { accessToken, tokenType: 'Bearer', expiresIn: ACCESS_TTL_SECONDS, csrfToken: csrf, user: publicUser(grant.user) } });
  }
  router.post('/login', async (req, res) => {
    requireOrigin(req, origins);
    const ctx = context(req);
    await services.enforceIpLimit('login', ctx.ip);
    await grantResponse(await services.login(parse(loginSchema, req.body, 'INVALID_CREDENTIALS'), ctx), res);
  });
  router.get('/csrf', async (req, res) => {
    requireOrigin(req, origins);
    const raw = readRefreshCookie(req);
    const session = raw ? await services.inspectRefresh(raw) : null;
    if (!session || !liveSession(session)) {
      if (session && (session.user.status !== 'active' || session.passwordVersion !== session.user.passwordVersion || !session.user.emailVerifiedAt)) await services.revokeFamily(session.familyId);
      clearRefreshCookie(res);
      throw new AuthError('INVALID_REFRESH_TOKEN');
    }
    res.json({ ok: true, data: { csrfToken: csrfToken(session.familyId) } });
  });
  router.post('/refresh', async (req, res) => {
    requireOrigin(req, origins);
    await services.enforceIpLimit('refresh', context(req).ip);
    try {
      const raw = readRefreshCookie(req);
      const familyId = raw ? await services.refreshFamilyForCsrf(raw) : null;
      if (!raw || !familyId) throw new AuthError('INVALID_REFRESH_TOKEN');
      requireCsrf(req, familyId);
      // A rechecks user/version/expiry AND atomically rotates inside its transaction.
      await grantResponse(await services.rotateRefresh(raw), res);
    } catch (error) {
      if (error instanceof AuthError && error.status === 401) clearRefreshCookie(res);
      throw error;
    }
  });
  router.post('/logout', async (req, res) => {
    requireOrigin(req, origins);
    const raw = readRefreshCookie(req);
    const session = raw ? await services.inspectRefresh(raw) : null;
    if (session && liveSession(session)) {
      requireCsrf(req, session.familyId);
      await services.revokeFamily(session.familyId);
    }
    clearRefreshCookie(res);
    res.json({ ok: true, data: null });
  });
  router.get('/me', requireAuth(services), (_req, res) => {
    res.json({ ok: true, data: res.locals.authUser });
  });
  router.patch('/me', requireAuth(services), async (req, res) => {
    requireOrigin(req, origins);
    const identity = res.locals.authSession;
    requireCsrf(req, identity.familyId);
    await services.enforceIpLimit('profile', context(req).ip);
    const user = await services.updateProfile(parse(profileSchema, req.body), identity);
    res.json({ ok: true, data: user });
  });
  router.post('/change-password', requireAuth(services), async (req, res) => {
    requireOrigin(req, origins);
    const identity = res.locals.authSession;
    requireCsrf(req, identity.familyId);
    await services.enforceIpLimit('change', context(req).ip);
    await grantResponse(await services.changePassword(parse(changePasswordSchema, req.body), identity), res);
  });
  router.post('/forgot', async (req, res) => {
    const ctx = context(req);
    await services.enforceIpLimit('forgot', ctx.ip);
    const input = parse(forgotSchema, req.body);
    await ctx.verifyCaptcha(input.captchaToken);
    await services.forgot(input, ctx);
    res.json({ ok: true, data: { message: notices.forgot } });
  });
  router.post('/reset', async (req, res) => {
    const ctx = context(req);
    await services.enforceIpLimit('reset', ctx.ip);
    const raw = req.body as { token?: unknown } | null;
    if (typeof raw?.token !== 'string' || !/^[a-f0-9]{64}$/.test(raw.token)) throw new AuthError('INVALID_RESET_TOKEN');
    await services.reset(parse(resetSchema, req.body), ctx);
    res.json({ ok: true, data: { message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' } });
  });
  return router;
}
