import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createProductionAuthServices } from '../src/lib/auth-production.js';
import { createApp } from '../src/app.js';

process.env.AUTH_TOKEN_SECRET = 'adapter-test-only-auth-secret-01234567890123456789';
process.env.JWT_SECRET = 'adapter-test-only-jwt-secret-01234567890123456789';
process.env.TURNSTILE_SECRET_KEY = 'test-only';
process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'localhost';
const origin = 'http://localhost:5173';

// In-memory Prisma-shaped test double; this tests port wiring, not PostgreSQL isolation.
async function fixture() {
  let time = new Date();
  const user = { id: 1, name: 'Adapter', email: 'adapter@example.test', role: 'viewer',
    passwordHash: await bcrypt.hash('password-test', 4), passwordVersion: 0,
    status: 'active', emailVerifiedAt: time };
  const attempts = new Map<string, any>();
  const refresh = new Map<string, any>();
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'gt' in value) return row[key] > (value as { gt: Date }).gt;
    return row[key] === value;
  });
  const db: any = {
    user: {
      findUnique: async ({ where }: any) => matches(user, where) ? { ...user } : null,
      create: async () => { throw { code: 'P2002' }; },
      updateMany: async ({ where, data }: any) => {
        if (!matches(user, where)) return { count: 0 };
        if (data.passwordHash !== undefined) user.passwordHash = data.passwordHash;
        if (data.passwordVersion !== undefined) user.passwordVersion += data.passwordVersion.increment;
        if (data.name !== undefined) user.name = data.name;
        return { count: 1 };
      },
    },
    passwordResetToken: { updateMany: async () => ({ count: 0 }) },
    loginAttempt: {
      findUnique: async ({ where }: any) => attempts.get(where.key) ?? null,
      upsert: async ({ where, create, update }: any) => { const row = attempts.has(where.key) ? { ...attempts.get(where.key), ...update } : create; attempts.set(where.key, row); return row; },
      deleteMany: async ({ where }: any) => ({ count: Number(attempts.delete(where.key)) }),
    },
    refreshToken: {
      create: async ({ data }: any) => { const row = { id: String(refresh.size + 1), usedAt: null, revokedAt: null, replacedById: null, ...data }; refresh.set(row.id, row); return { ...row }; },
      findUnique: async ({ where }: any) => { const row = [...refresh.values()].find(row => matches(row, where)); return row ? { ...row, user: { ...user } } : null; },
      findFirst: async ({ where }: any) => { const row = [...refresh.values()].find(row => matches(row, where)); return row ? { ...row, user: { ...user } } : null; },
      updateMany: async ({ where, data }: any) => { let count = 0; for (const row of refresh.values()) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; },
      update: async ({ where, data }: any) => { const row = refresh.get(where.id); Object.assign(row, data); return { ...row }; },
    },
  };
  db.$transaction = async (work: (tx: unknown) => unknown) => work(db);
  const services = createProductionAuthServices({ db: db as PrismaClient, now: () => time });
  return { app: createApp(services), services, user, refresh, db, advance: () => { time = new Date(time.getTime() + 900001); } };
}
const cookie = (response: request.Response) => (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

test('A production services and B HTTP: login, reload, rotation, replay revocation', async () => {
  const f = await fixture();
  const logged = await request(f.app).post('/api/auth/login').set('Origin', origin).send({ email: f.user.email, password: 'password-test' });
  assert.equal(logged.status, 200);
  assert.equal(logged.body.ok, true);
  assert.equal(logged.body.data.user.passwordHash, undefined);
  const first = cookie(logged);
  const csrf = await request(f.app).get('/api/auth/csrf').set('Origin', origin).set('Cookie', first);
  assert.equal(csrf.status, 200);
  const rotated = await request(f.app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', first).set('X-CSRF-Token', csrf.body.data.csrfToken);
  assert.equal(rotated.status, 200);
  assert.notEqual(cookie(rotated), first);
  assert.equal((await request(f.app).get('/api/auth/me').auth(rotated.body.data.accessToken, { type: 'bearer' })).status, 200);
  const replay = await request(f.app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', first).set('X-CSRF-Token', csrf.body.data.csrfToken);
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error.code, 'REFRESH_TOKEN_REUSED');
  assert.ok([...f.refresh.values()].every(row => row.revokedAt));
  assert.equal((await request(f.app).get('/api/auth/me').auth(rotated.body.data.accessToken, { type: 'bearer' })).status, 401);
});

test('register verifies a single-use Turnstile token once across B route and A service', async () => {
  const f = await fixture();
  const saved = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ success: true, hostname: 'localhost' }), { headers: { 'Content-Type': 'application/json' } }); };
  try {
    const response = await request(f.app).post('/api/auth/register').send({ name: 'Existing', email: f.user.email, password: 'password-test', confirmPassword: 'password-test', captchaToken: 'single-use' });
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = saved; }
});

