import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {stubSession, stubLoginAttempts} from './helpers/prisma-session.js';

process.env.DEMO_MODE = 'false';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.SESSION_SECRET = 'auth-test-session-secret-at-least-32-characters';
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('admin-test-password', 4);
process.env.ADMIN_REGISTRATION_CODE = 'test-admin-invitation-at-least-16';
process.env.APP_URL = 'http://localhost:3000';

const {prisma} = await import('../src/db.js');
const {captchaProvider} = await import('../src/auth/captcha.js');
const {mailer} = await import('../src/auth/email.js');
const {authClock} = await import('../src/auth/tokens.js');
const {requestPasswordReset} = await import('../src/auth/password-recovery.js');
const {PrismaSessionStore} = await import('../src/auth/session-store.js');
const {app} = await import('../src/app.js');
const p = prisma as any;
let sessions: ReturnType<typeof stubSession>;
let loginAttempts: ReturnType<typeof stubLoginAttempts>;
const rows: Record<string, any[]> = {user: [], emailVerification: [], passwordResetToken: []};
const messages: {to: string; subject: string; text: string; html?: string}[] = [];
const captchaAnswer = 'ABC234';
const password = 'valid-password-123';
const original = {captcha: captchaProvider.create, send: mailer.send, now: authClock.now};
const initialTime = new Date();
let now = new Date(initialTime);
let failEmail = false;

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((part: any) => matches(row, part));
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some((part: any) => matches(row, part));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, operand]: [string, any]) => {
        if (operator === 'equals') return row[key] === operand;
        if (operator === 'gt') return row[key] > operand;
        if (operator === 'gte') return row[key] >= operand;
        if (operator === 'lt') return row[key] < operand;
        if (operator === 'lte') return row[key] <= operand;
        if (operator === 'in') return operand.includes(row[key]);
        if (operator === 'notIn') return !operand.includes(row[key]);
        if (operator === 'not') return !matches(row, {[key]: operand});
        throw new Error(`Unsupported test predicate ${key}.${operator}`);
      });
    }
    return value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value;
  });
}

function project(row: any, args: any = {}) {
  if (!row) return null;
  const result = {...row};
  if (args.include?.user) result.user = rows.user.find(user => user.id === row.userId) || null;
  if (args.select) return Object.fromEntries(Object.keys(args.select).filter(key => args.select[key]).map(key => [key, result[key]]));
  return result;
}

function update(row: any, data: any) {
  for (const [key, value] of Object.entries(data) as [string, any][]) {
    row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
  }
  if ('updatedAt' in row) row.updatedAt = new Date(now);
}

before(() => {
  sessions = stubSession(p);
  loginAttempts = stubLoginAttempts(p);
  captchaProvider.create = () => ({text: captchaAnswer, data: `<svg xmlns="http://www.w3.org/2000/svg"><text>${captchaAnswer}</text></svg>`});
  authClock.now = () => new Date(now);
  mailer.send = async message => {
    if (failEmail) throw new Error('Simulated SMTP unavailable');
    messages.push(message);
  };
  for (const kind of ['user', 'emailVerification', 'passwordResetToken']) {
    p[kind].findUnique = async (args: any) => project(rows[kind].find(row => matches(row, args.where)), args);
    p[kind].findFirst = async (args: any = {}) => {
      const selected = rows[kind].filter(row => matches(row, args.where));
      for (const order of [...(Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy])].reverse()) {
        if (!order) continue;
        const [key, direction] = Object.entries(order)[0];
        selected.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === 'desc' ? -1 : 1));
      }
      return project(selected[0], args);
    };
    p[kind].count = async (args: any = {}) => rows[kind].filter(row => matches(row, args.where)).length;
    p[kind].create = async (args: any) => {
      if (kind === 'user' && rows.user.some(user => user.email === args.data.email)) throw Object.assign(new Error('Duplicate email'), {code: 'P2002'});
      const defaults = kind === 'user'
        ? {id: rows.user.length + 1, emailVerifiedAt: null, role: 'viewer', status: 'pending', passwordVersion: 0, createdAt: new Date(now), updatedAt: new Date(now)}
        : kind === 'emailVerification'
          ? {usedAt: null, attempts: 0, lastSentAt: new Date(now), sendWindowStartedAt: new Date(now), sendCount: 1}
          : {id: randomUUID(), usedAt: null, createdAt: new Date(now)};
      const row = {...defaults, ...args.data};
      rows[kind].push(row);
      return project(row, args);
    };
    p[kind].update = async (args: any) => {
      const row = rows[kind].find(row => matches(row, args.where));
      if (!row) throw Object.assign(new Error('Missing row'), {code: 'P2025'});
      update(row, args.data);
      return project(row, args);
    };
    p[kind].updateMany = async (args: any) => {
      const selected = rows[kind].filter(row => matches(row, args.where));
      for (const row of selected) update(row, args.data);
      return {count: selected.length};
    };
    p[kind].upsert = async (args: any) => {
      const row = rows[kind].find(row => matches(row, args.where));
      if (row) {
        update(row, args.update);
        return project(row, args);
      }
      return p[kind].create({data: args.create, ...('select' in args ? {select: args.select} : {})});
    };
  }
  p.$transaction = async (fn: any) => {
    const snapshot = structuredClone(rows);
    try { return await fn(p); }
    catch (error) { for (const kind of Object.keys(rows)) rows[kind] = snapshot[kind]; throw error; }
  };
});

