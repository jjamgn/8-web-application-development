import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailVerificationService, VerificationError } from '../src/services/email-verification.js';
import { otpDigest, otpMatches, OTP_LOCK_MS, OTP_RESEND_INTERVAL_MS, OTP_TTL_MS } from '../src/services/otp.js';
import { registrationFixture } from './helpers/registration-fixture.js';

function configure(t: TestContext) {
  const previous = process.env.OTP_SECRET;
  process.env.OTP_SECRET = 'test-secret-with-at-least-32-bytes-not-used-in-production';
  t.after(() => { if (previous === undefined) delete process.env.OTP_SECRET; else process.env.OTP_SECRET = previous; });
}
const hasCode = (code: VerificationError['code']) => (error: unknown) => error instanceof VerificationError && error.code === code;

test('OTP is stored as a user-bound HMAC and sent only through the mail adapter', async t => {
  configure(t); const fixture = registrationFixture();
  assert.equal(await fixture.verification.requestVerificationEmail(1), undefined);
  const record = fixture.record();
  assert.match(fixture.code(), /^\d{6}$/);
  assert.match(record.otpHash, /^[a-f0-9]{64}$/);
  assert.notEqual(record.otpHash, fixture.code());
  assert.equal(otpMatches(1, fixture.code(), record.otpHash), true);
  assert.equal(otpMatches(2, fixture.code(), record.otpHash), false);
  assert.equal(record.expiresAt.getTime() - record.lastSentAt.getTime(), OTP_TTL_MS);
  assert.equal(fixture.user().status, 'pending');
  assert.equal(fixture.user().emailVerifiedAt, null);
});

test('resending before 60 seconds preserves the old challenge and sends nothing', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  const before = fixture.record();
  await assert.rejects(fixture.verification.requestVerificationEmail(1), hasCode('OTP_COOLDOWN'));
  assert.equal(fixture.messages.length, 1);
  assert.deepEqual(fixture.record(), before);
});

test('resending replaces the old code without clearing failed attempts', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  const old = fixture.code();
  await assert.rejects(fixture.verification.verifyEmailCode(1, '999999'), hasCode('OTP_INVALID'));
  fixture.advance(OTP_RESEND_INTERVAL_MS);
  await fixture.verification.requestVerificationEmail(1);
  assert.notEqual(fixture.code(), old);
  assert.equal(fixture.record().attempts, 1);
  await assert.rejects(fixture.verification.verifyEmailCode(1, old), hasCode('OTP_INVALID'));
  assert.equal(fixture.record().attempts, 2);
});

test('five incorrect attempts commit the counter and lock verification and resending', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  for (let attempt = 1; attempt <= 5; attempt++) {
    await assert.rejects(fixture.verification.verifyEmailCode(1, '999999'), hasCode(attempt === 5 ? 'OTP_LOCKED' : 'OTP_INVALID'));
    assert.equal(fixture.record().attempts, attempt);
  }
  assert.equal(fixture.record().lockedUntil.getTime() - fixture.record().lastSentAt.getTime(), OTP_LOCK_MS);
  await assert.rejects(fixture.verification.verifyEmailCode(1, fixture.code()), hasCode('OTP_LOCKED'));
  await assert.rejects(fixture.verification.requestVerificationEmail(1), hasCode('OTP_LOCKED'));
  assert.equal(fixture.messages.length, 1);
  assert.equal(fixture.user().status, 'pending');
});

test('after the lock expires only a new request starts a fresh attempt cycle', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  const old = fixture.code();
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(fixture.verification.verifyEmailCode(1, '999999'));
  fixture.advance(OTP_LOCK_MS);
  await assert.rejects(fixture.verification.verifyEmailCode(1, old), hasCode('OTP_EXPIRED'));
  assert.equal(fixture.record().attempts, 5);
  await fixture.verification.requestVerificationEmail(1);
  assert.equal(fixture.record().attempts, 0);
  assert.equal(fixture.record().lockedUntil, null);
  await fixture.verification.verifyEmailCode(1, fixture.code());
  assert.equal(fixture.user().status, 'active');
});

