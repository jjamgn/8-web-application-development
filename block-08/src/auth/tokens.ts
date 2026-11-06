import { createHmac } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';

export const authClock = { now: () => new Date() };

// Persist opaque keys for login counters instead of raw email/IP values.
export function tokenHash(purpose: string, raw: string) {
  const secret = process.env.AUTH_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error('Missing login counter secret');
  return createHmac('sha256', secret).update(purpose + '::' + raw).digest('hex');
}

// Retrying serialization conflicts keeps concurrent failure counters correct.
export async function authTransaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error: any) { if (error.code !== 'P2034' || attempt >= 2) throw error; }
  }
}