beforeEach(() => {
  rows.user = [];
  rows.emailVerification = [];
  rows.passwordResetToken = [];
  messages.length = 0;
  now = new Date(initialTime);
  failEmail = false;
  sessions.clear();
  loginAttempts.clear();
});

after(async () => {
  captchaProvider.create = original.captcha;
  mailer.send = original.send;
  authClock.now = original.now;
  await prisma.$disconnect();
});

function csrf(html: string) {
  const match = html.match(/name="_csrf"\s+value="([a-f0-9]+)"/);
  assert.ok(match, 'The form must contain the existing CSRF token');
  return match[1];
}

async function form(agent: ReturnType<typeof request.agent>, path: string) {
  const response = await agent.get(path);
  assert.equal(response.status, 200, path);
  return csrf(response.text);
}

async function register(email = 'member@example.test', overrides: Record<string, string> = {}, agent = request.agent(app)) {
  const token = await form(agent, '/auth/register');
  assert.equal((await agent.get('/auth/captcha')).status, 200);
  const response = await agent.post('/auth/register').type('form').send({
    _csrf: token, name: 'Thành viên kiểm thử', email, password, confirmPassword: password, captcha: captchaAnswer, invitationCode: process.env.ADMIN_REGISTRATION_CODE, ...overrides,
  });
  return {agent, response, email: email.trim().toLowerCase(), token};
}

function otp(index = messages.length - 1) {
  const match = messages[index]?.text.match(/\b(\d{6})\b/);
  assert.ok(match, 'Verification mail must contain a six-digit OTP');
  return match[1];
}

async function verify(agent: ReturnType<typeof request.agent>, email: string, code = otp()) {
  const token = await form(agent, '/auth/verify-email');
  return agent.post('/auth/verify-email').type('form').send({_csrf: token, email, otp: code});
}

async function login(agent: ReturnType<typeof request.agent>, email: string, secret = password) {
  const token = await form(agent, '/auth/login');
  return agent.post('/auth/login').type('form').send({_csrf: token, email, password: secret});
}

async function activeMember(email = 'member@example.test') {
  const result = await register(email);
  assert.equal(result.response.status, 303);
  assert.equal((await verify(result.agent, result.email)).status, 303);
  return result;
}

async function requestReset(email: string) {
  const requester = request.agent(app);
  const token = await form(requester, '/auth/forgot-password');
  await requester.get('/auth/captcha');
  const response = await requester.post('/auth/forgot-password').type('form').send({_csrf: token, email, captcha: captchaAnswer});
  return {requester, response};
}

function resetToken() {
  const match = messages.at(-1)?.text.match(/token=([a-f0-9]{64})/);
  assert.ok(match, 'Reset link must be delivered through the shared mail utility');
  return match[1];
}