test('a correct OTP at expiry cannot activate the account', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  fixture.advance(OTP_TTL_MS);
  await assert.rejects(fixture.verification.verifyEmailCode(1, fixture.code()), hasCode('OTP_EXPIRED'));
  assert.equal(fixture.user().status, 'pending');
  assert.equal(fixture.record().usedAt, null);
});

test('successful verification retains usedAt and activates the account exactly once', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  const code = fixture.code();
  await fixture.verification.verifyEmailCode(1, code);
  assert.equal(fixture.user().status, 'active');
  assert.deepEqual(fixture.user().emailVerifiedAt, fixture.record().usedAt);
  await assert.rejects(fixture.verification.verifyEmailCode(1, code));
  fixture.advance(OTP_RESEND_INTERVAL_MS);
  await assert.rejects(fixture.verification.requestVerificationEmail(1), hasCode('OTP_NOT_PENDING'));
  assert.equal(fixture.messages.length, 1);
});

test('two verification calls produce one successful activation in the transactional adapter', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  const results = await Promise.allSettled([
    fixture.verification.verifyEmailCode(1, fixture.code()),
    fixture.verification.verifyEmailCode(1, fixture.code()),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(fixture.user().status, 'active');
});

test('two resend calls produce one new message in the transactional adapter', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  fixture.advance(OTP_RESEND_INTERVAL_MS);
  const results = await Promise.allSettled([fixture.verification.requestVerificationEmail(1), fixture.verification.requestVerificationEmail(1)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(fixture.messages.length, 2);
});

test('SMTP failure preserves pending state and the cooldown without retrying', async t => {
  configure(t); const fixture = registrationFixture();
  fixture.controls.mailFails = true;
  await assert.rejects(fixture.verification.requestVerificationEmail(1));
  assert.equal(fixture.user().status, 'pending');
  assert.ok(fixture.record());
  fixture.controls.mailFails = false;
  await assert.rejects(fixture.verification.requestVerificationEmail(1), hasCode('OTP_COOLDOWN'));
  fixture.advance(OTP_RESEND_INTERVAL_MS);
  await fixture.verification.requestVerificationEmail(1);
  assert.equal(fixture.messages.length, 1);
});

test('activation conflict rolls back consuming the challenge', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  fixture.controls.activationFails = true;
  await assert.rejects(fixture.verification.verifyEmailCode(1, fixture.code()), hasCode('OTP_CONFLICT'));
  assert.equal(fixture.record().usedAt, null);
  assert.equal(fixture.user().status, 'pending');
});

test('missing OTP_SECRET rejects without creating a challenge or email', async t => {
  configure(t); const fixture = registrationFixture();
  delete process.env.OTP_SECRET;
  await assert.rejects(fixture.verification.requestVerificationEmail(1), hasCode('OTP_CONFIG_INVALID'));
  assert.equal(fixture.record(), undefined);
  assert.equal(fixture.messages.length, 0);
});

test('a stale challenge cannot activate an account when its conditional update loses a race', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  t.mock.method(fixture.database.emailVerification, 'updateMany', async () => ({ count: 0 }));
  await assert.rejects(fixture.verification.verifyEmailCode(1, fixture.code()), hasCode('OTP_CONFLICT'));
  assert.equal(fixture.user().status, 'pending');
  assert.equal(fixture.user().emailVerifiedAt, null);
  assert.equal(fixture.record().usedAt, null);
});

test('a resend never reuses the previous six-digit value', async t => {
  configure(t); const fixture = registrationFixture();
  await fixture.verification.requestVerificationEmail(1);
  const previous = fixture.code();
  fixture.advance(OTP_RESEND_INTERVAL_MS);
  let tries = 0;
  const service = createEmailVerificationService({
    transaction: work => fixture.database.$transaction(work),
    now: () => new Date(fixture.record().lastSentAt.getTime() + OTP_RESEND_INTERVAL_MS),
    nextCode: () => ++tries === 1 ? previous : '777777',
    deliver: async () => {},
  });
  await service.requestVerificationEmail(1);
  assert.equal(tries, 2);
  assert.equal(fixture.record().otpHash, otpDigest(1, '777777'));
});
