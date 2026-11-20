import 'dotenv/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_INTERVAL_MS = 60 * 1000;
export const OTP_LOCK_MS = 15 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function otpDigest(userId: number, otp: string): string {
  const secret = process.env.OTP_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('OTP_SECRET_INVALID');
  return createHmac('sha256', secret).update(`email-verification:v1:${userId}:${otp}`).digest('hex');
}

export function otpMatches(userId: number, otp: unknown, storedHash: string): boolean {
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp) || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(otpDigest(userId, otp), 'hex'), Buffer.from(storedHash, 'hex'));
}