test('registration normalizes email, hashes password and OTP, and keeps unverified users signed out', async () => {
  const {agent, response, email} = await register('  Member@Example.Test  ', {role: 'admin', status: 'active'});
  assert.equal(response.status, 303);
  assert.match(response.headers.location, /^\/auth\/verify-email(?:\?|$)/);
  assert.equal(rows.user.length, 1);
  assert.equal(rows.user[0].email, email);
  assert.equal(rows.user[0].emailVerifiedAt, null);
  assert.equal(rows.user[0].role, 'viewer', 'registration must not accept a privileged role from the form');
  assert.equal(rows.user[0].status, 'pending');
  assert.notEqual(rows.user[0].passwordHash, password);
  assert.ok(await bcrypt.compare(password, rows.user[0].passwordHash));
  assert.equal(messages[0].to, email);
  const code = otp();
  assert.equal(rows.emailVerification[0].userId, rows.user[0].id);
  assert.notEqual(rows.emailVerification[0].otpHash, code);
  assert.match(rows.emailVerification[0].otpHash, /^[a-f0-9]{64}$/);
  assert.ok(rows.emailVerification[0].expiresAt > now);
  assert.equal((await login(agent, email)).status, 403);
  assert.equal((await agent.get('/auth/account')).status, 303);
  assert.equal((await agent.get('/admin')).headers.location, '/auth/login');
});

test('registration gives the same response for new and duplicate emails without extra users or mail', async () => {
  const first = await register('member@example.test');
  const account = structuredClone(rows.user[0]);
  const verification = structuredClone(rows.emailVerification[0]);
  const duplicate = await register(' MEMBER@example.test ');
  assert.equal(duplicate.response.status, first.response.status);
  assert.equal(duplicate.response.headers.location, first.response.headers.location);
  assert.equal(duplicate.response.text, first.response.text);
  assert.deepEqual(rows.user[0], account);
  assert.deepEqual(rows.emailVerification[0], verification);
  const confirmation = await duplicate.agent.get(duplicate.response.headers.location);
  assert.doesNotMatch(confirmation.text, /Email đã được đăng ký|email-error/);
  assert.match(confirmation.text, /value="member@example.test"/);
  rows.user[0].status = 'active';
  rows.user[0].emailVerifiedAt = new Date(now);
  const activeAccount = structuredClone(rows.user[0]);
  const activeDuplicate = await register('member@example.test');
  assert.equal(activeDuplicate.response.status, first.response.status);
  assert.equal(activeDuplicate.response.headers.location, first.response.headers.location);
  assert.equal(activeDuplicate.response.text, first.response.text);
  assert.deepEqual(rows.user[0], activeAccount);
  assert.equal(rows.user.length, 1);
  assert.equal(messages.length, 1);
  const invalidCases: Record<string, string>[] = [
    {name: ''},
    {email: 'not-an-email'},
    {password: 'short', confirmPassword: 'short'},
    {confirmPassword: 'does-not-match'},
    {password: 'ậ'.repeat(25), confirmPassword: 'ậ'.repeat(25)},
    {invitationCode: ''},
    {invitationCode: 'invalid-admin-invitation'},
  ];
  for (const invalid of invalidCases) {
    const result = await register('another@example.test', invalid);
    assert.equal(result.response.status, 400, JSON.stringify(invalid));
  }
  assert.equal(rows.user.length, 1);
  assert.equal(messages.length, 1);
});

test('CAPTCHA is required, rejects wrong or expired answers, and cannot be reused', async () => {
  const agent = request.agent(app);
  const token = await form(agent, '/auth/register');
  const submit = (email: string, captcha: string) => agent.post('/auth/register').type('form').send({_csrf: token, name: 'Thành viên', email, password, confirmPassword: password, captcha, invitationCode: process.env.ADMIN_REGISTRATION_CODE});
  assert.equal((await submit('missing@example.test', captchaAnswer)).status, 400);
  await agent.get('/auth/captcha');
  assert.equal((await submit('wrong@example.test', 'WRONG1')).status, 400);
  assert.equal((await submit('reused-wrong@example.test', captchaAnswer)).status, 400);
  await agent.get('/auth/captcha');
  now = new Date(now.getTime() + 5 * 60_000 + 1);
  assert.equal((await submit('expired@example.test', captchaAnswer)).status, 400);
  await agent.get('/auth/captcha');
  assert.equal((await submit('valid@example.test', captchaAnswer)).status, 303);
  assert.equal((await submit('replay@example.test', captchaAnswer)).status, 400);
  assert.equal(rows.user.length, 1);
});

