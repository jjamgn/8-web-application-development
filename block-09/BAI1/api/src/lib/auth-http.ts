import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthError } from './auth-errors.js';
import type { AuthSession } from './auth-services.js';

export const REFRESH_COOKIE = 'refresh_token';
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/api/auth' };

export function spaOrigins() {
  const values = (process.env.SPA_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(value => value.trim());
  for (const value of values) {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value) throw new Error('SPA_ORIGINS must contain exact HTTP(S) origins');
  }
  return new Set(values);
}
export function requireOrigin(req: Request, origins: ReadonlySet<string>) {
  const origin = req.get('Origin');
  if (!origin || !origins.has(origin)) throw new AuthError('ORIGIN_FORBIDDEN');
}
export function readRefreshCookie(req: Request) {
  const values = (req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${REFRESH_COOKIE}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(REFRESH_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function csrfToken(familyId: string) {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new AuthError('AUTH_SERVICE_UNAVAILABLE');
  return createHmac('sha256', secret).update(`csrf:${familyId}`).digest('base64url');
}
export function requireCsrf(req: Request, familyId: string) {
  const given = req.get('X-CSRF-Token') || '';
  const expected = csrfToken(familyId);
  if (!/^[A-Za-z0-9_-]{43}$/.test(given) || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) throw new AuthError('CSRF_INVALID');
}
export function setRefreshCookie(res: Response, raw: string, session: AuthSession) {
  const maxAge = Math.floor(Math.min(session.expiresAt.getTime(), session.absoluteExpiresAt.getTime(), Date.now() + 7 * 86400000) - Date.now());
  if (maxAge <= 0) throw new AuthError('INVALID_REFRESH_TOKEN');
  res.cookie(REFRESH_COOKIE, raw, { ...cookieOptions, maxAge });
}
export const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, cookieOptions);
