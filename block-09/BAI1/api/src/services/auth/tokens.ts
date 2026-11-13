import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';

// Compatibility exports for B's extracted helpers; A's factory still allows
// an explicit clock to be injected for service-level tests.
export const authClock = { now: () => new Date() };

export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESET_TTL_MS = 30 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const MAX_SENDS_PER_HOUR = 5;
export const MAX_OTP_ATTEMPTS = 5;
export const REFRESH_IDLE_MS = 7 * 24 * HOUR_MS;
export const REFRESH_ABSOLUTE_MS = 30 * 24 * HOUR_MS;
export const newOtp = () => String(randomInt(100000, 1000000));
export const newResetToken = () => randomBytes(32).toString('hex');
export const newRefreshToken = () => randomBytes(32).toString('base64url');

function secret() {
  const value = process.env.AUTH_TOKEN_SECRET;
  if (!value || value.length < 32) throw new Error('AUTH_TOKEN_SECRET needs at least 32 random characters');
  return value;
}
export function tokenHash(purpose: string, raw: string, userId?: number) {
  return createHmac('sha256', secret()).update(`${purpose}:${userId ?? ''}:${raw}`).digest('hex');
}
// The refresh and CSRF formulae are deliberately distinct from the OTP/reset
// purpose/user-separated hashes, matching the CSR contract exactly.
export const refreshHash = (raw: string) => createHmac('sha256', secret()).update(raw).digest('hex');
export const refreshTokenHash = refreshHash;
export const csrfTokenForFamily = (familyId: string) => createHmac('sha256', secret()).update(`csrf:${familyId}`).digest('base64url');
export function sameHash(left: string, right: string) {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
export function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
}

// Keep network/email/bcrypt outside the callback: a serializable conflict can
// re-run it. All decisions about expiry use a fresh clock reading on each try.
export async function authTransaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (errorCode(error) !== 'P2034' || attempt >= 2) throw error;
    }
  }
}