test('production HTTP quota persists its limit and resets after the 15-minute window', async () => {
  const f = await fixture();
  for (let index = 0; index < 30; index++) await f.services.enforceIpLimit('register', 'test-ip');
  await assert.rejects(f.services.enforceIpLimit('register', 'test-ip'), { code: 'RATE_LIMITED', status: 429 });
  f.advance();
  await f.services.enforceIpLimit('register', 'test-ip');
});

const changeInput = { currentPassword: 'password-test', password: 'new-password-test', confirmPassword: 'new-password-test' };
async function loginFixture(f: Awaited<ReturnType<typeof fixture>>): Promise<request.Response> {
  return request(f.app).post('/api/auth/login').set('Origin', origin).send({ email: f.user.email, password: 'password-test' });
}
function changeRequest(f: Awaited<ReturnType<typeof fixture>>, logged: request.Response, body = changeInput) {
  return request(f.app).post('/api/auth/change-password').set('Origin', origin)
    .auth(logged.body.data.accessToken, { type: 'bearer' }).set('X-CSRF-Token', logged.body.data.csrfToken).send(body);
}

test('password change keeps a new current session and invalidates every old device', async () => {
  const f = await fixture();
  const first = await loginFixture(f), second = await loginFixture(f);
  const oldRows = [...f.refresh.values()];
  const changed = await changeRequest(f, first);
  assert.equal(changed.status, 200);
  assert.equal(changed.body.ok, true);
  assert.equal(changed.body.data.expiresIn, 600);
  assert.equal(changed.body.data.user.passwordHash, undefined);
  assert.equal(changed.body.data.refreshToken, undefined);
  assert.notEqual(cookie(changed), cookie(first));
  assert.notEqual(changed.body.data.csrfToken, first.body.data.csrfToken);
  assert.equal(f.user.passwordVersion, 1);
  assert.ok(await bcrypt.compare(changeInput.password, f.user.passwordHash));
  assert.ok(oldRows.every(row => row.revokedAt));
  assert.equal([...f.refresh.values()].filter(row => !row.revokedAt).length, 1);
  for (const previous of [first, second]) {
    assert.equal((await request(f.app).get('/api/auth/me').auth(previous.body.data.accessToken, { type: 'bearer' })).status, 401);
    assert.equal((await request(f.app).get('/api/auth/csrf').set('Origin', origin).set('Cookie', cookie(previous))).status, 401);
  }
  assert.equal((await request(f.app).get('/api/auth/me').auth(changed.body.data.accessToken, { type: 'bearer' })).status, 200);
  const reload = await request(f.app).get('/api/auth/csrf').set('Origin', origin).set('Cookie', cookie(changed));
  assert.equal(reload.status, 200);
  assert.equal((await request(f.app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', cookie(changed)).set('X-CSRF-Token', reload.body.data.csrfToken)).status, 200);
  const wrongOldLogin = await loginFixture(f);
  assert.equal(wrongOldLogin.body.error.code, 'INVALID_CREDENTIALS');
  const newLogin = await request(f.app).post('/api/auth/login').set('Origin', origin).send({ email: f.user.email, password: changeInput.password });
  assert.equal(newLogin.body.ok, true);
});

test('wrong current password and invalid confirmation do not change credentials or revoke sessions', async () => {
  const f = await fixture(), logged = await loginFixture(f);
  const hash = f.user.passwordHash;
  const wrong = await changeRequest(f, logged, { ...changeInput, currentPassword: 'incorrect' });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.body.error.code, 'CURRENT_PASSWORD_INVALID');
  assert.ok(wrong.body.error.fields.currentPassword);
  assert.equal(wrong.headers['set-cookie'], undefined);
  const mismatch = await changeRequest(f, logged, { ...changeInput, confirmPassword: 'different' });
  assert.equal(mismatch.body.error.code, 'VALIDATION_FAILED');
  assert.ok(mismatch.body.error.fields.confirmPassword);
  const longPassword = 'ế'.repeat(25);
  const tooLong = await changeRequest(f, logged, { ...changeInput, password: longPassword, confirmPassword: longPassword });
  assert.equal(tooLong.body.error.code, 'VALIDATION_FAILED');
  assert.equal(f.user.passwordHash, hash);
  assert.equal(f.user.passwordVersion, 0);
  assert.ok([...f.refresh.values()].every(row => !row.revokedAt));
});

test('password change requires Bearer, exact Origin and CSRF before updating credentials', async () => {
  const f = await fixture(), logged = await loginFixture(f);
  assert.equal((await request(f.app).post('/api/auth/change-password').set('Origin', origin).send(changeInput)).status, 401);
  assert.equal((await request(f.app).post('/api/auth/change-password').auth(logged.body.data.accessToken, { type: 'bearer' }).send(changeInput)).status, 403);
  const csrf = await request(f.app).post('/api/auth/change-password').set('Origin', origin).auth(logged.body.data.accessToken, { type: 'bearer' }).send(changeInput);
  assert.equal(csrf.status, 403);
  assert.equal(csrf.body.error.code, 'CSRF_INVALID');
  assert.equal(f.user.passwordVersion, 0);
});

test('per-user password change quota blocks guessing without changing the login password', async () => {
  const f = await fixture(), logged = await loginFixture(f);
  for (let i = 0; i < 5; i++) assert.equal((await changeRequest(f, logged, { ...changeInput, currentPassword: 'incorrect' })).body.error.code, 'CURRENT_PASSWORD_INVALID');
  const blocked = await changeRequest(f, logged);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'RATE_LIMITED');
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  assert.equal(f.user.passwordVersion, 0);
  assert.equal((await loginFixture(f)).body.ok, true);
  f.advance();
  // The old session expires neither at 15 minutes nor because of change-password quota.
  const freshLogin = await loginFixture(f);
  assert.equal((await changeRequest(f, freshLogin)).body.ok, true);
});

test('password hash/version changed during bcrypt and revoked sessions cannot be overwritten', async () => {
  const f = await fixture(), logged = await loginFixture(f);
  const family = [...f.refresh.values()][0].familyId;
  const identity = { userId: String(f.user.id), familyId: family, passwordVersion: 0 };
  const find = f.db.user.findUnique;
  let reads = 0;
  f.db.user.findUnique = async (args: unknown) => { if (++reads === 2) f.user.passwordVersion++; return find(args); };
  const beforeHash = f.user.passwordHash;
  await assert.rejects(f.services.changePassword(changeInput, identity), { code: 'UNAUTHENTICATED' });
  assert.equal(f.user.passwordHash, beforeHash);
  assert.equal(f.refresh.size, 1);

  const g = await fixture();
  await loginFixture(g);
  const row = [...g.refresh.values()][0];
  row.revokedAt = new Date();
  await assert.rejects(g.services.changePassword(changeInput, { userId: String(g.user.id), familyId: row.familyId, passwordVersion: 0 }), { code: 'UNAUTHENTICATED' });
  assert.equal(g.user.passwordVersion, 0);
});

test('profile name update trims input, whitelists name and keeps both device sessions valid', async () => {
  const f = await fixture(), logged = await loginFixture(f), otherDevice = await loginFixture(f);
  const before = { hash: f.user.passwordHash, version: f.user.passwordVersion, email: f.user.email, role: f.user.role, rows: f.refresh.size };
  const result = await request(f.app).patch('/api/auth/me').set('Origin', origin)
    .auth(logged.body.data.accessToken, { type: 'bearer' }).set('X-CSRF-Token', logged.body.data.csrfToken)
    .send({ name: '  Nguyễn Tên Mới  ', email: 'attacker@example.test', role: 'admin', id: 999, passwordVersion: 99 });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { id: f.user.id, name: 'Nguyễn Tên Mới', email: before.email, role: before.role });
  assert.equal(result.headers['set-cookie'], undefined);
  assert.equal(f.user.passwordHash, before.hash);
  assert.equal(f.user.passwordVersion, before.version);
  assert.equal(f.refresh.size, before.rows);
  assert.ok([...f.refresh.values()].every(row => !row.revokedAt));
  for (const device of [logged, otherDevice]) {
    const me = await request(f.app).get('/api/auth/me').auth(device.body.data.accessToken, { type: 'bearer' });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.name, 'Nguyễn Tên Mới');
  }
});

