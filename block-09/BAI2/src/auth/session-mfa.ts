import type { Prisma, PrismaClient } from '@prisma/client';

export const MFA_CODES_FIELD = 'mfaOneTimeCodesEncrypted';

// Compare the entire JSON value so a concurrent session save, logout or claim
// cannot be overwritten. This works across server processes without a mutex.
async function updateCodes(
  db: PrismaClient, sid: string, userId: number,
  change: (data: Prisma.JsonObject) => { data: Prisma.JsonObject; value: string } | null,
): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db.session.findUnique({ where: { sid } });
    if (!row || row.userId !== userId || row.expiresAt <= new Date()) return null;
    if (!row.sess || typeof row.sess !== 'object' || Array.isArray(row.sess)) return null;
    const next = change({ ...row.sess });
    if (!next) return null;
    const updated = await db.session.updateMany({
      where: { sid, userId, expiresAt: { gt: new Date() }, sess: { equals: row.sess as Prisma.InputJsonValue } },
      data: { sess: next.data as Prisma.InputJsonObject },
    });
    if (updated.count === 1) return next.value;
  }
  throw new Error('Concurrent session update; retry the request');
}

export async function publishMfaCodes(db: PrismaClient, sid: string, userId: number, encrypted: string): Promise<boolean> {
  return (await updateCodes(db, sid, userId, data => ({ data: { ...data, [MFA_CODES_FIELD]: encrypted }, value: encrypted }))) !== null;
}

export function claimMfaCodes(db: PrismaClient, sid: string, userId: number): Promise<string | null> {
  return updateCodes(db, sid, userId, data => {
    const value = data[MFA_CODES_FIELD];
    if (typeof value !== 'string') return null;
    delete data[MFA_CODES_FIELD];
    return { data, value };
  });
}
