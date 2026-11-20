import { Router, type Request, type RequestHandler, type Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import type { Prisma, User } from '@prisma/client';
import { prisma } from '../db.js';
import { authClock, authTransaction, tokenHash } from './tokens.js';
import { loginSchema } from './validation.js';
import { consumeCaptcha } from './captcha.js';

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const LOGIN_CAPTCHA_AFTER = 3;
export const LOGIN_ACCOUNT_LIMIT = 5;
export const LOGIN_IP_LIMIT = 20;
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
type Db = Pick<Prisma.TransactionClient, 'loginAttempt'>;
type State = { captchaRequired: boolean; lockedUntil: Date | null };
const normalizedEmail = (raw: unknown) => typeof raw === 'string' ? raw.trim().toLowerCase().slice(0, 254) : '';
const keysFor = (email: string, ip: string) => [
  { key: `email:${tokenHash('LOGIN_EMAIL', email)}`, limit: LOGIN_ACCOUNT_LIMIT },
  { key: `ip:${tokenHash('LOGIN_IP', ip)}`, limit: LOGIN_IP_LIMIT },
];

function effectiveFailures(row: { failures: number; windowStartedAt: Date; lockedUntil: Date | null } | null, now: Date) {
  if (!row || (row.lockedUntil && row.lockedUntil <= now) || now.getTime() - row.windowStartedAt.getTime() >= LOGIN_WINDOW_MS) return 0;
  return row.failures;
}

export async function loginState(email: string, ip: string, db: Db = prisma): Promise<State> {
  const now = authClock.now();
  let captchaRequired = false, lockedUntil: Date | null = null;
  for (const { key } of keysFor(email, ip)) {
    const row = await db.loginAttempt.findUnique({ where: { key } });
    captchaRequired ||= effectiveFailures(row, now) >= LOGIN_CAPTCHA_AFTER;
    if (row?.lockedUntil && row.lockedUntil > now && (!lockedUntil || row.lockedUntil > lockedUntil)) lockedUntil = row.lockedUntil;
  }
  return { captchaRequired, lockedUntil };
}

async function failedAttempt(db: Db, email: string, ip: string): Promise<State> {
  const now = authClock.now();
  for (const { key, limit } of keysFor(email, ip)) {
    const previous = await db.loginAttempt.findUnique({ where: { key } });
    if (previous?.lockedUntil && previous.lockedUntil > now) continue;
    const failuresBefore = effectiveFailures(previous, now);
    const failures = failuresBefore + 1;
    const data = { failures, windowStartedAt: failuresBefore ? previous!.windowStartedAt : now, lockedUntil: failures >= limit ? new Date(now.getTime() + LOGIN_LOCK_MS) : null };
    await db.loginAttempt.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
  return loginState(email, ip, db);
}

function renderLogin(req: Request, res: Response, state: State, status = 200, error = '') {
  if (state.lockedUntil) res.set('Retry-After', String(Math.max(1, Math.ceil((state.lockedUntil.getTime() - authClock.now().getTime()) / 1000))));
  return res.status(status).render('auth/login', { title: 'Đăng nhập quản trị · Bếp Nhà', error, errors: {}, captchaRequired: state.captchaRequired, values: { email: normalizedEmail(req.method === 'GET' ? req.query.email : req.body.email) } });
}

export function createLoginRouter(demo: boolean, csrf: RequestHandler) {
  const router = Router();
  const requestLimit = rateLimit({ windowMs: LOGIN_WINDOW_MS, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, handler: (_req, res) => res.status(429).render('error', { title: 'Vui lòng thử lại sau', message: 'Bạn đã gửi quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau 15 phút.' }) });
  router.get('/login', async (req, res) => {
    const state = demo ? { captchaRequired: false, lockedUntil: null } : await loginState(normalizedEmail(req.query.email), req.ip || 'unknown');
    return renderLogin(req, res, state, 200, state.lockedUntil ? 'Đăng nhập tạm khóa do nhiều lần thử sai. Vui lòng chờ rồi thử lại.' : '');
  });
  const writable: RequestHandler = (req, res, next) => csrf(req, res, error => {
    if (error) return next(error);
    if (demo) return res.status(503).render('error', { title: 'Chế độ xem thử', message: 'Đăng nhập quản trị cần database đã cấu hình. Bản xem thử không tạo phiên đăng nhập.' });
    return next();
  });
  router.post('/login', writable, requestLimit, async (req, res, next) => {
    const email = normalizedEmail(req.body.email), ip = req.ip || 'unknown';
    let state = await loginState(email, ip);
    if (state.lockedUntil) return renderLogin(req, res, state, 429, 'Đăng nhập tạm khóa trong 15 phút do nhiều lần thử sai.');
    const captchaPassed = state.captchaRequired && consumeCaptcha(req);
    if (state.captchaRequired && !captchaPassed) {
      state = await authTransaction(prisma, tx => failedAttempt(tx, email, ip));
      return renderLogin(req, res, state, state.lockedUntil ? 429 : 400, 'Mã bảo vệ sai, đã sử dụng hoặc hết hạn. Vui lòng nhập mã mới.');
    }
    const parsed = loginSchema.safeParse(req.body);
    const user = parsed.success ? await prisma.user.findUnique({ where: { email: parsed.data.email } }) : null;
    const hash = user?.passwordHash || '$2b$12$uBkPZG1ufzmQC0ASxsxHwuEx3xMOoEi1nCLj4YhPgR4Ta0YqI3G4a';
    const passwordMatches = parsed.success && await bcrypt.compare(parsed.data.password, hash);
    const result = await authTransaction(prisma, async tx => {
      const freshState = await loginState(email, ip, tx);
      if (freshState.lockedUntil) return { state: freshState, status: 429 };
      if (freshState.captchaRequired && !captchaPassed) return { state: freshState, status: 400 };
      if (!passwordMatches || !user) return { state: await failedAttempt(tx, email, ip), status: 400 };
      // A password reset or account deactivation can race the bcrypt check.
      const fresh = await tx.user.findUnique({ where: { id: user.id } });
      if (!fresh || fresh.passwordHash !== user.passwordHash) return { state: await failedAttempt(tx, email, ip), status: 400 };
      if (fresh.status !== 'active' || !fresh.emailVerifiedAt) return { state: freshState, status: 403 };
      await tx.loginAttempt.deleteMany({ where: { key: keysFor(email, ip)[0].key } });
      return { state: freshState, status: 200, user: fresh };
    });
    if (!result.user) {
      const status = result.state.lockedUntil ? 429 : result.status;
      const message = status === 429 ? 'Đăng nhập tạm khóa trong 15 phút do nhiều lần thử sai.' : status === 403 ? 'Bạn cần kích hoạt và xác minh email trước khi đăng nhập.' : result.state.captchaRequired && !captchaPassed ? 'Vui lòng nhập mã bảo vệ để tiếp tục.' : 'Email hoặc mật khẩu chưa đúng.';
      return renderLogin(req, res, result.state, status, message);
    }
    const authenticated: User = result.user;
    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.userId = authenticated.id;
      req.session.passwordVersion = authenticated.passwordVersion;
      req.session.absoluteExpiresAt = Date.now() + SESSION_TTL_MS;
      req.session.save(error => error ? next(error) : res.redirect(303, authenticated.role === 'admin' ? '/admin/dishes' : '/auth/account'));
    });
  });
  router.post('/logout', csrf, (req, res, next) => req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('connect.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return res.redirect(303, '/dishes');
  }));
  return router;
}
