import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session, {type SessionData} from 'express-session';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stubSession, stubLoginAttempts} from './helpers/prisma-session.js';

process.env.DEMO_MODE = 'false';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.SESSION_SECRET = 'login-test-session-secret-at-least-32-characters';
process.env.AUTH_TOKEN_SECRET = 'login-test-token-secret-at-least-32-characters';
const {prisma} = await import('../src/db.js');
const {authClock} = await import('../src/auth/tokens.js');
const {captchaProvider} = await import('../src/auth/captcha.js');
const {PrismaSessionStore} = await import('../src/auth/session-store.js');
const {LOGIN_LOCK_MS, SESSION_TTL_MS} = await import('../src/auth/login.js');
const {app} = await import('../src/app.js');
const p = prisma as any;
const sessions = stubSession(p);
const attempts = stubLoginAttempts(p);
const password = 'test-login-password';
const passwordHash = await bcrypt.hash(password, 4);
const captcha = 'ABC234';
const initialTime = new Date();
const original = {now: authClock.now, captcha: captchaProvider.create};
let now = new Date(initialTime);
let users: any[] = [];

before(() => {
  authClock.now = () => new Date(now);
  captchaProvider.create = () => ({text: captcha, data: `<svg xmlns="http://www.w3.org/2000/svg"><text>${captcha}</text></svg>`});
  p.user.findUnique = async ({where}: any) => {
    const user = users.find(user => where.id === user.id || where.email === user.email);
    return user ? {...user} : null;
  };
  p.$transaction = async (fn: any) => fn(p);
});

beforeEach(() => {
  sessions.clear();
  attempts.clear();
  now = new Date(initialTime);
  users = Array.from({length: 10}, (_, index) => ({
    id: index + 1, name: `Nhân viên ${index + 1}`, email: index === 0 ? 'admin@example.test' : `staff${index}@example.test`,
    passwordHash, emailVerifiedAt: new Date(initialTime), role: index === 0 ? 'admin' : 'viewer', status: 'active', passwordVersion: 0,
  }));
});

after(async () => {
  authClock.now = original.now;
  captchaProvider.create = original.captcha;
  await prisma.$disconnect();
});

function csrf(html: string) {
  const token = html.match(/name="_csrf"\s+value="([a-f0-9]+)"/);
  assert.ok(token, 'SSR forms must retain CSRF protection');
  return token[1];
}

async function submit(agent: ReturnType<typeof request.agent>, email: string, secret = password, challenge?: string, extra: Record<string, string> = {}) {
  const page = await agent.get('/auth/login').query({email});
  assert.equal(page.status, 200);
  if (challenge !== undefined) assert.equal((await agent.get('/auth/captcha')).status, 200);
  return agent.post('/auth/login').type('form').send({_csrf: csrf(page.text), email, password: secret, ...(challenge === undefined ? {} : {captcha: challenge}), ...extra});
}

function cookie(response: {headers: Record<string, any>}) {
  const cookies = response.headers['set-cookie'] as string[] | undefined;
  assert.ok(cookies?.length, 'Response must issue a session cookie');
  return cookies[0].split(';')[0];
}

function counter(prefix: 'email' | 'ip') {
  const row = [...attempts.entries()].find(([key]) => key.startsWith(`${prefix}:`));
  assert.ok(row, `${prefix} failure state must be persisted`);
  return row[1];
}

test('login requires both active status and verified email before issuing an authenticated session', async () => {
  const agent = request.agent(app);
  users[0].status = 'pending';
  assert.equal((await submit(agent, users[0].email)).status, 403);
  assert.ok([...sessions.values()].every(row => row.userId === null));
  users[0].status = 'active';
  users[0].emailVerifiedAt = null;
  assert.equal((await submit(agent, users[0].email)).status, 403);
  assert.ok([...sessions.values()].every(row => row.userId === null));
  users[0].emailVerifiedAt = new Date(now);
  const response = await submit(agent, ' ADMIN@Example.Test ');
  assert.equal(response.status, 303);
  assert.equal(response.headers.location, '/admin/dishes');
  assert.equal((await agent.get('/admin')).headers.location, '/admin/dishes');
});

test('server guards every direct CRUD URL and ignores a role submitted by a viewer', async () => {
  for (const method of ['get', 'post', 'patch', 'delete'] as const) {
    const response = await request(app)[method]('/admin/dishes/1');
    assert.equal(response.status, 303, method);
    assert.equal(response.headers.location, '/auth/login');
  }
  const agent = request.agent(app);
  const response = await submit(agent, users[1].email, password, undefined, {role: 'admin', admin: 'true'});
  assert.equal(response.status, 303);
  assert.equal(response.headers.location, '/auth/account');
  for (const method of ['get', 'post', 'patch', 'delete'] as const) assert.equal((await agent[method]('/admin/dishes/1')).status, 403, method);
});