test('profile name validation rejects blank/oversized/non-string names without changing data', async () => {
  const f = await fixture(), logged = await loginFixture(f);
  for (const name of ['   ', 'x'.repeat(121), 123, null]) {
    const result = await request(f.app).patch('/api/auth/me').set('Origin', origin)
      .auth(logged.body.data.accessToken, { type: 'bearer' }).set('X-CSRF-Token', logged.body.data.csrfToken).send({ name });
    assert.equal(result.status, 200);
    assert.equal(result.body.error.code, 'VALIDATION_FAILED');
    assert.ok(result.body.error.fields.name);
  }
  assert.equal(f.user.name, 'Adapter');
});

test('profile update rejects missing auth, Origin/CSRF and a session revoked before the write', async () => {
  const f = await fixture(), logged = await loginFixture(f);
  const body = { name: 'New name' };
  assert.equal((await request(f.app).patch('/api/auth/me').set('Origin', origin).send(body)).status, 401);
  assert.equal((await request(f.app).patch('/api/auth/me').auth(logged.body.data.accessToken, { type: 'bearer' }).send(body)).status, 403);
  assert.equal((await request(f.app).patch('/api/auth/me').set('Origin', origin).auth(logged.body.data.accessToken, { type: 'bearer' }).send(body)).status, 403);
  const row = [...f.refresh.values()][0];
  row.revokedAt = new Date();
  await assert.rejects(f.services.updateProfile(body, { userId: String(f.user.id), familyId: row.familyId, passwordVersion: 0 }), { code: 'UNAUTHENTICATED' });
  assert.equal(f.user.name, 'Adapter');
});
