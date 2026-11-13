import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createAuthServices } from '../src/services/auth/index.js';
import type { EmailMessage } from '../src/services/auth/email.js';
import { HOUR_MS, REFRESH_ABSOLUTE_MS, REFRESH_IDLE_MS, refreshHash, tokenHash } from '../src/services/auth/tokens.js';

// Fail closed before any DB access. Never inherit the application's DB URL.
const testUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!testUrl) throw new Error('Set AUTH_TEST_DATABASE_URL to the isolated local role_a_test database');
const parsedUrl = new URL(testUrl);
if (parsedUrl.hostname !== '127.0.0.1' || parsedUrl.pathname !== '/role_a_test' || parsedUrl.username !== 'role_a') {
  throw new Error('Refusing auth tests outside the isolated local role_a_test database/user');
}
process.env.AUTH_TOKEN_SECRET = 'role-a-db-tests-only-012345678901234567890';
process.env.WEB_ORIGIN = 'http://localhost:5173';
const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
let now: Date;
let mails: EmailMessage[];
let smtpFails: boolean;
let passwordHash: string;
const password = 'RoleATest123!';
const auth = createAuthServices({
  db, now: () => new Date(now),
  sendEmail: async mail => { if (smtpFails) throw new Error('simulated SMTP failure'); mails.push(mail); },
  verifyCaptcha: async token => token === 'test-captcha-verified',
});
const registration = (email = 'member@role-a.test') => ({ name: 'Member', email, password, confirmPassword: password, captchaToken: 'test-captcha-verified' });
const forgot = (email = 'member@role-a.test') => ({ email, captchaToken: 'test-captcha-verified' });
const resetInput = (token: string) => ({ token, password: 'NewRoleATest123!', confirmPassword: 'NewRoleATest123!' });
const advance = (milliseconds: number) => { now = new Date(now.getTime() + milliseconds); };
const otpFromMail = () => { const match = mails.at(-1)?.text.match(/\b\d{6}\b/); assert.ok(match); return match[0]; };
const resetFromMail = () => { const match = mails.at(-1)?.text.match(/token=([a-f0-9]{64})/); assert.ok(match); return match[1]; };
async function active(email = 'member@role-a.test') {
  return db.user.create({ data: { name: 'Active', email, passwordHash, status: 'active', emailVerifiedAt: now } });
}
async function family(user: { id: number; passwordVersion: number }) {
  const grant = await auth.createRefreshFamily({ userId: user.id, passwordVersion: user.passwordVersion });
  assert.ok(grant);
  return grant;
}
before(async () => { await db.$connect(); passwordHash = await bcrypt.hash(password, 12); });
after(async () => { await db.user.deleteMany(); await db.loginAttempt.deleteMany(); await db.$disconnect(); });
beforeEach(async () => {
  await db.user.deleteMany();
  await db.loginAttempt.deleteMany();
  now = new Date('2026-11-13T03:00:00.000Z'); mails = []; smtpFails = false;
});