test('login rotates the session, a fresh store can restore it, and logout invalidates replayed cookies', async () => {
  const agent = request.agent(app);
  const page = await agent.get('/auth/login');
  const anonymousCookie = cookie(page);
  const response = await agent.post('/auth/login').type('form').send({_csrf: csrf(page.text), email: users[0].email, password});
  assert.equal(response.status, 303);
  const authenticatedCookie = cookie(response);
  assert.notEqual(authenticatedCookie, anonymousCookie);
  const rawHeader = response.headers['set-cookie'][0];
  assert.match(rawHeader, /HttpOnly/i);
  assert.match(rawHeader, /SameSite=Lax/i);
  assert.doesNotMatch(rawHeader, /;\s*Secure/i, 'local development uses an HTTP cookie');
  assert.ok(!decodeURIComponent(authenticatedCookie).includes(users[0].email));
  const row = [...sessions.values()].find(row => row.userId === users[0].id);
  assert.ok(row, 'authenticated sessions must be stored with userId in PostgreSQL');
  const expiry = row.expiresAt.getTime();
  assert.ok(expiry > Date.now() && expiry <= Date.now() + SESSION_TTL_MS);

  // Replace the application middleware and store instance. Only the persisted
  // Prisma rows and the signed client cookie survive this simulated restart.
  const restarted = express();
  restarted.use(session({secret: process.env.SESSION_SECRET!, store: new PrismaSessionStore(prisma), resave: false, saveUninitialized: false}));
  restarted.get('/session', (req, res) => res.json({userId: req.session.userId || null}));
  const restored = await request(restarted).get('/session').set('Cookie', authenticatedCookie);
  assert.equal(restored.body.userId, users[0].id);
  assert.equal(row.expiresAt.getTime(), expiry, 'read-only requests must not extend absolute expiry');

  const account = await agent.get('/auth/account');
  const loggedOut = await agent.post('/auth/logout').type('form').send({_csrf: csrf(account.text)});
  assert.equal(loggedOut.status, 303);
  assert.match(loggedOut.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/i);
  assert.ok([...sessions.values()].every(row => row.userId !== users[0].id));
  assert.equal((await request(app).get('/admin').set('Cookie', authenticatedCookie)).headers.location, '/auth/login');
  assert.equal((await request(restarted).get('/session').set('Cookie', authenticatedCookie)).body.userId, null);
});

test('account failures require CAPTCHA after three attempts and correct CAPTCHA cannot bypass a lock', async () => {
  const agent = request.agent(app);
  for (let attempt = 1; attempt <= 3; attempt++) assert.equal((await submit(agent, users[0].email, 'wrong-password')).status, 400);
  assert.equal(counter('email').failures, 3);
  const challengePage = await agent.get('/auth/login').query({email: users[0].email});
  assert.match(challengePage.text, /name="captcha"/);
  assert.equal((await submit(agent, users[0].email, 'wrong-password', captcha)).status, 400);
  assert.equal(counter('email').failures, 4, 'solving CAPTCHA must not reset the password failure counter');
  const locked = await submit(agent, users[0].email, password);
  assert.equal(locked.status, 429, 'a missing required CAPTCHA is rejected and counted');
  assert.equal(counter('email').failures, 5);
  assert.equal(Number(locked.headers['retry-after']), 900);
  assert.equal((await submit(agent, users[0].email, password, captcha)).status, 429);
  assert.equal(counter('email').failures, 5);
  assert.ok([...sessions.values()].every(row => row.userId === null));
  now = new Date(now.getTime() + LOGIN_LOCK_MS + 1);
  assert.equal((await submit(agent, users[0].email)).status, 303);
});

test('successful password login clears account failures while retaining the IP failure history', async () => {
  const agent = request.agent(app);
  for (let attempt = 0; attempt < 3; attempt++) assert.equal((await submit(agent, users[0].email, 'wrong-password')).status, 400);
  assert.equal((await submit(agent, users[0].email, password, captcha)).status, 303);
  assert.equal([...attempts.keys()].filter(key => key.startsWith('email:')).length, 0);
  assert.equal(counter('ip').failures, 3);
  assert.ok([...attempts.keys()].every(key => !key.includes('@') && !key.includes('127.0.0.1')), 'persisted abuse keys must not contain raw account or IP values');
});

test('IP throttling blocks distributed account attempts and survives correct CAPTCHA', async () => {
  const agent = request.agent(app);
  for (let index = 0; index < 20; index++) {
    const target = users[1 + (index % 8)].email;
    const response = await submit(agent, target, 'wrong-password', index >= 3 ? captcha : undefined);
    assert.equal(response.status, index === 19 ? 429 : 400, `attempt ${index + 1}`);
  }
  assert.equal(counter('ip').failures, 20);
  assert.ok([...attempts.entries()].filter(([key]) => key.startsWith('email:')).every(([, row]) => row.failures < 5), 'the lock must be caused by the aggregate IP threshold');
  assert.equal((await submit(agent, users[0].email, password, captcha)).status, 429);
  assert.equal(counter('ip').failures, 20);
});

