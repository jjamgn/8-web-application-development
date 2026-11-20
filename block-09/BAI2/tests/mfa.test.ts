import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import * as OTPAuth from 'otpauth';
import { authClock, tokenHash } from '../src/auth/tokens.js';
import {
  MFA_RECOVERY_COUNT, enableMfa, mfaSetupQr, newMfaSecret, newRecoveryCodes,
  openMfaValue, sealMfaValue, totpStep, verifyMfaCredential,
} from '../src/auth/mfa.js';

process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.AUTH_TOKEN_SECRET = randomBytes(32).toString('hex');
const fixed = new Date('2026-11-20T00:00:00.000Z');
const email = 'mfa-test@example.invalid';

function codeFor(secret: string) {
  return new OTPAuth.TOTP({ issuer: 'Bếp Nhà', label: email, algorithm: 'SHA1', digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: fixed.getTime() });
}

function fakeDb(secret: string) {
  const user = { id: 11, status: 'active', emailVerifiedAt: fixed, mfaEnabled: true,
    mfaSecretEncrypted: sealMfaValue(secret), mfaLastUsedStep: null as bigint | null };
  const attempts = new Map<string, { key: string; failures: number; windowStartedAt: Date; lockedUntil: Date | null }>();
  const recovery = new Map<string, Date | null>();
  const tx = {
    user: {
      findUnique: async () => ({ ...user }),
      updateMany: async ({ where, data }: any) => {
        if (!user.mfaEnabled || user.mfaSecretEncrypted !== where.mfaSecretEncrypted) return { count: 0 };
        if (user.mfaLastUsedStep !== null && user.mfaLastUsedStep >= where.OR[1].mfaLastUsedStep.lt) return { count: 0 };
        user.mfaLastUsedStep = data.mfaLastUsedStep;
        return { count: 1 };
      },
    },
    loginAttempt: {
      findUnique: async ({ where }: any) => attempts.get(where.key) ?? null,
      upsert: async ({ where, create, update }: any) => { attempts.set(where.key, attempts.has(where.key) ? { key: where.key, ...update } : create); },
      deleteMany: async ({ where }: any) => { attempts.delete(where.key); },
    },
    recoveryCode: {
      updateMany: async ({ where, data }: any) => {
        if (!recovery.has(where.codeHash) || recovery.get(where.codeHash)) return { count: 0 };
        recovery.set(where.codeHash, data.usedAt);
        return { count: 1 };
      },
    },
  };
  const db = { $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } as unknown as PrismaClient;
  return { db, user, attempts, recovery };
}

test('MFA secret encryption authenticates its ciphertext and QR uses otpauth URI', async () => {
  const secret = newMfaSecret();
  const encrypted = sealMfaValue(secret);
  assert.equal(openMfaValue(encrypted), secret);
  assert.throws(() => openMfaValue(encrypted.slice(0, -2) + 'AA'));
  const qr = await mfaSetupQr(secret, email);
  assert.match(qr.uri, /^otpauth:\/\/totp\//);
  assert.match(qr.qrDataUrl, /^data:image\/png;base64,/);
  assert.equal(totpStep(secret, email, codeFor(secret), fixed), BigInt(fixed.getTime() / 30_000));
});

test('TOTP time step cannot be consumed twice', async () => {
  const originalClock = authClock.now;
  authClock.now = () => fixed;
  try {
    const secret = newMfaSecret(), state = fakeDb(secret), code = codeFor(secret);
    assert.equal((await verifyMfaCredential(11, email, 'totp', code, state.db)).status, 'ok');
    assert.equal((await verifyMfaCredential(11, email, 'totp', code, state.db)).status, 'invalid');
    assert.equal(state.user.mfaLastUsedStep, BigInt(fixed.getTime() / 30_000));
  } finally { authClock.now = originalClock; }
});

test('Recovery codes are unique and a code can be consumed only once', async () => {
  const originalClock = authClock.now;
  authClock.now = () => fixed;
  try {
    const state = fakeDb(newMfaSecret()), codes = newRecoveryCodes();
    assert.equal(codes.length, MFA_RECOVERY_COUNT);
    assert.equal(new Set(codes).size, MFA_RECOVERY_COUNT);
    assert.ok(codes.every(code => /^[A-F0-9]{32}$/.test(code)));
    state.recovery.set(tokenHash('MFA_RECOVERY', codes[0], 11), null);
    assert.equal((await verifyMfaCredential(11, email, 'recovery', codes[0], state.db)).status, 'ok');
    assert.equal((await verifyMfaCredential(11, email, 'recovery', codes[0], state.db)).status, 'invalid');
  } finally { authClock.now = originalClock; }
});

test('enabling MFA stores only encrypted secret and code hashes, and revokes other sessions', async () => {
  const originalClock = authClock.now;
  authClock.now = () => fixed;
  try {
    const secret = newMfaSecret(), encrypted = sealMfaValue(secret);
    let enabled = false, savedSecret = '', savedStep: bigint | null = null;
    let storedHashes: string[] = [], revokedWhere: any;
    const tx = {
      loginAttempt: { findUnique: async () => null, deleteMany: async () => ({ count: 0 }) },
      user: { updateMany: async ({ where, data }: any) => {
        if (enabled || where.mfaEnabled !== false || where.passwordVersion !== 0) return { count: 0 };
        enabled = data.mfaEnabled; savedSecret = data.mfaSecretEncrypted; savedStep = data.mfaLastUsedStep;
        return { count: 1 };
      } },
      recoveryCode: {
        deleteMany: async () => ({ count: 0 }),
        createMany: async ({ data }: any) => { storedHashes = data.map((row: any) => row.codeHash); return { count: data.length }; },
      },
      session: { deleteMany: async ({ where }: any) => { revokedWhere = where; return { count: 1 }; } },
    };
    const db = { $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } as unknown as PrismaClient;
    const result = await enableMfa(11, 0, email, encrypted, codeFor(secret), 'current-sid', db);
    assert.equal(result.status, 'ok');
    assert.equal(savedSecret, encrypted);
    assert.notEqual(savedSecret, secret);
    assert.equal(savedStep, BigInt(fixed.getTime() / 30_000));
    assert.equal(result.codes?.length, MFA_RECOVERY_COUNT);
    assert.equal(storedHashes.length, MFA_RECOVERY_COUNT);
    assert.ok(result.codes?.every(code => !storedHashes.includes(code)));
    assert.deepEqual(revokedWhere, { userId: 11, sid: { not: 'current-sid' } });
  } finally { authClock.now = originalClock; }
});

test('Five invalid MFA attempts lock the account even for a correct code', async () => {
  const originalClock = authClock.now;
  authClock.now = () => fixed;
  try {
    const secret = newMfaSecret(), state = fakeDb(secret);
    for (let i = 0; i < 4; i++) assert.equal((await verifyMfaCredential(11, email, 'totp', '000000', state.db)).status, 'invalid');
    assert.equal((await verifyMfaCredential(11, email, 'totp', '000000', state.db)).status, 'locked');
    assert.equal((await verifyMfaCredential(11, email, 'totp', codeFor(secret), state.db)).status, 'locked');
  } finally { authClock.now = originalClock; }
});
