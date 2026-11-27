import session, { type SessionData } from 'express-session';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Config } from '../config/env.js';
import type { SessionRepository } from './ports.js';
import { AppError } from '../errors.js';

declare module 'express-session' {
  interface SessionData { userId?: string; csrfToken?: string; absoluteExpiresAt?: number }
}
export const SESSION_MS = 2 * 60 * 60 * 1000;
export const authRequired = () => new AppError('AUTH_REQUIRED', 401, 'Vui lòng đăng nhập.');

export class DatabaseSessionStore extends session.Store {
  constructor(private repository: SessionRepository) { super(); }
  override get(sid: string, callback: (err: unknown, data?: SessionData | null) => void) {
    void this.repository.read(sid).then(async row => {
      if (!row) return callback(null, null);
      if (row.expiresAt.getTime() <= Date.now() || !row.data.absoluteExpiresAt || row.data.absoluteExpiresAt <= Date.now()) {
        await this.repository.destroy(sid);
        return callback(null, null);
      }
      callback(null, row.data);
    }).catch(callback);
  }
  override set(sid: string, data: SessionData, callback?: (err?: unknown) => void) {
    if (!data.absoluteExpiresAt || data.absoluteExpiresAt <= Date.now()) return callback?.(authRequired());
    void this.repository.updateActive(sid, data, data.userId ?? null)
      .then(active => callback?.(active ? undefined : authRequired())).catch(error => callback?.(error));
  }
  override destroy(sid: string, callback?: (err?: unknown) => void) {
    void this.repository.destroy(sid).then(() => callback?.()).catch(error => callback?.(error));
  }
  // No rolling expiry and no UPDATE that could revive a session after logout.
  override touch(_sid: string, _data: SessionData, callback?: () => void) { callback?.(); }
}

export function sessionMiddleware(config: Config, repository: SessionRepository) {
  return session({ name: 'block11.sid', secret: config.SESSION_SECRET,
    store: new DatabaseSessionStore(repository), resave: false, saveUninitialized: false, rolling: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.NODE_ENV === 'production', path: '/', maxAge: SESSION_MS }
  });
}
export async function initializeSession(req: Request, repository: SessionRepository, userId?: string) {
  req.session.absoluteExpiresAt = Date.now() + SESSION_MS;
  req.session.csrfToken = randomBytes(32).toString('hex');
  if (userId) req.session.userId = userId;
  req.session.cookie.expires = new Date(req.session.absoluteExpiresAt);
  await repository.create({ sid: req.sessionID, userId: userId ?? null,
    data: JSON.parse(JSON.stringify(req.session)) as SessionData, expiresAt: new Date(req.session.absoluteExpiresAt) });
  await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
}
export async function assertActiveSession(req: Request, repository: SessionRepository): Promise<string> {
  const userId = req.session.userId;
  if (!userId || !req.session.absoluteExpiresAt || req.session.absoluteExpiresAt <= Date.now()) throw authRequired();
  const row = await repository.read(req.sessionID);
  if (!row || row.userId !== userId || row.expiresAt.getTime() <= Date.now()) throw authRequired();
  return userId;
}
export function requireSession(repository: SessionRepository): RequestHandler {
  return async (req, _res, next) => { try { await assertActiveSession(req, repository); next(); } catch (error) { next(error); } };
}
export function csrfGuard(origin: string): RequestHandler {
  return (req, _res, next) => {
    const provided = req.get('X-CSRF-Token');
    const expected = req.session.csrfToken;
    if (req.get('Origin') !== origin || !provided || !expected ||
      !req.session.absoluteExpiresAt || req.session.absoluteExpiresAt <= Date.now() ||
      Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      return next(new AppError('CSRF_INVALID', 403, 'Phiên xác nhận không hợp lệ. Vui lòng tải lại trang.'));
    }
    next();
  };
}
