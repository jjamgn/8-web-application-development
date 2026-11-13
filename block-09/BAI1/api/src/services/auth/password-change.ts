import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { changePasswordSchema } from '../../validation/auth.js';
import { activeUser, publicUser, type AuthContext, type SessionGrant } from './types.js';
import { revokeUserFamilies } from './refresh.js';
import { authTransaction, newRefreshToken, refreshHash, tokenHash, REFRESH_IDLE_MS, REFRESH_ABSOLUTE_MS } from './tokens.js';

export type PasswordChangeIdentity = { userId: number; familyId: string; passwordVersion: number };
export type PasswordChangeResult =
  | { kind: 'changed'; grant: SessionGrant }
  | { kind: 'invalid-current-password' | 'unauthenticated' }
  | { kind: 'rate-limited'; retryAfter: number };

export async function changePassword(ctx: Pick<AuthContext, 'db' | 'now'>, input: unknown, identity: PasswordChangeIdentity): Promise<PasswordChangeResult> {
  const data = changePasswordSchema.parse(input);
  const key = 'pwd:' + tokenHash('PASSWORD_CHANGE_USER', String(identity.userId));
  // Commit the quota independently so rejected passwords still consume an attempt.
  const retryAfter = await authTransaction(ctx.db, async tx => {
    const now = ctx.now();
    const previous = await tx.loginAttempt.findUnique({ where: { key } });
    const current = previous && now.getTime() - previous.windowStartedAt.getTime() < 900000 ? previous : null;
    if (current && current.failures >= 5) return Math.max(1, Math.ceil((current.windowStartedAt.getTime() + 900000 - now.getTime()) / 1000));
    const next = { failures: (current?.failures ?? 0) + 1, windowStartedAt: current?.windowStartedAt ?? now, lockedUntil: null };
    await tx.loginAttempt.upsert({ where: { key }, create: { key, ...next }, update: next });
    return null;
  });
  if (retryAfter !== null) return { kind: 'rate-limited', retryAfter };
  const candidate = await ctx.db.user.findUnique({ where: { id: identity.userId } });
  if (!activeUser(candidate) || candidate.passwordVersion !== identity.passwordVersion) return { kind: 'unauthenticated' };
  if (!await bcrypt.compare(data.currentPassword, candidate.passwordHash)) return { kind: 'invalid-current-password' };
  const passwordHash = await bcrypt.hash(data.password, 12);

  return authTransaction<PasswordChangeResult>(ctx.db, async tx => {
    const now = ctx.now();
    const user = await tx.user.findUnique({ where: { id: identity.userId } });
    if (!activeUser(user) || user.passwordVersion !== identity.passwordVersion || user.passwordHash !== candidate.passwordHash) return { kind: 'unauthenticated' };
    const session = await tx.refreshToken.findFirst({ where: {
      userId: user.id, familyId: identity.familyId, passwordVersion: identity.passwordVersion,
      usedAt: null, revokedAt: null, expiresAt: { gt: now }, absoluteExpiresAt: { gt: now },
    } });
    if (!session) return { kind: 'unauthenticated' };
    const changed = await tx.user.updateMany({
      where: { id: user.id, passwordHash: candidate.passwordHash, passwordVersion: identity.passwordVersion },
      data: { passwordHash, passwordVersion: { increment: 1 } },
    });
    if (changed.count !== 1) return { kind: 'unauthenticated' };
    await revokeUserFamilies(tx, user.id, now);
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    const refreshToken = newRefreshToken();
    const familyId = randomUUID();
    const passwordVersion = identity.passwordVersion + 1;
    const row = await tx.refreshToken.create({ data: {
      userId: user.id, familyId, passwordVersion, tokenHash: refreshHash(refreshToken),
      createdAt: now, expiresAt: new Date(now.getTime() + REFRESH_IDLE_MS),
      absoluteExpiresAt: new Date(now.getTime() + REFRESH_ABSOLUTE_MS),
    } });
    return { kind: 'changed', grant: {
      user: publicUser(user), passwordVersion, familyId, refreshToken,
      expiresAt: row.expiresAt, absoluteExpiresAt: row.absoluteExpiresAt,
    } };
  });
}
