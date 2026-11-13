import { prisma } from '../../db.js';
import { mailer } from './email.js';
import type { AuthContext } from './types.js';
import * as registration from './registration.js';
import * as recovery from './password-recovery.js';
import * as refresh from './refresh.js';
import * as login from './login-attempts.js';

export type { PublicUser, AuthenticatedUser, SessionGrant, RefreshContext, RotateResult, AuthContext, CaptchaResult } from './types.js';
export type { LoginState, LoginResult } from './login-attempts.js';
export { csrfTokenForFamily } from './tokens.js';
export { revokeUserFamilies } from './refresh.js';

export function createAuthServices(options: Partial<AuthContext> = {}) {
  const ctx: AuthContext = {
    db: options.db ?? prisma,
    now: options.now ?? (() => new Date()),
    sendEmail: options.sendEmail ?? (message => mailer.send(message)),
    // B must inject server-side Turnstile verification; never accept a boolean
    // supplied in the browser's request as evidence of successful verification.
    verifyCaptcha: options.verifyCaptcha ?? (async () => false),
  };
  return {
    register: (input: unknown, ip?: string) => registration.register(ctx, input, ip),
    activate: (email: string, otp: string) => registration.activate(ctx, email, otp),
    resendActivation: (email: string) => registration.resendActivation(ctx, email),
    requestPasswordReset: (input: unknown, ip?: string) => recovery.requestPasswordReset(ctx, input, ip),
    resetPassword: (input: unknown) => recovery.resetPassword(ctx, input),
    createRefreshFamily: (user: { userId: number; passwordVersion: number }) => refresh.createRefreshFamily(ctx, user),
    inspectRefresh: (raw: string) => refresh.inspectRefresh(ctx, raw),
    refreshFamilyForCsrf: (raw: string) => refresh.refreshFamilyForCsrf(ctx, raw),
    rotateRefresh: (raw: string) => refresh.rotateRefresh(ctx, raw),
    revokeFamily: (familyId: string) => refresh.revokeFamily(ctx, familyId),
    loginState: (email: string, ip: string) => login.loginState(ctx, email, ip),
    recordLoginFailure: (email: string, ip: string) => login.recordLoginFailure(ctx, email, ip),
    authenticateLogin: (input: unknown, ip: string) => login.authenticateLogin(ctx, input, ip),
  };
}