test('all account forms retain CSRF protection', async () => {
  const agent = request.agent(app);
  await agent.get('/auth/register');
  for (const path of ['register', 'verify-email', 'resend-otp', 'login', 'logout', 'forgot-password', 'reset-password']) {
    const response = await agent.post(`/auth/${path}`).type('form').send({email: 'member@example.test', password, otp: '123456'});
    assert.equal(response.status, 403, path);
  }
  assert.equal(rows.user.length, 0);
  assert.equal(messages.length, 0);
});

test('valid OTP activates a viewer once and login preserves the server-assigned permissions', async () => {
  const {agent, email} = await register();
  const code = otp();
  const response = await verify(agent, email, code);
  assert.equal(response.status, 303);
  assert.match(response.headers.location, /^\/auth\/login(?:\?|$)/);
  assert.ok(rows.user[0].emailVerifiedAt instanceof Date);
  assert.equal(rows.user[0].status, 'active');
  assert.ok(rows.emailVerification[0].usedAt instanceof Date);
  assert.equal((await agent.get('/auth/account')).status, 303, 'verification must not sign in automatically');
  assert.equal((await verify(agent, email, code)).status, 400);
  assert.equal((await login(agent, email, 'wrong-password')).status, 400);
  const loggedIn = await login(agent, email);
  assert.equal(loggedIn.status, 303);
  assert.equal(loggedIn.headers.location, '/auth/account');
  assert.equal((await agent.get('/auth/account')).status, 200);
  assert.equal((await agent.get('/admin')).status, 403);
  const token = await form(agent, '/auth/account');
  assert.equal((await agent.post('/auth/logout').type('form').send({_csrf: token})).status, 303);
  assert.equal((await agent.get('/auth/account')).status, 303);
});

test('legacy environment credentials cannot bypass database administrator authentication', async () => {
  const agent = request.agent(app);
  const legacyPage = await agent.get('/admin/login');
  assert.equal(legacyPage.status, 303);
  assert.equal(legacyPage.headers.location, '/auth/login');
  const token = await form(agent, '/auth/login');
  const response = await agent.post('/admin/login').type('form').send({_csrf: token, email: process.env.ADMIN_EMAIL, password: 'admin-test-password'});
  assert.ok([303, 404].includes(response.status));
  if (response.status === 303) assert.equal(response.headers.location, '/auth/login');
  assert.equal((await agent.get('/admin')).headers.location, '/auth/login');
});

test('incorrect OTPs have a five-attempt limit and expired OTPs cannot activate accounts', async () => {
  const {agent, email} = await register();
  const code = otp();
  const wrongCode = code === '000000' ? '000001' : '000000';
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal((await verify(agent, email, wrongCode)).status, 400);
    assert.equal(rows.emailVerification[0].attempts, attempt);
  }
  assert.ok(rows.emailVerification[0].usedAt instanceof Date);
  assert.equal((await verify(agent, email, code)).status, 400);
  assert.equal(rows.user[0].emailVerifiedAt, null);

  const second = await register('second@example.test');
  const secondCode = otp();
  now = new Date(now.getTime() + 10 * 60_000 + 1);
  assert.equal((await verify(second.agent, second.email, secondCode)).status, 400);
  assert.equal(rows.user[1].emailVerifiedAt, null);
});

test('resending OTP enforces cooldown and hourly cap while retiring previous codes', async () => {
  const {agent, email} = await register();
  const firstCode = otp();
  const resend = async () => {
    const token = await form(agent, '/auth/verify-email');
    return agent.post('/auth/resend-otp').type('form').send({_csrf: token, email});
  };
  assert.equal((await resend()).status, 429);
  assert.equal(messages.length, 1);
  for (let count = 2; count <= 5; count++) {
    now = new Date(now.getTime() + 60_001);
    assert.equal((await resend()).status, 303);
    assert.equal(messages.length, count);
  }
  assert.equal(rows.emailVerification.length, 1, 'resend reuses the single verification row');
  assert.equal(rows.emailVerification[0].sendCount, 5);
  assert.equal(rows.emailVerification[0].attempts, 0);
  assert.equal(rows.emailVerification[0].usedAt, null);
  assert.equal((await verify(agent, email, firstCode)).status, 400);
  now = new Date(now.getTime() + 60_001);
  assert.equal((await resend()).status, 429);
  assert.equal(messages.length, 5);
  now = new Date(now.getTime() + 60 * 60_000);
  assert.equal((await resend()).status, 303);
  assert.equal(messages.length, 6);
});

