import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { prisma } from '../db.js';
import { authClock, authTransaction, tokenHash } from './tokens.js';

declare module 'express-session' {
  interface SessionData {
    mfaPendingUserId?: number;
    mfaPendingPasswordVersion?: number;
    mfaPendingExpiresAt?: number;
    mfaSetupUserId?: number;
    mfaSetupPasswordVersion?: number;
    mfaSetupSecretEncrypted?: string;
    mfaSetupPreviousSecretEncrypted?: string;
    mfaSetupExpiresAt?: number;
    mfaSetupMode?: 'enable' | 'replace';
    mfaOneTimeCodesEncrypted?: string;
  }
}

export const MFA_PENDING_TTL_MS = 5 * 60 * 1000;
export const MFA_WINDOW_MS = 15 * 60 * 1000;
export const MFA_LOCK_MS = 15 * 60 * 1000;
export const MFA_ACCOUNT_LIMIT = 5;
export const MFA_RECOVERY_COUNT = 10;
type CredentialMethod = 'totp' | 'recovery';
export type MfaResult = { status: 'ok' | 'invalid' | 'locked' | 'unavailable'; retryAfter?: number };
export type MfaCodesResult = MfaResult & { codes?: string[] };
type MfaUser = { id: number; status: string; emailVerifiedAt: Date | null; mfaEnabled: boolean; mfaSecretEncrypted: string | null; mfaLastUsedStep: bigint | null };
type Db = Prisma.TransactionClient;

function encryptionKey(): Buffer {
  const encoded = process.env.MFA_ENCRYPTION_KEY || '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('MFA_ENCRYPTION_KEY must be 32 random bytes encoded as base64');
  return key;
}

export function assertMfaConfiguration(): void { encryptionKey(); }

export function sealMfaValue(plaintext: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1:${nonce.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

export function openMfaValue(sealed: string): string {
  const [version, nonceRaw, tagRaw, ciphertextRaw, extra] = sealed.split(':');
  if (version !== 'v1' || !nonceRaw || !tagRaw || !ciphertextRaw || extra) throw new Error('Invalid encrypted MFA value');
  const nonce = Buffer.from(nonceRaw, 'base64'), tag = Buffer.from(tagRaw, 'base64');
  if (nonce.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted MFA value');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64')), decipher.final()]).toString('utf8');
}

export function newMfaSecret(): string { return new OTPAuth.Secret({ size: 20 }).base32; }

function totp(secret: string, email: string) {
  return new OTPAuth.TOTP({ issuer: 'Bếp Nhà', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
}

export async function mfaSetupQr(secret: string, email: string): Promise<{ uri: string; qrDataUrl: string }> {
  const uri = totp(secret, email).toString();
  return { uri, qrDataUrl: await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 2, width: 260 }) };
}

export function totpStep(secret: string, email: string, rawCode: unknown, now = authClock.now()): bigint | null {
  if (typeof rawCode !== 'string' || !/^\d{6}$/.test(rawCode.trim())) return null;
  const delta = totp(secret, email).validate({ token: rawCode.trim(), window: 1, timestamp: now.getTime() });
  return delta === null ? null : BigInt(Math.floor(now.getTime() / 30_000) + delta);
}

const attemptKey = (userId: number) => `mfa:${tokenHash('MFA_FAILURE', String(userId))}`;
function failureCount(row: { failures: number; windowStartedAt: Date; lockedUntil: Date | null } | null, now: Date): number {
  if (!row || (row.lockedUntil && row.lockedUntil <= now) || now.getTime() - row.windowStartedAt.getTime() >= MFA_WINDOW_MS) return 0;
  return row.failures;
}

async function lockState(tx: Db, userId: number, now: Date) {
  const row = await tx.loginAttempt.findUnique({ where: { key: attemptKey(userId) } });
  return row?.lockedUntil && row.lockedUntil > now ? Math.max(1, Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000)) : 0;
}

async function failedMfa(tx: Db, userId: number, now: Date): Promise<MfaResult> {
  const key = attemptKey(userId);
  const previous = await tx.loginAttempt.findUnique({ where: { key } });
  const failuresBefore = failureCount(previous, now), failures = failuresBefore + 1;
  const lockedUntil = failures >= MFA_ACCOUNT_LIMIT ? new Date(now.getTime() + MFA_LOCK_MS) : null;
  const data = { failures, windowStartedAt: failuresBefore ? previous!.windowStartedAt : now, lockedUntil };
  await tx.loginAttempt.upsert({ where: { key }, create: { key, ...data }, update: data });
  return lockedUntil ? { status: 'locked', retryAfter: Math.ceil(MFA_LOCK_MS / 1000) } : { status: 'invalid' };
}

export async function mfaLockState(userId: number): Promise<number> {
  return lockState(prisma as Db, userId, authClock.now());
}

function normalizedRecoveryCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-F0-9]{32}$/.test(value) ? value : null;
}

export function newRecoveryCodes(): string[] {
  return Array.from({ length: MFA_RECOVERY_COUNT }, () => randomBytes(16).toString('hex').toUpperCase());
}

export async function replaceRecoveryCodes(tx: Db, userId: number): Promise<string[]> {
  const codes = newRecoveryCodes();
  await tx.recoveryCode.deleteMany({ where: { userId } });
  await tx.recoveryCode.createMany({ data: codes.map(code => ({ userId, codeHash: tokenHash('MFA_RECOVERY', code, userId) })) });
  return codes;
}

