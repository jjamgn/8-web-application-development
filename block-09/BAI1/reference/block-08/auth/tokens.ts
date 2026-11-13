import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';

export const authClock = { now: () => new Date() };
export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESET_TTL_MS = 30 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_SENDS_PER_HOUR = 5;
export const MAX_OTP_ATTEMPTS = 5;
export const newOtp = () => String(randomInt(100000, 1000000));
export const newResetToken = () => randomBytes(32).toString('hex');

// A keyed hash also protects the small OTP space if only the database leaks.
export function tokenHash(purpose: string, raw: string, userId?: number) {
  const secret = process.env.AUTH_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error('Missing auth token secret');
  return createHmac('sha256', secret).update(`${purpose}:${userId ?? ''}:${raw}`).digest('hex');
}

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Serializable transactions keep attempt limits, resend limits and token
// consumption correct when several requests arrive together.
export async function authTransaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (error.code !== 'P2034' || attempt >= 2) throw error;
    }
  }
}