test('migration preserves baseline dish, relationships and search vector', { skip: process.env.AUTH_TEST_EXPECT_BASELINE !== '1' }, async () => {
  const row = await db.dish.findFirst({ where: { name: '__role_a_baseline__' }, include: { chef: true, ingredients: { include: { ingredient: true } } } });
  assert.ok(row);
  assert.equal(Number(row.price), 0);
  assert.equal(row.chef.name, '__role_a_baseline__');
  assert.equal(row.ingredients[0].ingredient.name, '__role_a_baseline__');
  const vector = await db.$queryRaw<{ populated: boolean }[]>`SELECT "searchVector" <> ''::tsvector AS populated FROM "Dish" WHERE "id" = ${row.id}`;
  assert.equal(vector[0].populated, true);
  const history = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
  assert.equal(Number(history[0].count), 8);
});
test('register creates pending viewer, HMAC OTP and generic result for duplicates', async () => {
  assert.deepEqual(await auth.register({ ...registration(' MEMBER@ROLE-A.TEST '), role: 'admin' }), { kind: 'accepted' });
  const user = await db.user.findUniqueOrThrow({ where: { email: 'member@role-a.test' }, include: { emailVerification: true } });
  assert.equal(user.status, 'pending'); assert.equal(user.role, 'viewer'); assert.equal(user.passwordVersion, 0);
  assert.equal(await bcrypt.compare(password, user.passwordHash), true);
  const otp = otpFromMail();
  assert.equal(user.emailVerification!.otpHash, tokenHash('EMAIL_VERIFICATION', otp, user.id));
  assert.equal(user.emailVerification!.expiresAt.getTime() - now.getTime(), 10 * 60 * 1000);
  const oldHash = user.passwordHash;
  assert.deepEqual(await auth.register(registration()), { kind: 'accepted' });
  assert.equal(mails.length, 1);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash, oldHash);
});
test('concurrent register creates one user and sends one OTP', async () => {
  const results = await Promise.all([auth.register(registration()), auth.register(registration())]);
  assert.deepEqual(results, [{ kind: 'accepted' }, { kind: 'accepted' }]);
  assert.equal(await db.user.count(), 1); assert.equal(mails.length, 1);
});
test('activate consumes exactly once and returns no login grant', async () => {
  await auth.register(registration());
  const otp = otpFromMail();
  const results = await Promise.all([auth.activate('member@role-a.test', otp), auth.activate('member@role-a.test', otp)]);
  assert.deepEqual(results.map(result => result.kind).sort(), ['activated', 'invalid']);
  assert.equal((await db.user.findFirstOrThrow()).status, 'active');
  assert.equal(await db.refreshToken.count(), 0);
});
test('fifth bad OTP commits attempts and resend never unlocks it', async () => {
  await auth.register(registration()); const originalOtp = otpFromMail();
  for (let i = 0; i < 5; i++) assert.deepEqual(await auth.activate('member@role-a.test', 'wrong'), { kind: 'invalid' });
  const row = await db.emailVerification.findFirstOrThrow();
  assert.equal(row.attempts, 5); assert.ok(row.usedAt);
  advance(2 * HOUR_MS);
  assert.deepEqual(await auth.resendActivation('member@role-a.test'), { kind: 'accepted' });
  assert.equal(mails.length, 1);
  assert.deepEqual(await auth.activate('member@role-a.test', originalOtp), { kind: 'invalid' });
});
test('resend preserves attempts, enforces cooldown/hour quota and invalidates previous OTP', async () => {
  await auth.register(registration());
  await auth.activate('member@role-a.test', 'wrong');
  await auth.resendActivation('member@role-a.test'); assert.equal(mails.length, 1);
  for (let i = 0; i < 4; i++) { advance(60_000); await auth.resendActivation('member@role-a.test'); }
  assert.equal(mails.length, 5);
  const row = await db.emailVerification.findFirstOrThrow(); assert.equal(row.attempts, 1); assert.equal(row.sendCount, 5);
  advance(60_000); await auth.resendActivation('member@role-a.test'); assert.equal(mails.length, 5);
  advance(HOUR_MS); await auth.resendActivation('member@role-a.test'); assert.equal(mails.length, 6);
  assert.equal((await db.emailVerification.findFirstOrThrow()).attempts, 1);
  assert.deepEqual(await auth.resendActivation('unknown@role-a.test'), { kind: 'accepted' });
});
test('expired OTP and inactive/pending states cannot open a session', async () => {
  await auth.register(registration()); const otp = otpFromMail(); const user = await db.user.findFirstOrThrow();
  advance(10 * 60_000);
  assert.deepEqual(await auth.activate(user.email, otp), { kind: 'invalid' });
  assert.equal(await auth.createRefreshFamily({ userId: user.id, passwordVersion: 0 }), null);
});
test('SMTP failure retires the OTP while registration/resend keep generic results', async () => {
  smtpFails = true;
  assert.deepEqual(await auth.register(registration()), { kind: 'accepted' });
  const row = await db.emailVerification.findFirstOrThrow(); assert.ok(row.usedAt); assert.equal(row.sendCount, 1);
  smtpFails = false; advance(60_000); await auth.resendActivation('member@role-a.test');
  assert.equal(mails.length, 1); assert.equal((await db.emailVerification.findFirstOrThrow()).usedAt, null);
});
test('forgot responses hide unknown and pending users; CAPTCHA still required', async () => {
  const pending = await db.user.create({ data: { name: 'Pending', email: 'member@role-a.test', passwordHash } });
  assert.deepEqual(await auth.requestPasswordReset(forgot()), { kind: 'accepted' });
  assert.deepEqual(await auth.requestPasswordReset(forgot('unknown@role-a.test')), { kind: 'accepted' });
  assert.deepEqual(await auth.requestPasswordReset({ email: pending.email }), { kind: 'captcha-required' });
  assert.equal(mails.length, 0); assert.equal(await db.passwordResetToken.count(), 0);
});
test('forgot enforces cooldown/hour quota and retires earlier tokens', async () => {
  await active(); await auth.requestPasswordReset(forgot());
  const first = resetFromMail();
  await auth.requestPasswordReset(forgot()); assert.equal(mails.length, 1);
  for (let i = 0; i < 4; i++) { advance(60_000); await auth.requestPasswordReset(forgot()); }
  assert.equal(mails.length, 5); advance(60_000); await auth.requestPasswordReset(forgot()); assert.equal(mails.length, 5);
  assert.deepEqual(await auth.resetPassword(resetInput(first)), { kind: 'invalid' });
  assert.equal(await db.passwordResetToken.count({ where: { usedAt: null } }), 1);
});
test('forgot SMTP failure retires its token and returns generic acceptance', async () => {
  await active(); smtpFails = true;
  assert.deepEqual(await auth.requestPasswordReset(forgot()), { kind: 'accepted' });
  assert.ok((await db.passwordResetToken.findFirstOrThrow()).usedAt);
});
test('reset consumes once, changes bcrypt hash and revokes every device atomically', async () => {
  const user = await active(); const first = await family(user); const second = await family(user);
  await auth.requestPasswordReset(forgot()); const raw = resetFromMail();
  const token = await db.passwordResetToken.findFirstOrThrow();
  assert.equal(token.tokenHash, tokenHash('PASSWORD_RESET', raw)); assert.equal(token.expiresAt.getTime() - now.getTime(), 30 * 60_000);
  assert.equal(token.usedAt, null); // Opening the form does not call a consuming service.
  const results = await Promise.all([auth.resetPassword(resetInput(raw)), auth.resetPassword(resetInput(raw))]);
  assert.deepEqual(results.map(result => result.kind).sort(), ['invalid', 'reset']);
  const changed = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(changed.passwordVersion, 1); assert.equal(await bcrypt.compare('NewRoleATest123!', changed.passwordHash), true);
  assert.equal(await db.refreshToken.count({ where: { userId: user.id, revokedAt: null } }), 0);
  assert.equal(await auth.inspectRefresh(first.refreshToken), null); assert.equal(await auth.inspectRefresh(second.refreshToken), null);
  assert.equal(await db.refreshToken.count(), 2); // Reset did not auto-login.
});
test('reset rejects malformed, expired and already-consumed tokens without changing user', async () => {
  const user = await active(); await auth.requestPasswordReset(forgot()); const raw = resetFromMail();
  advance(30 * 60_000);
  for (const token of ['', 'invalid', 'a'.repeat(64), raw]) assert.deepEqual(await auth.resetPassword(resetInput(token)), { kind: 'invalid' });
  assert.deepEqual(await auth.resetPassword({ password: 'NewPassword123!', confirmPassword: 'NewPassword123!' }), { kind: 'invalid' });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordVersion, 0);
});
test('refresh stores HMAC only, snapshots pv and rotates within same fixed absolute lifetime', async () => {
  const user = await active(); const first = await family(user);
  const stored = await db.refreshToken.findFirstOrThrow(); assert.equal(stored.tokenHash, refreshHash(first.refreshToken));
  assert.equal(stored.passwordVersion, 0);
  assert.equal(first.expiresAt.getTime() - now.getTime(), REFRESH_IDLE_MS);
  assert.equal(first.absoluteExpiresAt.getTime() - now.getTime(), REFRESH_ABSOLUTE_MS);
  advance(24 * HOUR_MS);
  const second = await auth.rotateRefresh(first.refreshToken); assert.equal(second.kind, 'rotated');
  if (second.kind !== 'rotated') return;
  assert.equal(second.grant.familyId, first.familyId); assert.notEqual(second.grant.refreshToken, first.refreshToken);
  assert.equal(second.grant.absoluteExpiresAt.getTime(), first.absoluteExpiresAt.getTime());
  const old = await db.refreshToken.findUniqueOrThrow({ where: { id: stored.id } }); assert.ok(old.usedAt); assert.ok(old.replacedById);
  assert.equal(await auth.inspectRefresh(first.refreshToken), null);
  assert.equal(await auth.refreshFamilyForCsrf(first.refreshToken), first.familyId);
  assert.ok(await auth.inspectRefresh(second.grant.refreshToken));
});
test('reused token commits revocation of all descendants, including after old idle expiry', async () => {
  const user = await active(); const first = await family(user); advance(6 * 24 * HOUR_MS);
  const second = await auth.rotateRefresh(first.refreshToken); assert.equal(second.kind, 'rotated');
  advance(2 * 24 * HOUR_MS);
  assert.deepEqual(await auth.rotateRefresh(first.refreshToken), { kind: 'reused' });
  assert.equal(await db.refreshToken.count({ where: { familyId: first.familyId, revokedAt: null } }), 0);
  if (second.kind === 'rotated') assert.equal(await auth.inspectRefresh(second.grant.refreshToken), null);
});
test('concurrent refresh results in one rotation and one reuse, leaving no active descendant', async () => {
  const user = await active(); const first = await family(user);
  const results = await Promise.all([auth.rotateRefresh(first.refreshToken), auth.rotateRefresh(first.refreshToken)]);
  assert.deepEqual(results.map(result => result.kind).sort(), ['reused', 'rotated']);
  assert.equal(await db.refreshToken.count({ where: { familyId: first.familyId, revokedAt: null } }), 0);
  assert.equal(await db.refreshToken.count({ where: { familyId: first.familyId } }), 2);
});
test('logout is idempotent and concurrent rotation cannot leave a live child', async () => {
  const first = await family(await active());
  await Promise.all([auth.rotateRefresh(first.refreshToken), auth.revokeFamily(first.familyId)]);
  await auth.revokeFamily(first.familyId);
  assert.equal(await db.refreshToken.count({ where: { familyId: first.familyId, revokedAt: null } }), 0);
});
test('concurrent reset/rotation revokes all descendants and rejects stale login pv', async () => {
  const user = await active(); const first = await family(user);
  await auth.requestPasswordReset(forgot()); const raw = resetFromMail();
  const [reset] = await Promise.all([auth.resetPassword(resetInput(raw)), auth.rotateRefresh(first.refreshToken)]);
  assert.equal(reset.kind, 'reset');
  assert.equal(await db.refreshToken.count({ where: { userId: user.id, revokedAt: null } }), 0);
  assert.equal(await auth.createRefreshFamily({ userId: user.id, passwordVersion: 0 }), null);
});
test('absolute refresh deadline is never extended, and expiry is strict', async () => {
  let grant = await family(await active()); const deadline = grant.absoluteExpiresAt.getTime();
  for (let i = 0; i < 4; i++) {
    advance(6 * 24 * HOUR_MS); const rotated = await auth.rotateRefresh(grant.refreshToken);
    assert.equal(rotated.kind, 'rotated'); if (rotated.kind !== 'rotated') return; grant = rotated.grant;
  }
  assert.equal(grant.expiresAt.getTime(), deadline); advance(6 * 24 * HOUR_MS);
  assert.deepEqual(await auth.rotateRefresh(grant.refreshToken), { kind: 'invalid' });
});
test('idle timeout, pv mismatch and inactive user reject refresh and revoke family', async () => {
  const user = await active();
  const expired = await family(user); advance(REFRESH_IDLE_MS);
  assert.deepEqual(await auth.rotateRefresh(expired.refreshToken), { kind: 'invalid' });
  const stale = await family(user); await db.user.update({ where: { id: user.id }, data: { passwordVersion: 1 } });
  assert.equal(await auth.inspectRefresh(stale.refreshToken), null);
  assert.deepEqual(await auth.rotateRefresh(stale.refreshToken), { kind: 'invalid' });
  const fresh = await family({ id: user.id, passwordVersion: 1 });
  await db.user.update({ where: { id: user.id }, data: { status: 'pending' } });
  assert.deepEqual(await auth.rotateRefresh(fresh.refreshToken), { kind: 'invalid' });
  assert.equal(await db.refreshToken.count({ where: { revokedAt: null } }), 0);
});
test('unknown or malformed refresh never opens a session; inspection does not mutate expiry', async () => {
  const grant = await family(await active()); const before = await db.refreshToken.findFirstOrThrow();
  advance(60_000); assert.ok(await auth.inspectRefresh(grant.refreshToken));
  const after = await db.refreshToken.findFirstOrThrow(); assert.deepEqual(after, before);
  for (const raw of ['', 'bad', 'a'.repeat(43)]) {
    assert.deepEqual(await auth.rotateRefresh(raw), { kind: 'invalid' });
    assert.equal(await auth.refreshFamilyForCsrf(raw), null);
  }
});
test('login CAPTCHA begins after three failures and account locks at five for 15 minutes', async () => {
  const user = await active();
  for (let i = 0; i < 3; i++) assert.deepEqual(await auth.authenticateLogin({ email: user.email, password: 'wrong' }, 'test-ip'), { kind: 'invalid-credentials' });
  assert.equal((await auth.loginState(user.email, 'test-ip')).captchaRequired, true);
  assert.deepEqual(await auth.authenticateLogin({ email: user.email, password }, 'test-ip'), { kind: 'captcha-required' });
  const locked = await auth.authenticateLogin({ email: user.email, password: 'wrong', captchaToken: 'test-captcha-verified' }, 'test-ip');
  assert.equal(locked.kind, 'rate-limited');
  const keys = await db.loginAttempt.findMany(); assert.equal(keys.some(row => row.key.includes(user.email) || row.key.includes('test-ip')), false);
  advance(15 * 60_000);
  assert.equal((await auth.authenticateLogin({ email: user.email, password }, 'test-ip')).kind, 'authenticated');
});
test('IP lock spans accounts and a successful login does not erase other account failures', async () => {
  const user = await active();
  await auth.recordLoginFailure('unknown@role-a.test', 'shared-ip');
  const result = await auth.authenticateLogin({ email: user.email, password }, 'shared-ip'); assert.equal(result.kind, 'authenticated');
  assert.equal((await db.loginAttempt.findFirstOrThrow({ where: { key: { startsWith: 'ip:' } } })).failures, 1);
  for (let i = 1; i < 20; i++) await auth.recordLoginFailure(`other${i}@role-a.test`, 'shared-ip');
  const state = await auth.loginState(user.email, 'shared-ip'); assert.ok(state.lockedUntil);
  assert.equal(state.lockedUntil.getTime() - now.getTime(), 15 * 60_000);
});
test('pending credentials return ACCOUNT_NOT_ACTIVATED and never mint a family', async () => {
  await db.user.create({ data: { name: 'Pending', email: 'member@role-a.test', passwordHash } });
  assert.deepEqual(await auth.authenticateLogin({ email: 'member@role-a.test', password }, 'test-ip'), { kind: 'account-not-activated' });
  assert.equal(await db.refreshToken.count(), 0);
});