test('server immediately applies role changes and revokes sessions after deactivation or password changes', async () => {
  const agent = request.agent(app);
  assert.equal((await submit(agent, users[0].email)).status, 303);
  users[0].role = 'viewer';
  assert.equal((await agent.get('/admin')).status, 403);
  users[0].role = 'admin';
  users[0].passwordVersion++;
  assert.equal((await agent.get('/auth/account')).headers.location, '/auth/login');
  assert.ok([...sessions.values()].every(row => row.userId !== users[0].id));
  assert.equal((await submit(agent, users[0].email)).status, 303);
  users[0].status = 'pending';
  assert.equal((await agent.get('/admin')).headers.location, '/auth/login');
  assert.ok([...sessions.values()].every(row => row.userId !== users[0].id));
});

test('session storage keeps its absolute expiry across store instances and rejects expired sessions', async () => {
  const absoluteExpiresAt = Date.now() + 60_000;
  const data = {cookie: {expires: new Date(Date.now() + SESSION_TTL_MS), originalMaxAge: SESSION_TTL_MS, httpOnly: true}, userId: 1, passwordVersion: 0, absoluteExpiresAt} as SessionData;
  const store = new PrismaSessionStore(prisma);
  await new Promise<void>((resolve, reject) => store.set('persisted-session', data, error => error ? reject(error) : resolve()));
  assert.equal(sessions.get('persisted-session')!.expiresAt.getTime(), absoluteExpiresAt);
  const replacement = new PrismaSessionStore(prisma);
  const restored = await new Promise<SessionData | null | undefined>((resolve, reject) => replacement.get('persisted-session', (error, row) => error ? reject(error) : resolve(row)));
  assert.equal(restored?.userId, 1);
  restored!.cookie.expires = new Date(Date.now() + SESSION_TTL_MS);
  await new Promise<void>((resolve, reject) => replacement.set('persisted-session', restored!, error => error ? reject(error) : resolve()));
  assert.equal(sessions.get('persisted-session')!.expiresAt.getTime(), absoluteExpiresAt, 'session saves must not extend its original absolute expiry');
  sessions.get('persisted-session')!.expiresAt = new Date(Date.now() - 1);
  const expired = await new Promise<SessionData | null | undefined>((resolve, reject) => replacement.get('persisted-session', (error, row) => error ? reject(error) : resolve(row)));
  assert.equal(expired, null);
});

test('database failures fail closed instead of creating an authenticated session', async () => {
  const find = p.loginAttempt.findUnique;
  p.loginAttempt.findUnique = async () => { throw new Error('private database failure details'); };
  try {
    const response = await request(app).get('/auth/login');
    assert.equal(response.status, 500);
    assert.doesNotMatch(response.text, /private database failure details/);
    assert.ok([...sessions.values()].every(row => row.userId === null));
  } finally { p.loginAttempt.findUnique = find; }
});

test('a session database failure before locals initialization renders a safe error page', async () => {
  const agent = request.agent(app);
  assert.equal((await agent.get('/auth/login')).status, 200);
  const find = p.session.findUnique;
  p.session.findUnique = async () => { throw new Error('private-session-database-details'); };
  try {
    const response = await agent.get('/auth/login');
    assert.equal(response.status, 500);
    assert.match(response.headers['content-type'], /html/);
    assert.match(response.text, /Chưa thể tải dữ liệu/);
    assert.doesNotMatch(response.text, /private-session-database-details|path is not defined|ReferenceError|Error:|\.ejs:\d/);
  } finally { p.session.findUnique = find; }
});

test('production cookies require HTTPS from a trusted proxy and contain only a signed session ID', async () => {
  const script = `
    import assert from 'node:assert/strict';
    import request from 'supertest';
    const {prisma} = await import('./src/db.ts');
    const {stubSession, stubLoginAttempts} = await import('./tests/helpers/prisma-session.ts');
    stubSession(prisma);
    stubLoginAttempts(prisma);
    const {app} = await import('./src/app.ts');
    const response = await request(app).get('/auth/login').set('X-Forwarded-Proto', 'https');
    assert.equal(response.status, 200);
    const cookies = response.headers['set-cookie'] || [];
    if (process.env.TRUST_PROXY_HOPS === '1') {
      assert.equal(cookies.length, 1);
      assert.match(cookies[0], /;\\s*Secure(?:;|$)/i);
      assert.match(cookies[0], /;\\s*HttpOnly(?:;|$)/i);
      assert.match(cookies[0], /;\\s*SameSite=Lax(?:;|$)/i);
      const value = decodeURIComponent(cookies[0].split(';')[0]);
      assert.match(value, /^connect\\.sid=s:[A-Za-z0-9_-]+\\.[A-Za-z0-9+/]+$/);
      assert.doesNotMatch(value, /userId|email|password|@/i);
    } else {
      assert.equal(cookies.length, 0, 'an untrusted X-Forwarded-Proto header must not permit the secure session cookie');
    }
    await prisma.$disconnect();
  `;
  for (const proxyHops of ['1', '0']) {
    await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: process.cwd(),
      env: {...process.env, NODE_ENV: 'production', DEMO_MODE: 'false', DATABASE_URL: 'postgresql://test:test@localhost:5432/test', SESSION_SECRET: 'production-cookie-test-secret-at-least-32-characters', TRUST_PROXY_HOPS: proxyHops},
    });
  }
});