test('OTP resend preserves failed attempts across aliases and cannot bypass the five-attempt limit', async () => {
  const {agent, email} = await register();
  const originalCode = otp();
  const wrong = originalCode === '000000' ? '000001' : '000000';
  await verify(agent, email, wrong);
  await verify(agent, email, wrong);
  assert.equal(rows.emailVerification[0].attempts, 2);
  const resend = async (path: string) => {
    const token = await form(agent, '/auth/verify-email');
    return agent.post(path).type('form').send({_csrf: token, email});
  };
  now = new Date(now.getTime() + 60_001);
  assert.equal((await resend('/auth/verify-email/resend')).status, 303);
  assert.equal(rows.emailVerification[0].attempts, 2);
  assert.equal((await verify(agent, email, originalCode)).status, 400);
  assert.equal(rows.emailVerification[0].attempts, 3);
  // Expiry of the hourly send window must not reset verification failures.
  now = new Date(now.getTime() + 60 * 60_000 + 1);
  assert.equal((await resend('/auth/resend-otp')).status, 303);
  assert.equal(rows.emailVerification[0].attempts, 3);
  const newest = otp();
  const wrongNewest = newest === '000000' ? '000001' : '000000';
  for (let attempt = 4; attempt <= 5; attempt++) {
    assert.equal((await verify(agent, email, wrongNewest)).status, 400);
    assert.equal(rows.emailVerification[0].attempts, attempt);
  }
  const snapshot = structuredClone(rows.emailVerification[0]);
  const mailCount = messages.length;
  now = new Date(now.getTime() + 60 * 60_000 + 1);
  for (const path of ['/auth/verify-email/resend', '/auth/resend-otp']) assert.equal((await resend(path)).status, 429);
  assert.deepEqual(rows.emailVerification[0], snapshot);
  assert.equal(messages.length, mailCount);
  assert.equal((await verify(agent, email, newest)).status, 400);
  assert.equal(rows.user[0].emailVerifiedAt, null);
});

test('SMTP failure leaves a pending account recoverable through resend', async () => {
  failEmail = true;
  const {agent, response, email} = await register();
  assert.equal(response.status, 303);
  assert.match(decodeURIComponent(response.headers.location), /Nếu yêu cầu đăng ký phù hợp/);
  assert.equal(rows.user.length, 1);
  assert.equal(rows.user[0].emailVerifiedAt, null);
  assert.equal(messages.length, 0);
  failEmail = false;
  now = new Date(now.getTime() + 60_001);
  const token = await form(agent, '/auth/verify-email');
  const resent = await agent.post('/auth/resend-otp').type('form').send({_csrf: token, email});
  assert.equal(resent.status, 303);
  assert.equal(messages.length, 1);
  assert.equal((await verify(agent, email)).status, 303);
  assert.ok(rows.user[0].emailVerifiedAt instanceof Date);
});