// Every counter update and credential consumption commits in a serializable
// transaction. A used TOTP time-step or recovery code cannot win twice.
export async function verifyMfaCredential(userId: number, email: string, method: unknown, rawCode: unknown, db: PrismaClient = prisma): Promise<MfaResult> {
  return authTransaction(db, async tx => {
    const now = authClock.now();
    const user = await tx.user.findUnique({ where: { id: userId } }) as MfaUser | null;
    if (!user || user.status !== 'active' || !user.emailVerifiedAt || !user.mfaEnabled || !user.mfaSecretEncrypted) return { status: 'unavailable' };
    const retryAfter = await lockState(tx, userId, now);
    if (retryAfter) return { status: 'locked', retryAfter };
    let accepted = false;
    if (method === 'totp') {
      const step = totpStep(openMfaValue(user.mfaSecretEncrypted), email, rawCode, now);
      if (step !== null) {
        const changed = await tx.user.updateMany({
          where: { id: userId, mfaEnabled: true, mfaSecretEncrypted: user.mfaSecretEncrypted,
            OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
          data: { mfaLastUsedStep: step },
        });
        accepted = changed.count === 1;
      }
    } else if (method === 'recovery') {
      const code = normalizedRecoveryCode(rawCode);
      if (code) {
        const codeHash = tokenHash('MFA_RECOVERY', code, userId);
        const used = await tx.recoveryCode.updateMany({ where: { userId, codeHash, usedAt: null }, data: { usedAt: now } });
        accepted = used.count === 1;
      }
    }
    if (!accepted) return failedMfa(tx, userId, now);
    await tx.loginAttempt.deleteMany({ where: { key: attemptKey(userId) } });
    return { status: 'ok' };
  });
}

export async function enableMfa(userId: number, passwordVersion: number, email: string, encryptedSecret: string, code: unknown, currentSid: string, db: PrismaClient = prisma): Promise<MfaCodesResult> {
  const secret = openMfaValue(encryptedSecret);
  return authTransaction(db, async tx => {
    const now = authClock.now(), retryAfter = await lockState(tx, userId, now);
    if (retryAfter) return { status: 'locked', retryAfter };
    const step = totpStep(secret, email, code, now);
    if (step === null) return failedMfa(tx, userId, now);
    const changed = await tx.user.updateMany({
      where: { id: userId, passwordVersion, status: 'active', emailVerifiedAt: { not: null }, mfaEnabled: false },
      data: { mfaEnabled: true, mfaSecretEncrypted: encryptedSecret, mfaLastUsedStep: step },
    });
    if (changed.count !== 1) return { status: 'unavailable' };
    const codes = await replaceRecoveryCodes(tx, userId);
    await tx.session.deleteMany({ where: { userId, sid: { not: currentSid } } });
    await tx.loginAttempt.deleteMany({ where: { key: attemptKey(userId) } });
    return { status: 'ok', codes };
  });
}

export async function replaceMfaSecret(userId: number, passwordVersion: number, email: string, encryptedSecret: string, code: unknown, currentSid: string, previousSecretEncrypted: string, db: PrismaClient = prisma): Promise<MfaCodesResult> {
  const secret = openMfaValue(encryptedSecret);
  return authTransaction(db, async tx => {
    const now = authClock.now(), retryAfter = await lockState(tx, userId, now);
    if (retryAfter) return { status: 'locked', retryAfter };
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active' || !user.emailVerifiedAt || user.passwordVersion !== passwordVersion || !user.mfaEnabled) return { status: 'unavailable' };
    // Bind the pending setup to the configuration that was reauthenticated.
    // A retry (even in a later TOTP step) or another configuration change loses.
    if (encryptedSecret === previousSecretEncrypted || user.mfaSecretEncrypted !== previousSecretEncrypted) return { status: 'invalid' };
    const step = totpStep(secret, email, code, now);
    if (step === null) return failedMfa(tx, userId, now);
    const changed = await tx.user.updateMany({
      where: { id: userId, passwordVersion, status: 'active', emailVerifiedAt: { not: null }, mfaEnabled: true, mfaSecretEncrypted: previousSecretEncrypted },
      data: { mfaSecretEncrypted: encryptedSecret, mfaLastUsedStep: step },
    });
    if (changed.count !== 1) return { status: 'invalid' };
    const codes = await replaceRecoveryCodes(tx, userId);
    await tx.session.deleteMany({ where: { userId, sid: { not: currentSid } } });
    await tx.loginAttempt.deleteMany({ where: { key: attemptKey(userId) } });
    return { status: 'ok', codes };
  });
}

export async function regenerateRecoveryCodes(userId: number, passwordVersion: number, currentSid: string): Promise<string[] | null> {
  return authTransaction(prisma, async tx => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active' || !user.emailVerifiedAt || user.passwordVersion !== passwordVersion || !user.mfaEnabled) return null;
    const codes = await replaceRecoveryCodes(tx, userId);
    await tx.session.deleteMany({ where: { userId, sid: { not: currentSid } } });
    return codes;
  });
}

export async function disableMfa(userId: number, passwordVersion: number, currentSid: string): Promise<boolean> {
  return authTransaction(prisma, async tx => {
    const changed = await tx.user.updateMany({
      where: { id: userId, passwordVersion, status: 'active', emailVerifiedAt: { not: null }, mfaEnabled: true },
      data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaLastUsedStep: null },
    });
    if (changed.count !== 1) return false;
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId, sid: { not: currentSid } } });
    return true;
  });
}
