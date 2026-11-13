import { prisma } from '../db.js';
import { createAuthServices } from '../services/auth/index.js';
import type { AuthContext as ServiceContext, SessionGrant as ServiceGrant } from '../services/auth/types.js';
import { authTransaction, tokenHash } from '../services/auth/tokens.js';
import { AuthError } from './auth-errors.js';
import { changePassword } from '../services/auth/password-change.js';
import { updateProfile } from '../services/auth/profile.js';
import { AUTH_IP_LIMITS, liveSession, type AuthServices, type AuthContext, type AuthSession, type SessionGrant } from './auth-services.js';

/** Maps A's transactional services to B's HTTP port without exposing DB records. */
export function createProductionAuthServices(options: Partial<Omit<ServiceContext, 'verifyCaptcha'>> = {}): AuthServices {
  const db = options.db ?? prisma;
  const now = options.now ?? (() => new Date());
  const service = (context?: AuthContext) => createAuthServices({
    ...options, db, now,
    verifyCaptcha: async token => {
      if (!context) return false;
      await context.verifyCaptcha(token);
      return true;
    },
  });
  async function grant(value: ServiceGrant): Promise<SessionGrant> {
    const user = await db.user.findUnique({ where: { id: value.user.id } });
    if (!user) throw new AuthError('INVALID_REFRESH_TOKEN');
    const result = { ...value, user, usedAt: null, revokedAt: null };
    if (!liveSession(result, now().getTime())) {
      await service().revokeFamily(value.familyId);
      throw new AuthError('INVALID_REFRESH_TOKEN');
    }
    return result;
  }
  function captchaResult(result: { kind: string }) {
    if (result.kind === 'captcha-required') throw new AuthError('CAPTCHA_REQUIRED');
    if (result.kind === 'invalid-captcha') throw new AuthError('INVALID_CAPTCHA');
  }
  return {
    async enforceIpLimit(action, ip) {
      if (!process.env.AUTH_TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET.length < 32 || (!options.db && !process.env.DATABASE_URL)) throw new AuthError('AUTH_SERVICE_UNAVAILABLE');
      const limit = AUTH_IP_LIMITS[action];
      const key = `http:${action}:${tokenHash('HTTP_IP', ip)}`;
      const retryAfter = await authTransaction(db, async tx => {
        const time = now();
        const previous = await tx.loginAttempt.findUnique({ where: { key } });
        const current = previous && time.getTime() - previous.windowStartedAt.getTime() < 900000 ? previous : null;
        if (current && current.failures >= limit) return Math.max(1, Math.ceil((current.windowStartedAt.getTime() + 900000 - time.getTime()) / 1000));
        const data = { failures: (current?.failures ?? 0) + 1, windowStartedAt: current?.windowStartedAt ?? time, lockedUntil: null };
        await tx.loginAttempt.upsert({ where: { key }, create: { key, ...data }, update: data });
        return null;
      });
      if (retryAfter !== null) throw new AuthError('RATE_LIMITED', undefined, retryAfter);
    },
    async register(input, context) { captchaResult(await service(context).register(input, context.ip)); },
    async activate(input) {
      if ((await service().activate(input.email, input.otp)).kind !== 'activated') throw new AuthError('INVALID_OTP');
    },
    async resend(input) { await service().resendActivation(input.email); },
    async forgot(input, context) { captchaResult(await service(context).requestPasswordReset(input, context.ip)); },
    async reset(input) {
      if ((await service().resetPassword(input)).kind !== 'reset') throw new AuthError('INVALID_RESET_TOKEN');
    },
    async changePassword(input, identity) {
      if (!/^[1-9]\d*$/.test(identity.userId) || !Number.isSafeInteger(Number(identity.userId))) throw new AuthError('UNAUTHENTICATED');
      const result = await changePassword({ db, now }, input, {
        userId: Number(identity.userId), familyId: identity.familyId, passwordVersion: identity.passwordVersion,
      });
      if (result.kind === 'rate-limited') throw new AuthError('RATE_LIMITED', undefined, result.retryAfter);
      if (result.kind === 'invalid-current-password') throw new AuthError('CURRENT_PASSWORD_INVALID', { currentPassword: 'Mật khẩu hiện tại chưa đúng.' });
      if (result.kind !== 'changed') throw new AuthError('UNAUTHENTICATED');
      return grant(result.grant);
    },
    async updateProfile(input, identity) {
      if (!/^[1-9]\d*$/.test(identity.userId) || !Number.isSafeInteger(Number(identity.userId))) throw new AuthError('UNAUTHENTICATED');
      const result = await updateProfile({ db, now }, input, { ...identity, userId: Number(identity.userId) });
      if (!result) throw new AuthError('UNAUTHENTICATED');
      return result;
    },
    async login(input, context) {
      const auth = service(context);
      const result = await auth.authenticateLogin(input, context.ip);
      captchaResult(result);
      if (result.kind === 'rate-limited') throw new AuthError('RATE_LIMITED', undefined, Math.max(1, Math.ceil((result.lockedUntil.getTime() - now().getTime()) / 1000)));
      if (result.kind === 'account-not-activated') throw new AuthError('ACCOUNT_NOT_ACTIVATED');
      if (result.kind !== 'authenticated') throw new AuthError('INVALID_CREDENTIALS');
      const issued = await auth.createRefreshFamily({ userId: result.user.id, passwordVersion: result.user.passwordVersion });
      if (!issued) throw new AuthError('INVALID_CREDENTIALS');
      return grant(issued);
    },
    async inspectRefresh(raw) {
      const valid = await service().inspectRefresh(raw);
      if (!valid) return null;
      const user = await db.user.findUnique({ where: { id: valid.user.id } });
      if (!user) return null;
      const result: AuthSession = { ...valid, user, usedAt: null, revokedAt: null };
      return liveSession(result, now().getTime()) ? result : null;
    },
    refreshFamilyForCsrf: raw => service().refreshFamilyForCsrf(raw),
    async rotateRefresh(raw) {
      const result = await service().rotateRefresh(raw);
      if (result.kind === 'reused') throw new AuthError('REFRESH_TOKEN_REUSED');
      if (result.kind === 'invalid') throw new AuthError('INVALID_REFRESH_TOKEN');
      return grant(result.grant);
    },
    revokeFamily: familyId => service().revokeFamily(familyId),
    async findAccessSession(userId, familyId) {
      if (!/^[1-9]\d*$/.test(userId) || !Number.isSafeInteger(Number(userId))) return null;
      const time = now();
      const row = await db.refreshToken.findFirst({ where: {
        userId: Number(userId), familyId, usedAt: null, revokedAt: null,
        expiresAt: { gt: time }, absoluteExpiresAt: { gt: time },
      }, include: { user: true } });
      if (!row) return null;
      return liveSession(row, time.getTime()) ? row : null;
    },
  };
}
