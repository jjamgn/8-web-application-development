import { randomUUID } from 'node:crypto';
import type { Prisma, RefreshToken, User } from '@prisma/client';
import { activeUser, publicUser, type AuthContext, type RefreshContext, type RotateResult, type SessionGrant } from './types.js';
import { authTransaction, newRefreshToken, REFRESH_ABSOLUTE_MS, REFRESH_IDLE_MS, refreshHash } from './tokens.js';

const validShape = (raw: string) => /^[A-Za-z0-9_-]{43}$/.test(raw);
const expiry = (now: Date, absolute: Date) => new Date(Math.min(now.getTime() + REFRESH_IDLE_MS, absolute.getTime()));
const usable = (row: RefreshToken, user: User | null, now: Date) =>
  !row.revokedAt && row.expiresAt > now && row.absoluteExpiresAt > now &&
  activeUser(user) && row.passwordVersion === user.passwordVersion;
function context(row: RefreshToken, user: User): RefreshContext {
  return { user: publicUser(user), passwordVersion: row.passwordVersion, familyId: row.familyId,
    expiresAt: row.expiresAt, absoluteExpiresAt: row.absoluteExpiresAt };
}
export async function revokeUserFamilies(tx: Prisma.TransactionClient, userId: number, now: Date) {
  await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
}

export async function createRefreshFamily(
  ctx: AuthContext, authenticated: { userId: number; passwordVersion: number },
): Promise<SessionGrant | null> {
  return authTransaction(ctx.db, async tx => {
    const user = await tx.user.findUnique({ where: { id: authenticated.userId } });
    if (!activeUser(user) || user.passwordVersion !== authenticated.passwordVersion) return null;
    const now = ctx.now();
    const absolute = new Date(now.getTime() + REFRESH_ABSOLUTE_MS);
    const raw = newRefreshToken();
    const row = await tx.refreshToken.create({ data: {
      userId: user.id, familyId: randomUUID(), passwordVersion: user.passwordVersion,
      tokenHash: refreshHash(raw), createdAt: now, expiresAt: expiry(now, absolute), absoluteExpiresAt: absolute,
    } });
    return { ...context(row, user), refreshToken: raw };
  });
}

// Read-only: /csrf must neither rotate nor extend the lifetime of a token.
export async function inspectRefresh(ctx: AuthContext, raw: string): Promise<RefreshContext | null> {
  if (!validShape(raw)) return null;
  const row = await ctx.db.refreshToken.findUnique({ where: { tokenHash: refreshHash(raw) }, include: { user: true } });
  if (!row || row.usedAt || !usable(row, row.user, ctx.now())) return null;
  return context(row, row.user);
}

// For POST /refresh's CSRF check only, NOT for /csrf or authorizing a session.
// Consumed tokens must still reach rotateRefresh to trigger family revocation.
export async function refreshFamilyForCsrf(ctx: AuthContext, raw: string): Promise<string | null> {
  if (!validShape(raw)) return null;
  const row = await ctx.db.refreshToken.findUnique({ where: { tokenHash: refreshHash(raw) }, select: { familyId: true } });
  return row?.familyId ?? null;
}

export async function rotateRefresh(ctx: AuthContext, raw: string): Promise<RotateResult> {
  if (!validShape(raw)) return { kind: 'invalid' };
  const hash = refreshHash(raw);
  return authTransaction<RotateResult>(ctx.db, async tx => {
    const now = ctx.now();
    const row = await tx.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: true } });
    if (!row) return { kind: 'invalid' };
    // Check reuse even if this consumed token has passed its individual expiry.
    // Keep consumed records for detection until the family's absolute lifetime.
    if (row.usedAt) {
      await tx.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: now } });
      return { kind: 'reused' }; // The transaction commits BEFORE HTTP maps 401.
    }
    if (!usable(row, row.user, now)) {
      await tx.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: now } });
      return { kind: 'invalid' };
    }
    const consumed = await tx.refreshToken.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null, expiresAt: { gt: now }, absoluteExpiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) {
      await tx.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: now } });
      return { kind: 'reused' };
    }
    const nextRaw = newRefreshToken();
    const next = await tx.refreshToken.create({ data: {
      userId: row.userId, familyId: row.familyId, passwordVersion: row.passwordVersion,
      tokenHash: refreshHash(nextRaw), createdAt: now,
      expiresAt: expiry(now, row.absoluteExpiresAt), absoluteExpiresAt: row.absoluteExpiresAt,
    } });
    await tx.refreshToken.update({ where: { id: row.id }, data: { replacedById: next.id } });
    return { kind: 'rotated', grant: { ...context(next, row.user), refreshToken: nextRaw } };
  });
}

export async function revokeFamily(ctx: AuthContext, familyId: string): Promise<void> {
  await authTransaction(ctx.db, async tx => {
    await tx.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: ctx.now() } });
  });
}
