import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { registerSchema, resetSchema, passwordSchema } from '../src/validation/auth.js';
import { csrfTokenForFamily, newRefreshToken, newResetToken, refreshHash, sameHash, tokenHash, authTransaction } from '../src/services/auth/tokens.js';
import { createAuthServices } from '../src/services/auth/index.js';
import { resetEmail } from '../src/services/auth/email.js';
import type { PrismaClient } from '@prisma/client';

process.env.AUTH_TOKEN_SECRET = 'role-a-unit-tests-only-01234567890123456789';
process.env.WEB_ORIGIN = 'http://localhost:5173';
const password = 'Password123';

test('validation strips role/invitation and normalizes email without altering password', () => {
  const value = registerSchema.parse({ name: ' Test ', email: ' TEST@EXAMPLE.COM ', password,
    confirmPassword: password, role: 'admin', invitationCode: 'not-needed', captchaToken: 'verified-server-side' });
  assert.equal(value.email, 'test@example.com');
  assert.equal(value.name, 'Test');
  assert.equal(value.password, password);
  assert.equal('role' in value, false);
  assert.equal('invitationCode' in value, false);
});
test('password validation enforces length, UTF-8 bytes and confirmation', () => {
  assert.equal(passwordSchema.safeParse('1234567').success, false);
  assert.equal(passwordSchema.safeParse('a'.repeat(72)).success, true);
  assert.equal(passwordSchema.safeParse('a'.repeat(73)).success, false);
  assert.equal(passwordSchema.safeParse('ế'.repeat(24)).success, true);
  assert.equal(passwordSchema.safeParse('ế'.repeat(25)).success, false);
  assert.equal(resetSchema.safeParse({ token: '', password, confirmPassword: 'different' }).success, false);
  assert.equal(resetSchema.safeParse({ token: '', password, confirmPassword: password }).success, true);
  assert.equal(resetSchema.parse({ password, confirmPassword: password }).token, '');
  assert.equal(resetSchema.parse({ token: 42, password, confirmPassword: password }).token, '');
});
test('refresh/CSRF follow exact HMAC formula and OTP is purpose/user-separated', () => {
  const raw = newRefreshToken();
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/);
  assert.match(newResetToken(), /^[a-f0-9]{64}$/);
  assert.equal(refreshHash(raw), createHmac('sha256', process.env.AUTH_TOKEN_SECRET!).update(raw).digest('hex'));
  assert.equal(csrfTokenForFamily('family'), createHmac('sha256', process.env.AUTH_TOKEN_SECRET!).update('csrf:family').digest('base64url'));
  assert.notEqual(tokenHash('OTP', '123456', 1), tokenHash('OTP', '123456', 2));
  assert.notEqual(tokenHash('OTP', '123456', 1), tokenHash('RESET', '123456', 1));
  assert.equal(sameHash('a', 'bb'), false);
  assert.equal(sameHash('ab', 'ab'), true);
});
test('AUTH_TOKEN_SECRET is mandatory; SESSION_SECRET cannot substitute', () => {
  const original = process.env.AUTH_TOKEN_SECRET;
  delete process.env.AUTH_TOKEN_SECRET;
  process.env.SESSION_SECRET = 'unused-session-secret-012345678901234567890';
  try { assert.throws(() => refreshHash('raw'), /AUTH_TOKEN_SECRET/); }
  finally { process.env.AUTH_TOKEN_SECRET = original; delete process.env.SESSION_SECRET; }
});
test('CAPTCHA failure and missing CAPTCHA stop before DB or password hashing work', async () => {
  let verified = 0;
  const db = new Proxy({}, { get() { throw new Error('DB must not be touched'); } }) as PrismaClient;
  const auth = createAuthServices({ db, verifyCaptcha: async () => { verified++; return false; } });
  assert.deepEqual(await auth.register({ name: 'A', email: 'a@example.com', password, confirmPassword: password }), { kind: 'captcha-required' });
  assert.equal(verified, 0);
  assert.deepEqual(await auth.register({ name: 'A', email: 'a@example.com', password, confirmPassword: password, captchaToken: 'invalid' }), { kind: 'invalid-captcha' });
  assert.equal(verified, 1);
  assert.deepEqual(await auth.requestPasswordReset({ email: 'a@example.com', captchaToken: 'invalid' }), { kind: 'invalid-captcha' });
  const failing = createAuthServices({ db, verifyCaptcha: async () => { throw new Error('verification down'); } });
  assert.deepEqual(await failing.requestPasswordReset({ email: 'a@example.com', captchaToken: 'token' }), { kind: 'invalid-captcha' });
});
test('default CAPTCHA adapter denies rather than accidentally allowing registration', async () => {
  const auth = createAuthServices({ db: {} as PrismaClient });
  assert.deepEqual(await auth.register({ name: 'A', email: 'a@example.com', password, confirmPassword: password, captchaToken: 'token' }), { kind: 'invalid-captcha' });
});
test('SMTP reset link targets CSR route and escapes its HTML URL', () => {
  const mail = resetEmail('a@example.com', 'a'.repeat(64));
  assert.match(mail.text, /http:\/\/localhost:5173\/reset\?token=a{64}/);
  assert.equal(mail.text.includes('/auth/reset-password'), false);
  process.env.WEB_ORIGIN = 'http://remote.example';
  try { assert.throws(() => resetEmail('a@example.com', 'token'), /WEB_ORIGIN/); }
  finally { process.env.WEB_ORIGIN = 'http://localhost:5173'; }
});
test('Serializable retries P2034 twice, preserves result and does not swallow errors', async () => {
  let attempts = 0;
  const db = { $transaction: async (work: (tx: unknown) => unknown, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: 'Serializable' });
    if (++attempts < 3) throw { code: 'P2034' };
    return work({});
  } } as unknown as PrismaClient;
  assert.equal(await authTransaction(db, async () => 'committed'), 'committed');
  assert.equal(attempts, 3);
  const broken = { $transaction: async () => { throw { code: 'P1001' }; } } as unknown as PrismaClient;
  await assert.rejects(authTransaction(broken, async () => null), { code: 'P1001' });
  const conflicted = { $transaction: async () => { throw { code: 'P2034' }; } } as unknown as PrismaClient;
  await assert.rejects(authTransaction(conflicted, async () => null), { code: 'P2034' });
});
