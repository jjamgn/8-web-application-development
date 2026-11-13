import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { loginSchema } from '../../validation/auth.js';
import { activeUser, checkCaptcha, publicUser, type AuthContext, type AuthenticatedUser, type CaptchaResult } from './types.js';
import { authTransaction, tokenHash } from './tokens.js';

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const LOGIN_CAPTCHA_AFTER = 3;
export const LOGIN_ACCOUNT_LIMIT = 5;
export const LOGIN_IP_LIMIT = 20;
export type LoginState = { captchaRequired: boolean; lockedUntil: Date | null };
type LoginDb = Pick<Prisma.TransactionClient, 'loginAttempt'>;
const normalize = (email: string) => email.trim().toLowerCase();
const keysFor = (email: string, ip: string) => [
  { key: `email:${tokenHash('LOGIN_EMAIL', normalize(email))}`, limit: LOGIN_ACCOUNT_LIMIT },
  { key: `ip:${tokenHash('LOGIN_IP', ip)}`, limit: LOGIN_IP_LIMIT },
];
function effectiveFailures(row: { failures: number; windowStartedAt: Date; lockedUntil: Date | null } | null, now: Date) {
  if (!row || (row.lockedUntil && row.lockedUntil <= now) || now.getTime() - row.windowStartedAt.getTime() >= LOGIN_WINDOW_MS) return 0;
  return row.failures;
}
export async function loginState(ctx: AuthContext, email: string, ip: string, db: LoginDb = ctx.db): Promise<LoginState> {
  const now = ctx.now();
  let captchaRequired = false, lockedUntil: Date | null = null;
  for (const { key } of keysFor(email, ip)) {
    const row = await db.loginAttempt.findUnique({ where: { key } });
    captchaRequired ||= effectiveFailures(row, now) >= LOGIN_CAPTCHA_AFTER;
    if (row?.lockedUntil && row.lockedUntil > now && (!lockedUntil || row.lockedUntil > lockedUntil)) lockedUntil = row.lockedUntil;
  }
  return { captchaRequired, lockedUntil };
}
async function failedAttempt(ctx: AuthContext, db: LoginDb, email: string, ip: string): Promise<LoginState> {
  const now = ctx.now();
  for (const { key, limit } of keysFor(email, ip)) {
    const previous = await db.loginAttempt.findUnique({ where: { key } });
    if (previous?.lockedUntil && previous.lockedUntil > now) continue;
    const failuresBefore = effectiveFailures(previous, now);
    const data = {
      failures: failuresBefore + 1, windowStartedAt: failuresBefore ? previous!.windowStartedAt : now,
      lockedUntil: failuresBefore + 1 >= limit ? new Date(now.getTime() + LOGIN_LOCK_MS) : null,
    };
    await db.loginAttempt.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
  return loginState(ctx, email, ip, db);
}
export async function recordLoginFailure(ctx: AuthContext, email: string, ip: string): Promise<LoginState> {
  return authTransaction(ctx.db, tx => failedAttempt(ctx, tx, email, ip));
}
export type LoginResult =
  | { kind: 'authenticated'; user: AuthenticatedUser }
  | { kind: 'invalid-credentials' | 'account-not-activated' }
  | { kind: 'rate-limited'; lockedUntil: Date }
  | CaptchaResult;

// B still owns the route, Origin validation, HTTP IP limit and token response.
// This service rechecks the credential snapshot after expensive bcrypt work.
export async function authenticateLogin(ctx: AuthContext, input: unknown, ip: string): Promise<LoginResult> {
  const data = loginSchema.parse(input);
  const state = await loginState(ctx, data.email, ip);
  if (state.lockedUntil) return { kind: 'rate-limited', lockedUntil: state.lockedUntil };
  const captcha = state.captchaRequired ? await checkCaptcha(ctx, data.captchaToken, ip) : null;
  if (captcha) {
    const failed = await recordLoginFailure(ctx, data.email, ip);
    return failed.lockedUntil ? { kind: 'rate-limited', lockedUntil: failed.lockedUntil } : captcha;
  }
  const user = await ctx.db.user.findUnique({ where: { email: data.email } });
  const dummyHash = '$2b$12$uBkPZG1ufzmQC0ASxsxHwuEx3xMOoEi1nCLj4YhPgR4Ta0YqI3G4a';
  const matches = await bcrypt.compare(data.password, user?.passwordHash ?? dummyHash);
  return authTransaction<LoginResult>(ctx.db, async tx => {
    const freshState = await loginState(ctx, data.email, ip, tx);
    if (freshState.lockedUntil) return { kind: 'rate-limited', lockedUntil: freshState.lockedUntil };
    if (freshState.captchaRequired && !state.captchaRequired) return { kind: 'captcha-required' };
    const fresh = user ? await tx.user.findUnique({ where: { id: user.id } }) : null;
    if (!matches || !fresh || !user || fresh.passwordHash !== user.passwordHash || fresh.passwordVersion !== user.passwordVersion) {
      const failure = await failedAttempt(ctx, tx, data.email, ip);
      return failure.lockedUntil ? { kind: 'rate-limited', lockedUntil: failure.lockedUntil } : { kind: 'invalid-credentials' };
    }
    if (!activeUser(fresh)) return { kind: 'account-not-activated' };
    // Successful login clears this account only; it must not clear IP failures
    // accumulated while attacking other accounts.
    await tx.loginAttempt.deleteMany({ where: { key: keysFor(data.email, ip)[0].key } });
    return { kind: 'authenticated', user: { ...publicUser(fresh), passwordVersion: fresh.passwordVersion } };
  });
}
