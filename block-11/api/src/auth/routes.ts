import { Router, json } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import type { Config } from '../config/env.js';
import type { UserRepository, SessionRepository } from './ports.js';
import { AppError } from '../errors.js';
import { codePoints } from '../../../contracts/index.js';
import { initializeSession, requireSession, csrfGuard, assertActiveSession } from './session.js';

const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z.string().refine(v => codePoints(v) >= 8 && Buffer.byteLength(v) <= 72);
const registerSchema = z.object({ name: z.string().trim().refine(v => codePoints(v) >= 1 && codePoints(v) <= 120),
  email, password, confirmPassword: z.string() }).strict().refine(v => v.password === v.confirmPassword);
const loginSchema = z.object({ email, password: z.string().min(1).refine(v => Buffer.byteLength(v) <= 72) }).strict();
const limiter = (windowMs: number, skipSuccessfulRequests = false) => rateLimit({
  windowMs, limit: 10, skipSuccessfulRequests, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Vui lòng thử lại sau.' } })
});
export function authRouter(config: Config, users: UserRepository, sessions: SessionRepository) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/csrf', async (req, res) => {
    if (!req.session.csrfToken) await initializeSession(req, sessions);
    res.json({ ok: true, data: { csrfToken: req.session.csrfToken } });
  });
  router.get('/me', requireSession(sessions), async (req, res) => {
    const user = await users.byId(req.session.userId!);
    if (!user) throw new AppError('AUTH_REQUIRED', 401, 'Vui lòng đăng nhập.');
    res.json({ ok: true, data: { user: { id: user.id, name: user.name } } });
  });
  router.post('/register', limiter(60 * 60 * 1000), csrfGuard(config.APP_ORIGIN, config.ADDITIONAL_APP_ORIGINS), json({ limit: '16kb' }), async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('VALIDATION_ERROR', 400, 'Thông tin đăng ký không hợp lệ.');
    const { name, email: address, password: secret } = parsed.data;
    if (await users.byEmail(address)) throw new AppError('EMAIL_ALREADY_EXISTS', 409, 'Email đã được đăng ký.');
    try {
      const user = await users.create({ name, email: address, passwordHash: await bcrypt.hash(secret, 12) });
      res.status(201).json({ ok: true, data: { user: { id: user.id, name: user.name } } });
    } catch (error) {
      // A maps the unique email race to this stable code (Prisma P2002 also accepted).
      if (typeof error === 'object' && error && 'code' in error && ['P2002', 'EMAIL_ALREADY_EXISTS'].includes(String(error.code)))
        throw new AppError('EMAIL_ALREADY_EXISTS', 409, 'Email đã được đăng ký.');
      throw error;
    }
  });
  router.post('/login', limiter(15 * 60 * 1000, true), csrfGuard(config.APP_ORIGIN, config.ADDITIONAL_APP_ORIGINS), json({ limit: '16kb' }), async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('VALIDATION_ERROR', 400, 'Thông tin đăng nhập không hợp lệ.');
    const user = await users.byEmail(parsed.data.email);
    // Compare even for missing users, so invalid email and password use the same work factor.
    const hash = user?.passwordHash ?? '$2b$12$C6UzMDM.H6dfI/f/IKcEe.yrP.Y06i3LlQ6pXdxKPqicBq3m1S7AG';
    const valid = await bcrypt.compare(parsed.data.password, hash);
    if (!user || !valid) throw new AppError('INVALID_CREDENTIALS', 401, 'Email hoặc mật khẩu không đúng.');
    await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    await initializeSession(req, sessions, user.id);
    res.json({ ok: true, data: { user: { id: user.id, name: user.name }, csrfToken: req.session.csrfToken } });
  });
  router.post('/logout', requireSession(sessions), csrfGuard(config.APP_ORIGIN, config.ADDITIONAL_APP_ORIGINS), async (req, res) => {
    await assertActiveSession(req, sessions);
    await new Promise<void>((resolve, reject) => req.session.destroy(err => err ? reject(err) : resolve()));
    res.clearCookie('block11.sid', { httpOnly: true, sameSite: 'lax', secure: config.NODE_ENV === 'production', path: '/' });
    res.status(204).end();
  });
  return router;
}
