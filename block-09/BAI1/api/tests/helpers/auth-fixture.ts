// TEST DOUBLE ONLY: models A's port so B's HTTP/security boundary can be tested.
// This is not evidence of PostgreSQL transaction/quota correctness.
import { randomBytes, randomUUID } from 'node:crypto';
import { AuthError } from '../../src/lib/auth-errors.js';
import { AUTH_IP_LIMITS, liveSession, type AuthAction, type AuthServices, type AuthUser, type SessionGrant } from '../../src/lib/auth-services.js';

export function createAuthFixture() {
  const user: AuthUser = { id: 1, name: 'Người dùng', email: 'user@example.test', role: 'viewer', status: 'active', emailVerifiedAt: new Date(), passwordVersion: 0 };
  const rows = new Map<string, SessionGrant>();
  const quotas = new Map<string, number>();
  const calls: { operation: string; input?: unknown }[] = [];
  const fixture = { user, rows, calls, loginError: undefined as AuthError | undefined, operationError: undefined as AuthError | undefined, captchaRequired: false, services: {} as AuthServices };
  function issue(familyId: string = randomUUID(), absoluteExpiresAt = new Date(Date.now() + 30 * 86400000)) {
    const grant: SessionGrant = { user: { ...user }, familyId, passwordVersion: user.passwordVersion,
      refreshToken: randomBytes(32).toString('base64url'), expiresAt: new Date(Math.min(Date.now() + 7 * 86400000, absoluteExpiresAt.getTime())), absoluteExpiresAt, usedAt: null, revokedAt: null };
    rows.set(grant.refreshToken, grant);
    return grant;
  }
  const snapshot = (row: SessionGrant) => ({ ...row, user: { ...user } });
  const operation = async (name: string, input: unknown) => {
    calls.push({ operation: name, input });
    if (fixture.operationError) throw fixture.operationError;
  };
  fixture.services = {
    async enforceIpLimit(action: AuthAction, ip: string) {
      calls.push({ operation: `limit:${action}` });
      const key = `${action}:${ip}`;
      const count = (quotas.get(key) || 0) + 1;
      quotas.set(key, count);
      if (count > AUTH_IP_LIMITS[action]) throw new AuthError('RATE_LIMITED', undefined, 900);
    },
    register: input => operation('register', input),
    activate: input => operation('activate', input),
    resend: input => operation('resend', input),
    forgot: input => operation('forgot', input),
    async reset(input) { await operation('reset', input); user.passwordVersion++; for (const row of rows.values()) row.revokedAt = new Date(); },
    async updateProfile(input) { await operation('update-profile', input); user.name = input.name; return { id: user.id, name: user.name, email: user.email, role: user.role }; },
    async changePassword(input) {
      await operation('change-password', input);
      if (input.currentPassword !== 'password-test') throw new AuthError('CURRENT_PASSWORD_INVALID');
      user.passwordVersion++;
      for (const row of rows.values()) row.revokedAt = new Date();
      return issue();
    },
    async login(input, context) {
      calls.push({ operation: 'login', input });
      if (fixture.loginError) throw fixture.loginError;
      if (fixture.captchaRequired) await context.verifyCaptcha(input.captchaToken);
      if (input.password !== 'password-test') throw new AuthError('INVALID_CREDENTIALS');
      if (user.status !== 'active' || !user.emailVerifiedAt) throw new AuthError('ACCOUNT_NOT_ACTIVATED');
      return issue();
    },
    async inspectRefresh(raw) { const row = rows.get(raw); return row ? snapshot(row) : null; },
    async refreshFamilyForCsrf(raw) { return rows.get(raw)?.familyId ?? null; },
    async rotateRefresh(raw) {
      const row = rows.get(raw);
      if (!row) throw new AuthError('INVALID_REFRESH_TOKEN');
      if (row.usedAt) {
        for (const item of rows.values()) if (item.familyId === row.familyId) item.revokedAt = new Date();
        throw new AuthError('REFRESH_TOKEN_REUSED');
      }
      if (!liveSession(snapshot(row))) {
        for (const item of rows.values()) if (item.familyId === row.familyId) item.revokedAt = new Date();
        throw new AuthError('INVALID_REFRESH_TOKEN');
      }
      row.usedAt = new Date();
      return issue(row.familyId, row.absoluteExpiresAt);
    },
    async revokeFamily(familyId) { for (const row of rows.values()) if (row.familyId === familyId) row.revokedAt = new Date(); },
    async findAccessSession(userId, familyId) {
      if (String(user.id) !== userId) return null;
      for (const row of rows.values()) if (row.familyId === familyId && liveSession(snapshot(row))) return snapshot(row);
      return null;
    },
  };
  return fixture;
}
