import type { PrismaClient, User } from '@prisma/client';
import type { EmailMessage } from './email.js';

export type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'role'>;
export type AuthenticatedUser = PublicUser & { passwordVersion: number };
/** Internal only: B must construct its response explicitly, never JSON this. */
export type SessionGrant = {
  user: PublicUser;
  passwordVersion: number;
  familyId: string;
  refreshToken: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
};
export type RefreshContext = Omit<SessionGrant, 'refreshToken'>;
export type RotateResult =
  | { kind: 'rotated'; grant: SessionGrant }
  | { kind: 'invalid' }
  | { kind: 'reused' };
export type CaptchaResult = { kind: 'captcha-required' } | { kind: 'invalid-captcha' };
export type AuthContext = {
  db: PrismaClient;
  now: () => Date;
  sendEmail: (message: EmailMessage) => Promise<void>;
  verifyCaptcha: (token: string, ip?: string) => Promise<boolean>;
};
export function publicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
export function activeUser(user: User | null): user is User {
  return user?.status === 'active' && user.emailVerifiedAt !== null;
}
export async function checkCaptcha(ctx: AuthContext, token: string | undefined, ip?: string): Promise<CaptchaResult | null> {
  if (!token) return { kind: 'captcha-required' };
  // Verification outages must fail closed, before any bcrypt or token issuance.
  try {
    return await ctx.verifyCaptcha(token, ip) ? null : { kind: 'invalid-captcha' };
  } catch {
    return { kind: 'invalid-captcha' };
  }
}