test('password-reset tokens are hashed, one-use, expire, and invalidate existing sessions', async () => {
  const {agent, email} = await activeMember();
  assert.equal((await login(agent, email)).status, 303);
  const unknown = await requestReset('unknown@example.test');
  const reset = await requestReset(email);
  assert.equal(unknown.response.status, 303);
  assert.equal(reset.response.status, 303);
  assert.equal(reset.response.headers.location, unknown.response.headers.location, 'reset request must not disclose account existence');
  const urlMatch = messages.at(-1)!.text.match(/https?:\/\/[^\s<>]+\/auth\/reset-password\?token=([a-f0-9]{64})/);
  assert.ok(urlMatch, 'Reset mail must contain a usable random token link');
  const rawToken = urlMatch[1];
  const stored = rows.passwordResetToken[0];
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(stored.tokenHash, rawToken);
  const resetCsrf = await form(reset.requester, `/auth/reset-password?token=${rawToken}`);
  const replacement = 'replacement-password-456';
  const resetResponse = await reset.requester.post('/auth/reset-password').type('form').send({_csrf: resetCsrf, token: rawToken, password: replacement, confirmPassword: replacement});
  assert.equal(resetResponse.status, 303);
  assert.ok(stored.usedAt instanceof Date);
  assert.equal(rows.user[0].passwordVersion, 1);
  assert.ok(await bcrypt.compare(replacement, rows.user[0].passwordHash));
  assert.equal((await agent.get('/auth/account')).status, 303, 'password reset invalidates a session created with the old password version');
  const replayCsrf = await form(reset.requester, `/auth/reset-password?token=${rawToken}`);
  assert.equal((await reset.requester.post('/auth/reset-password').type('form').send({_csrf: replayCsrf, token: rawToken, password, confirmPassword: password})).status, 400);
  assert.equal((await login(agent, email)).status, 400);
  assert.equal((await login(agent, email, replacement)).status, 303);

  now = new Date(now.getTime() + 60_001);
  const expired = await requestReset(email);
  const expiredToken = messages.at(-1)!.text.match(/token=([a-f0-9]{64})/)![1];
  const expiredCsrf = await form(expired.requester, `/auth/reset-password?token=${expiredToken}`);
  now = new Date(now.getTime() + 30 * 60_000 + 1);
  assert.equal((await expired.requester.post('/auth/reset-password').type('form').send({_csrf: expiredCsrf, token: expiredToken, password, confirmPassword: password})).status, 400);
  assert.ok(await bcrypt.compare(replacement, rows.user[0].passwordHash));

  now = new Date(now.getTime() + 60_001);
  failEmail = true;
  try {
    const failedDelivery = await requestReset(email);
    assert.equal(failedDelivery.response.status, 303);
    assert.equal(failedDelivery.response.headers.location, unknown.response.headers.location, 'SMTP failure must not disclose account existence');
    assert.ok(rows.passwordResetToken.at(-1)!.usedAt instanceof Date, 'a reset token that failed delivery must be invalidated');
    const missingDuringOutage = await requestReset('unknown@example.test');
    assert.equal(missingDuringOutage.response.status, 303);
    assert.equal(missingDuringOutage.response.headers.location, failedDelivery.response.headers.location);
  } finally {
    failEmail = false;
  }
});

test('recovery links survive GET previews and invalid passwords without consuming their token', async () => {
  const {email} = await activeMember();
  const {requester, response} = await requestReset(email);
  assert.equal(response.status, 303);
  const raw = resetToken();
  const snapshot = structuredClone(rows.passwordResetToken);
  for (let preview = 0; preview < 2; preview++) {
    const page = await requester.get(`/auth/reset-password?token=${raw}`);
    assert.equal(page.status, 200);
    assert.match(page.headers['cache-control'], /no-store/);
    assert.equal(page.headers['referrer-policy'], 'no-referrer');
    assert.deepEqual(rows.passwordResetToken, snapshot);
  }
  const token = await form(requester, `/auth/reset-password?token=${raw}`);
  for (const input of [
    {password: 'short', confirmPassword: 'short'},
    {password: 'new-password-123', confirmPassword: 'mismatch'},
    {password: 'ậ'.repeat(25), confirmPassword: 'ậ'.repeat(25)},
    {password, confirmPassword: password, token: 'invalid'},
    {password, confirmPassword: password, token: 'f'.repeat(64)},
  ]) {
    assert.equal((await requester.post('/auth/reset-password').type('form').send({_csrf: token, token: raw, ...input})).status, 400);
    assert.deepEqual(rows.passwordResetToken, snapshot);
    assert.ok(await bcrypt.compare(password, rows.user[0].passwordHash));
  }
});

test('reset revokes all devices for the account and preserves another administrators session', async () => {
  const member = await activeMember();
  const other = await activeMember('other@example.test');
  const device = request.agent(app);
  rows.user[0].role = 'admin';
  rows.user[1].role = 'admin';
  for (const client of [member.agent, device]) assert.equal((await login(client, member.email)).status, 303);
  assert.equal((await login(other.agent, other.email)).status, 303);
  const memberSessions = [...sessions.entries()].filter(([, row]) => row.userId === rows.user[0].id).map(([sid]) => sid);
  assert.equal(memberSessions.length, 2);
  const store = new PrismaSessionStore(prisma);
  const staleSession = await new Promise<any>((resolve, reject) => store.get(memberSessions[0], (error, data) => error ? reject(error) : resolve(data)));
  const reset = await requestReset(member.email);
  const raw = resetToken();
  const token = await form(reset.requester, `/auth/reset-password?token=${raw}`);
  const response = await reset.requester.post('/auth/reset-password').type('form').send({_csrf: token, token: raw, password: 'new-password-456', confirmPassword: 'new-password-456'});
  assert.equal(response.status, 303);
  assert.ok(memberSessions.every(sid => !sessions.has(sid)), 'all authenticated sessions must be deleted from the store');
  await new Promise<void>((resolve, reject) => store.set(memberSessions[0], staleSession, error => error ? reject(error) : resolve()));
  assert.equal(sessions.has(memberSessions[0]), false, 'a request started before reset cannot resurrect its session');
  assert.match(String(response.headers['set-cookie']), /connect\.sid=;/);
  for (const client of [member.agent, device, reset.requester]) assert.equal((await client.get('/admin/dishes')).headers.location, '/auth/login');
  assert.equal((await other.agent.get('/auth/account')).status, 200);
  assert.equal(rows.user[0].role, 'admin');
  assert.equal(rows.user[0].passwordVersion, 1);
});

