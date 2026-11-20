import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import * as OTPAuth from 'otpauth';
import type { SessionData } from 'express-session';
import { accountFixture } from './helpers/account-fixture.js';

process.env.DEMO_MODE = 'false';
process.env.DATABASE_URL = process.env.DIRECT_URL = 'postgresql://fixture:fixture@localhost:5432/fixture';
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
process.env.AUTH_TOKEN_SECRET = randomBytes(32).toString('hex');
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
const { prisma } = await import('../src/db.js');
const { app } = await import('../src/app.js');
const { newMfaSecret, sealMfaValue, replaceMfaSecret } = await import('../src/auth/mfa.js');
const { publishMfaCodes, claimMfaCodes } = await import('../src/auth/session-mfa.js');
const { PrismaSessionStore } = await import('../src/auth/session-store.js');
const { authClock } = await import('../src/auth/tokens.js');
const p = prisma as any;
const fixture = accountFixture(p);
const originalFind = p.session.findUnique;
let user: any, agent: ReturnType<typeof request.agent>, row: any, token: string;
let recoverySets: number;
const csrf = (html: string) => html.match(/name="_csrf"\s+value="([a-f0-9]+)"/)![1];
const codeFor = (secret: string, timestamp = Date.now()) => new OTPAuth.TOTP({
  algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret),
}).generate({ timestamp });

beforeEach(async () => {
  p.session.findUnique = originalFind;
  fixture.users.clear(); fixture.sessions.clear(); fixture.attempts.clear(); recoverySets = 0;
  user = await fixture.addUser(901);
  p.recoveryCode.deleteMany = async () => ({ count: 0 });
  p.recoveryCode.createMany = async ({ data }: any) => { recoverySets++; return { count: data.length }; };
  agent = request.agent(app);
  const page = await agent.get('/auth/login');
  assert.equal((await agent.post('/auth/login').type('form').send({
    _csrf: csrf(page.text), email: user.email, password: 'account-test-password',
  })).status, 303);
  token = csrf((await agent.get('/auth/account')).text);
  row = [...fixture.sessions.values()].find(s => s.userId === user.id)!;
});
after(async () => { await prisma.$disconnect(); });

// Force both requests to read the same session snapshot before either saves.
function parallelSessionLoads() {
  let arrivals = 0, release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  p.session.findUnique = async (args: any) => {
    const data = await originalFind(args);
    if (++arrivals <= 2) { if (arrivals === 2) release(); await gate; }
    return data;
  };
  return () => { p.session.findUnique = originalFind; };
}
function replacement() {
  const secret = newMfaSecret(), encrypted = sealMfaValue(secret);
  user.mfaEnabled = true;
  user.mfaSecretEncrypted = sealMfaValue(newMfaSecret());
  user.mfaLastUsedStep = BigInt(Math.floor(Date.now() / 30000) + 1);
  const previous = user.mfaSecretEncrypted;
  Object.assign(row.sess, {
    mfaSetupMode: 'replace', mfaSetupUserId: user.id, mfaSetupPasswordVersion: 0,
    mfaSetupExpiresAt: Date.now() + 300000, mfaSetupSecretEncrypted: encrypted,
    mfaSetupPreviousSecretEncrypted: previous,
  });
  return { secret, encrypted, previous };
}

test('parallel replacement confirmations accept the new secret once and issue one recovery set', async () => {
  const { secret, encrypted, previous } = replacement();
  const restore = parallelSessionLoads();
  try {
    const code = codeFor(secret);
    const responses = await Promise.all([1, 2].map(() => agent.post('/auth/account/mfa/replace/confirm')
      .type('form').send({ _csrf: token, code })));
    assert.deepEqual(responses.map(r => r.status).sort(), [303, 400]);
    assert.equal(responses.filter(r => r.headers.location === '/auth/account/mfa/recovery-codes').length, 1);
    assert.equal(recoverySets, 1);
    assert.equal(user.mfaSecretEncrypted, encrypted);
    // A later valid TOTP for the same pending setup must not rotate codes again.
    const before = authClock.now;
    const later = Date.now() + 30000;
    try {
      authClock.now = () => new Date(later);
      const replay = await replaceMfaSecret(user.id, 0, user.email, encrypted, codeFor(secret, later), row.sid, previous, prisma);
      assert.equal(replay.status, 'invalid'); assert.equal(recoverySets, 1);
    } finally { authClock.now = before; }
  } finally { restore(); }
});

