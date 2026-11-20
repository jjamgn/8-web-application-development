import {test, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {accountFixture} from './helpers/account-fixture.js';

process.env.DEMO_MODE = 'false';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.SESSION_SECRET = 'account-test-secret-at-least-32-characters';
const {prisma} = await import('../src/db.js');
const {app} = await import('../src/app.js');
const p = prisma as any;
const fixture = accountFixture(p);
const originalDelete = p.session.deleteMany;
const originalPassword = 'account-test-password';
let id = 100;
let user: any, other: any;
beforeEach(async () => {
  fixture.users.clear(); fixture.resetTokens.clear(); fixture.sessions.clear(); fixture.attempts.clear();
  p.session.deleteMany = originalDelete;
  p.$transaction = fixture.transaction;
  user = await fixture.addUser(id++);
  other = await fixture.addUser(id++);
});
after(async () => {await prisma.$disconnect();});
function csrf(html: string) {
  const match = html.match(/name="_csrf"\s+value="([a-f0-9]+)"/);
  assert.ok(match);
  return match[1];
}
async function login(agent: ReturnType<typeof request.agent>, target = user, password = originalPassword) {
  const page = await agent.get('/auth/login');
  return agent.post('/auth/login').type('form').send({_csrf: csrf(page.text), email: target.email, password});
}
async function account(agent: ReturnType<typeof request.agent>) {
  const page = await agent.get('/auth/account');
  assert.equal(page.status, 200);
  return csrf(page.text);
}

test('account settings require authentication and CSRF for both changes', async () => {
  const anonymous = request.agent(app);
  assert.equal((await anonymous.get('/auth/account')).headers.location, '/auth/login');
  const page = await anonymous.get('/auth/login');
  for (const path of ['/auth/account/profile', '/auth/account/password']) {
    assert.equal((await anonymous.post(path).type('form').send({_csrf: csrf(page.text)})).headers.location, '/auth/login');
  }
  const agent = request.agent(app); await login(agent);
  for (const path of ['/auth/account/profile', '/auth/account/password']) {
    for (const token of [undefined, 'not-a-csrf-token']) assert.equal((await agent.post(path).type('form').send({_csrf: token, name: 'Tên mới', currentPassword: originalPassword, password: 'new-password-123', confirmPassword: 'new-password-123'})).status, 403);
  }
  assert.equal(user.name, 'Nguyễn Minh An');
  assert.ok(await bcrypt.compare(originalPassword, user.passwordHash));
});

test('name changes are trimmed, scoped to the session account and escaped in SSR', async () => {
  user.role = 'viewer';
  const agent = request.agent(app); await login(agent);
  const token = await account(agent);
  const response = await agent.post('/auth/account/profile').type('form').send({_csrf: token, name: '  Trần Văn An  ', userId: other.id, id: other.id, email: other.email, role: 'admin', status: 'pending', passwordHash: 'injected'});
  assert.equal(response.status, 303);
  assert.equal(user.name, 'Trần Văn An');
  assert.equal(other.name, 'Nguyễn Minh An');
  assert.equal(user.role, 'viewer'); assert.equal(user.status, 'active');
  assert.ok(await bcrypt.compare(originalPassword, user.passwordHash));
  const script = '<script>alert(1)</script>';
  assert.equal((await agent.post('/auth/account/profile').type('form').send({_csrf: token, name: script})).status, 303);
  const page = await agent.get('/auth/account');
  assert.match(page.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(page.text, /<script>alert/);
});

test('invalid names preserve the account and show field errors with the form expanded', async () => {
  const agent = request.agent(app); await login(agent);
  const token = await account(agent);
  for (const name of ['', '  ', 'a'.repeat(121)]) {
    const response = await agent.post('/auth/account/profile').type('form').send({_csrf: token, name});
    assert.equal(response.status, 400);
    assert.match(response.text, /id="name-error"/);
    assert.match(response.text, /class="auth-settings" open/);
    assert.equal(user.name, 'Nguyễn Minh An');
  }
});

test('password change rejects wrong current passwords, invalid new passwords and confirmation mismatch', async () => {
  const agent = request.agent(app); await login(agent);
  const token = await account(agent);
  for (const input of [
    {currentPassword: 'wrong-current', password: 'replacement-123', confirmPassword: 'replacement-123'},
    {currentPassword: originalPassword, password: 'short', confirmPassword: 'short'},
    {currentPassword: originalPassword, password: 'replacement-123', confirmPassword: 'mismatch'},
    {currentPassword: originalPassword, password: 'ậ'.repeat(25), confirmPassword: 'ậ'.repeat(25)},
    {currentPassword: originalPassword, password: originalPassword, confirmPassword: originalPassword},
  ]) {
    const response = await agent.post('/auth/account/password').type('form').send({_csrf: token, ...input});
    assert.equal(response.status, 400);
    for (const value of Object.values(input)) assert.ok(!response.text.includes(`value="${value}"`), 'passwords must not be rendered back');
    assert.ok(await bcrypt.compare(originalPassword, user.passwordHash));
    assert.equal(user.passwordVersion, 0);
  }
});

test('password change invalidates all own sessions and reset links while preserving another account', async () => {
  const agent = request.agent(app), device = request.agent(app), someone = request.agent(app);
  await login(agent); await login(device); await login(someone, other);
  fixture.resetTokens.set('own', {userId: user.id, usedAt: null});
  fixture.resetTokens.set('other', {userId: other.id, usedAt: null});
  const oldSessions = [...fixture.sessions.entries()].filter(([, row]) => row.userId === user.id).map(([sid]) => sid);
  const token = await account(agent);
  const response = await agent.post('/auth/account/password').type('form').send({_csrf: token, currentPassword: originalPassword, password: 'replacement-456', confirmPassword: 'replacement-456', userId: other.id, role: 'viewer'});
  assert.equal(response.status, 303); assert.match(response.headers.location, /^\/auth\/login\?/);
  assert.match(String(response.headers['set-cookie']), /connect\.sid=;/);
  assert.equal(user.passwordVersion, 1); assert.equal(user.role, 'admin');
  assert.ok(await bcrypt.compare('replacement-456', user.passwordHash));
  assert.ok(oldSessions.every(sid => !fixture.sessions.has(sid)));
  assert.ok(fixture.resetTokens.get('own').usedAt instanceof Date);
  assert.equal(fixture.resetTokens.get('other').usedAt, null);
  for (const client of [agent, device]) assert.equal((await client.get('/auth/account')).headers.location, '/auth/login');
  assert.equal((await someone.get('/auth/account')).status, 200);
  assert.equal((await login(agent, user)).status, 400);
  assert.equal((await login(agent, user, 'replacement-456')).status, 303);
});

test('session revocation failure rolls the password and reset links back together', async () => {
  const agent = request.agent(app); await login(agent);
  fixture.resetTokens.set('own', {userId: user.id, usedAt: null});
  const token = await account(agent);
  p.session.deleteMany = async () => {throw new Error('private database failure details');};
  const response = await agent.post('/auth/account/password').type('form').send({_csrf: token, currentPassword: originalPassword, password: 'replacement-789', confirmPassword: 'replacement-789'});
  assert.equal(response.status, 500);
  assert.doesNotMatch(response.text, /private database failure details/);
  const stored = fixture.users.get(user.id);
  assert.ok(await bcrypt.compare(originalPassword, stored.passwordHash)); assert.equal(stored.passwordVersion, 0);
  assert.equal(fixture.resetTokens.get('own').usedAt, null);
  assert.equal((await agent.get('/auth/account')).status, 200);
});

test('a concurrent password reset prevents an older password-change request overwriting it', async () => {
  const agent = request.agent(app); await login(agent);
  const token = await account(agent);
  const resetHash = await bcrypt.hash('concurrent-reset-password', 4);
  p.$transaction = async (work: any) => {
    user.passwordHash = resetHash; user.passwordVersion++;
    return fixture.transaction(work);
  };
  const response = await agent.post('/auth/account/password').type('form').send({_csrf: token, currentPassword: originalPassword, password: 'stale-replacement', confirmPassword: 'stale-replacement'});
  assert.equal(response.status, 303);
  assert.equal(user.passwordHash, resetHash); assert.equal(user.passwordVersion, 1);
});

test('password-change attempts have an account limit before more password checks run', async () => {
  const agent = request.agent(app); await login(agent);
  const token = await account(agent);
  for (let count = 1; count <= 6; count++) {
    const response = await agent.post('/auth/account/password').type('form').send({_csrf: token, currentPassword: 'wrong-current', password: 'replacement-456', confirmPassword: 'replacement-456'});
    assert.equal(response.status, count <= 5 ? 400 : 429);
    if (count === 6) assert.ok(Number(response.headers['retry-after']) > 0);
  }
  assert.ok(await bcrypt.compare(originalPassword, user.passwordHash));
});