test('a recovery token cannot reactivate an account disabled after link delivery', async () => {
  const {email} = await activeMember();
  const reset = await requestReset(email);
  const raw = resetToken();
  rows.user[0].status = 'pending';
  const token = await form(reset.requester, `/auth/reset-password?token=${raw}`);
  const response = await reset.requester.post('/auth/reset-password').type('form').send({_csrf: token, token: raw, password: 'replacement-456', confirmPassword: 'replacement-456'});
  assert.equal(response.status, 400);
  assert.equal(rows.passwordResetToken[0].usedAt, null);
  assert.equal(rows.user[0].passwordVersion, 0);
  const mailCount = messages.length;
  await requestPasswordReset(email);
  await requestPasswordReset('unknown@example.test');
  assert.equal(messages.length, mailCount);
});

test('account cooldown and hourly quota persist across recovery requests and retire older links', async () => {
  const {email} = await activeMember();
  const mailCount = messages.length;
  await requestPasswordReset(email);
  const first = resetToken();
  await requestPasswordReset(email);
  assert.equal(messages.length, mailCount + 1, 'cooldown must prevent a second email');
  for (let count = 2; count <= 5; count++) {
    now = new Date(now.getTime() + 60_001);
    await requestPasswordReset(email);
  }
  assert.equal(messages.length, mailCount + 5);
  assert.equal(rows.passwordResetToken.filter(row => row.usedAt === null).length, 1);
  assert.notEqual(resetToken(), first);
  now = new Date(now.getTime() + 60_001);
  await requestPasswordReset(email);
  assert.equal(messages.length, mailCount + 5, 'the sixth email in one hour must be blocked');
  now = new Date(now.getTime() + 60 * 60_000);
  await requestPasswordReset(email);
  assert.equal(messages.length, mailCount + 6);
});

test('a database failure during session revocation rolls back the password and token together', async () => {
  const {agent, email} = await activeMember();
  await login(agent, email);
  await requestPasswordReset(email);
  const raw = resetToken();
  const requester = request.agent(app);
  const token = await form(requester, `/auth/reset-password?token=${raw}`);
  const removeSessions = p.session.deleteMany;
  p.session.deleteMany = async () => { throw new Error('private revocation failure'); };
  try {
    const response = await requester.post('/auth/reset-password').type('form').send({_csrf: token, token: raw, password: 'replacement-456', confirmPassword: 'replacement-456'});
    assert.equal(response.status, 500);
    assert.doesNotMatch(response.text, /private revocation failure/);
    assert.ok(await bcrypt.compare(password, rows.user[0].passwordHash));
    assert.equal(rows.user[0].passwordVersion, 0);
    assert.equal(rows.passwordResetToken[0].usedAt, null);
    assert.equal((await agent.get('/auth/account')).status, 200);
  } finally { p.session.deleteMany = removeSessions; }
});

test('demo mode blocks account writes without connecting to the database or sending mail', async () => {
  const script = `
    import assert from 'node:assert/strict';
    import request from 'supertest';
    const {app} = await import('./src/app.ts');
    const agent = request.agent(app);
    const page = await agent.get('/auth/register');
    const token = page.text.match(/name="_csrf"\\s+value="([a-f0-9]+)"/)[1];
    for (const path of ['register', 'resend-otp', 'forgot-password', 'reset-password']) {
      const response = await agent.post('/auth/' + path).type('form').send({_csrf: token});
      assert.equal(response.status, 503, path);
    }
  `;
  await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {cwd: process.cwd(), env: {...process.env, DEMO_MODE: 'true'}});
});
