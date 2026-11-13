import type { z } from 'zod';
import type { registerSchema, activateSchema, resendSchema, loginSchema, forgotSchema, resetSchema } from '../validation/auth.js';
import { AuthError } from './auth-errors.js';

/** Port owned by B. A implements this against Prisma; no database-shaped casts. */
export type AuthUser = {
  id: number | string; name: string; email: string; role: string;
  status: 'pending' | 'active'; emailVerifiedAt: Date | null; passwordVersion: number;
};
export type AuthSession = {
  user: AuthUser; familyId: string; passwordVersion: number;
  expiresAt: Date; absoluteExpiresAt: Date; usedAt: Date | null; revokedAt: Date | null;
};
export type SessionGrant = AuthSession & { refreshToken: string };
export type AuthContext = {
  ip: string;
  /** Login calls this only when its DB counters require CAPTCHA, before bcrypt. */
  verifyCaptcha(token: string): Promise<void>;
};
export const AUTH_IP_LIMITS = { register: 30, activate: 40, resend: 20, login: 120, forgot: 10, reset: 20, refresh: 60 } as const;
export type AuthAction = keyof typeof AUTH_IP_LIMITS;

export interface AuthServices {
  /** Atomic DB-backed IP counter: limits above, 15 minute window; throw RATE_LIMITED. */
  enforceIpLimit(action: AuthAction, ip: string): Promise<void>;
  register(input: z.infer<typeof registerSchema>, context: AuthContext): Promise<void>;
  activate(input: z.infer<typeof activateSchema>, context: AuthContext): Promise<void>;
  resend(input: z.infer<typeof resendSchema>, context: AuthContext): Promise<void>;
  /** Verify credentials/counters and atomically create a family; do not return hashes. */
  login(input: z.infer<typeof loginSchema>, context: AuthContext): Promise<SessionGrant>;
  forgot(input: z.infer<typeof forgotSchema>, context: AuthContext): Promise<void>;
  reset(input: z.infer<typeof resetSchema>, context: AuthContext): Promise<void>;
  /** HMAC lookup, including used tokens so B can detect replay. Never consume here. */
  inspectRefresh(rawToken: string): Promise<AuthSession | null>;
  /** Atomic consume/create/replacedById; on race/reuse COMMIT family revocation
   * before throwing REFRESH_TOKEN_REUSED (do not roll it back with the error). */
  rotateRefresh(rawToken: string): Promise<SessionGrant>;
  revokeFamily(familyId: string): Promise<void>;
  /** Read current user and a live, unused, unrevoked refresh row from the DB. */
  findAccessSession(userId: string, familyId: string): Promise<AuthSession | null>;
}

const unavailable = async (): Promise<never> => { throw new AuthError('AUTH_SERVICE_UNAVAILABLE'); };
// No fake accounts, memory-backed authentication or successful placeholder operations.
export const unavailableAuthServices: AuthServices = {
  enforceIpLimit: unavailable, register: unavailable, activate: unavailable, resend: unavailable,
  login: unavailable, forgot: unavailable, reset: unavailable, inspectRefresh: unavailable,
  rotateRefresh: unavailable, revokeFamily: unavailable, findAccessSession: unavailable,
};

export const publicUser = (user: AuthUser) => ({ id: user.id, name: user.name, email: user.email, role: user.role });
export const activeUser = (user: AuthUser) => user.status === 'active' && user.emailVerifiedAt !== null;
export function liveSession(session: AuthSession, now = Date.now()) {
  return activeUser(session.user) && session.passwordVersion === session.user.passwordVersion
    && !session.usedAt && !session.revokedAt && session.expiresAt.getTime() > now && session.absoluteExpiresAt.getTime() > now;
}