test('simultaneous resends consume only one quota slot and keep bad-attempt history', async () => {
  await auth.register(registration()); await auth.activate('member@role-a.test', 'wrong'); advance(60_000);
  await Promise.all([auth.resendActivation('member@role-a.test'), auth.resendActivation('member@role-a.test')]);
  assert.equal(mails.length, 2);
  const row = await db.emailVerification.findFirstOrThrow(); assert.equal(row.sendCount, 2); assert.equal(row.attempts, 1);
});
test('simultaneous forgot requests issue one reset token during the cooldown', async () => {
  await active();
  await Promise.all([auth.requestPasswordReset(forgot()), auth.requestPasswordReset(forgot())]);
  assert.equal(mails.length, 1); assert.equal(await db.passwordResetToken.count(), 1);
});
test('concurrent login failures do not lose account/IP increments', async () => {
  await Promise.all([auth.recordLoginFailure('member@role-a.test', 'shared-ip'), auth.recordLoginFailure('member@role-a.test', 'shared-ip')]);
  const rows = await db.loginAttempt.findMany(); assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.failures === 2));
});
test('late SMTP failure does not retire a newer resend OTP', async () => {
  let deliveryStarted!: () => void;
  let failDelivery!: (reason: Error) => void;
  const started = new Promise<void>(resolve => { deliveryStarted = resolve; });
  const blocked = new Promise<void>((_resolve, reject) => { failDelivery = reject; });
  const delayed = createAuthServices({ db, now: () => new Date(now), verifyCaptcha: async () => true,
    sendEmail: async () => { deliveryStarted(); await blocked; },
  });
  const registering = delayed.register(registration());
  await started; advance(60_000); await auth.resendActivation('member@role-a.test');
  const latest = otpFromMail(); failDelivery(new Error('late SMTP failure')); await registering;
  assert.equal((await db.emailVerification.findFirstOrThrow()).usedAt, null);
  assert.deepEqual(await auth.activate('member@role-a.test', latest), { kind: 'activated' });
});
test('isolated coding-agent bug demonstration: throwing after revoke rolls it back; real service commits', async () => {
  const first = await family(await active()); const rotated = await auth.rotateRefresh(first.refreshToken);
  assert.equal(rotated.kind, 'rotated');
  // Intentionally faulty example confined to this test and the isolated DB.
  await assert.rejects(db.$transaction(async tx => {
    await tx.refreshToken.updateMany({ where: { familyId: first.familyId }, data: { revokedAt: now } });
    throw new Error('demonstration: throwing here rolls back revocation');
  }), /rolls back revocation/);
  assert.equal(await db.refreshToken.count({ where: { familyId: first.familyId, revokedAt: null, usedAt: null } }), 1);
  // Correct implementation returns a discriminated result and commits first.
  assert.deepEqual(await auth.rotateRefresh(first.refreshToken), { kind: 'reused' });
  assert.equal(await db.refreshToken.count({ where: { familyId: first.familyId, revokedAt: null } }), 0);
});