test('a pending replacement cannot overwrite an MFA configuration changed after reauthentication', async () => {
  const { secret } = replacement();
  const newer = sealMfaValue(newMfaSecret()); user.mfaSecretEncrypted = newer;
  const response = await agent.post('/auth/account/mfa/replace/confirm').type('form').send({ _csrf: token, code: codeFor(secret) });
  assert.equal(response.status, 400); assert.equal(user.mfaSecretEncrypted, newer); assert.equal(recoverySets, 0);
});

test('replacement initiation binds the pending setup to the reauthenticated secret', async () => {
  user.mfaEnabled = true;
  const previous = sealMfaValue(newMfaSecret()); user.mfaSecretEncrypted = previous;
  p.recoveryCode.updateMany = async () => ({ count: 1 });
  const start = await agent.post('/auth/account/mfa/replace').type('form').send({
    _csrf: token, currentPassword: 'account-test-password', method: 'recovery', code: 'E'.repeat(32),
  });
  assert.equal(start.status, 303); assert.equal(start.headers.location, '/auth/account/mfa/replace');
  assert.equal(row.sess.mfaSetupPreviousSecretEncrypted, previous);
  assert.equal(row.sess.mfaSetupMode, 'replace');
  assert.notEqual(row.sess.mfaSetupSecretEncrypted, previous);
});

test('parallel recovery page requests disclose codes in exactly one response', async () => {
  const codes = ['A'.repeat(32), 'B'.repeat(32)];
  await publishMfaCodes(prisma, row.sid, user.id, sealMfaValue(JSON.stringify(codes)));
  const restore = parallelSessionLoads();
  try {
    const responses = await Promise.all([agent.get('/auth/account/mfa/recovery-codes'), agent.get('/auth/account/mfa/recovery-codes')]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 303]);
    assert.equal(responses.filter(r => r.text.includes(codes[0])).length, 1);
    assert.equal(row.sess.mfaOneTimeCodesEncrypted, undefined);
    assert.equal((await agent.get('/auth/account/mfa/recovery-codes')).status, 303);
  } finally { restore(); }
});

function load(store: InstanceType<typeof PrismaSessionStore>, sid: string) {
  return new Promise<SessionData>((resolve, reject) => store.get(sid, (error, data) => error ? reject(error) : resolve(data!)));
}
function save(store: InstanceType<typeof PrismaSessionStore>, sid: string, data: SessionData) {
  return new Promise<void>((resolve, reject) => store.set(sid, data, error => error ? reject(error) : resolve()));
}

test('a stale save from another store cannot restore a consumed recovery payload', async () => {
  const encrypted = sealMfaValue(JSON.stringify(['C'.repeat(32)]));
  await publishMfaCodes(prisma, row.sid, user.id, encrypted);
  const otherProcess = new PrismaSessionStore(prisma);
  const stale = await load(otherProcess, row.sid);
  assert.equal(await claimMfaCodes(prisma, row.sid, user.id), encrypted);
  stale.pendingEmail = 'still-saving@example.test';
  await save(otherProcess, row.sid, stale);
  assert.equal(await claimMfaCodes(prisma, row.sid, user.id), null);
  assert.equal(row.sess.mfaOneTimeCodesEncrypted, undefined);
  assert.equal(row.sess.pendingEmail, stale.pendingEmail);
});

test('a save loaded before publication preserves the new recovery payload', async () => {
  const otherProcess = new PrismaSessionStore(prisma);
  const stale = await load(otherProcess, row.sid);
  const encrypted = sealMfaValue(JSON.stringify(['D'.repeat(32)]));
  await publishMfaCodes(prisma, row.sid, user.id, encrypted);
  await save(otherProcess, row.sid, stale);
  assert.equal(await claimMfaCodes(prisma, row.sid, user.id), encrypted);
  assert.equal(await claimMfaCodes(prisma, row.sid, user.id), null);
});

test('payload claims fail for another user, expired sessions and destroyed sessions', async () => {
  await publishMfaCodes(prisma, row.sid, user.id, sealMfaValue('[]'));
  assert.equal(await claimMfaCodes(prisma, row.sid, user.id + 1), null);
  row.expiresAt = new Date(Date.now() - 1);
  assert.equal(await claimMfaCodes(prisma, row.sid, user.id), null);
  fixture.sessions.clear();
  assert.equal(await claimMfaCodes(prisma, row.sid, user.id), null);
  assert.equal(await publishMfaCodes(prisma, row.sid, user.id, sealMfaValue('[]')), false);
  assert.equal(fixture.sessions.size, 0);
});
