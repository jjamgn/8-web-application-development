import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { testContext } from './helpers.js';
import { createApp } from '../src/app.js';
import { DatabaseSessionStore, SESSION_MS } from '../src/auth/session.js';

test('public gallery/media and unknown API: no login and no session cookie', async t => {
  const ctx = await testContext(); t.after(ctx.dispose);
  for (const url of ['/api/photos', '/media/public-test.webp']) {
    const res = await request(ctx.app).get(url).expect(200);
    assert.equal(res.headers['set-cookie'], undefined);
  }
  await request(ctx.app).get('/api/auth/me').expect(401).expect('Cache-Control', 'no-store');
  const missing = await request(ctx.app).get('/api/missing').expect(404);
  assert.equal(missing.body.error.code, 'NOT_FOUND'); assert.equal(ctx.sessions.rows.size, 0);
});

test('register → login rotation → me → restart → logout; user data stays private', async t => {
  const ctx = await testContext(); t.after(ctx.dispose);
  const agent = request.agent(ctx.app);
  const csrf = await agent.get('/api/auth/csrf').expect(200).expect('Cache-Control', 'no-store');
  const preCookie = csrf.headers['set-cookie'][0];
  assert.match(preCookie, /block11.sid=/); assert.match(preCookie, /HttpOnly/); assert.match(preCookie, /SameSite=Lax/);
  const token = csrf.body.data.csrfToken;
  const registration = { name: '  Người đăng  ', email: '  PHOTO@Example.com  ', password: 'password123', confirmPassword: 'password123' };
  const created = await agent.post('/api/auth/register').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token).send(registration).expect(201);
  assert.deepEqual(Object.keys(created.body.data.user).sort(), ['id','name']);
  assert.equal(created.body.data.user.name, 'Người đăng');
  const stored = await ctx.users.byEmail('photo@example.com');
  assert.ok(stored); assert.equal(bcrypt.getRounds(stored.passwordHash), 12); assert.notEqual(stored.passwordHash, registration.password);
  await agent.get('/api/auth/me').expect(401); // Registration does not log in.
  await agent.post('/api/auth/register').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token).send(registration).expect(409);
  const logged = await agent.post('/api/auth/login').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token)
    .send({ email: 'PHOTO@example.com', password: registration.password }).expect(200);
  const authCookie = logged.headers['set-cookie'][0];
  assert.notEqual(authCookie.split(';')[0], preCookie.split(';')[0]);
  assert.notEqual(logged.body.data.csrfToken, token);
  assert.equal(ctx.sessions.rows.size, 1);
  const active = [...ctx.sessions.rows.values()][0]!;
  const originalExpiry = active.expiresAt.getTime();
  assert.ok(originalExpiry > Date.now() + SESSION_MS - 5000);
  await agent.get('/api/auth/me').expect(200);
  const restarted = createApp(ctx.config, ctx);
  await request(restarted).get('/api/auth/me').set('Cookie', authCookie.split(';')[0]!).expect(200);
  assert.equal([...ctx.sessions.rows.values()][0]!.expiresAt.getTime(), originalExpiry);
  await agent.post('/api/auth/logout').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token).expect(403);
  await agent.post('/api/auth/logout').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', logged.body.data.csrfToken).expect(204);
  assert.equal(ctx.sessions.rows.size, 0);
  await request(restarted).get('/api/auth/me').set('Cookie', authCookie.split(';')[0]!).expect(401);
});

test('auth/CSRF reject before staging; origin, missing token and invalid token', async t => {
  const ctx = await testContext(); t.after(ctx.dispose);
  await request(ctx.app).post('/api/photos').send('bad multipart').expect(401);
  await assert.rejects(access(ctx.config.UPLOAD_TMP_DIR));
  const agent = request.agent(ctx.app);
  const { body } = await agent.get('/api/auth/csrf');
  for (const origin of ['https://attacker.example', undefined]) {
    let req = agent.post('/api/auth/register').set('X-CSRF-Token', body.data.csrfToken);
    if (origin) req = req.set('Origin', origin);
    await req.send({}).expect(403);
  }
  for (const token of ['', 'wrong']) {
    await agent.post('/api/auth/login').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token).send({}).expect(403);
  }
});

test('registration validation: strict keys, Unicode, password confirmation/UTF-8 byte limit and JSON size', async t => {
  const ctx = await testContext(); t.after(ctx.dispose);
  const agent = request.agent(ctx.app);
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const base = { name: 'Ảnh', email: 'photo@example.com', password: 'password123', confirmPassword: 'password123' };
  const invalid = [ { ...base, name: ' ' }, { ...base, name: '😀'.repeat(121) }, { ...base, email: 'bad' },
    { ...base, password: 'short' }, { ...base, password: '😀'.repeat(4), confirmPassword: '😀'.repeat(4) },
    { ...base, password: '😀'.repeat(19), confirmPassword: '😀'.repeat(19) },
    { ...base, confirmPassword: 'mismatch' }, { ...base, uploaderId: 'fake' } ];
  for (const body of invalid) await agent.post('/api/auth/register').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token).send(body).expect(400);
  await agent.post('/api/auth/register').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token).send({ ...base, name: 'x'.repeat(20_000) }).expect(413);
  await agent.post('/api/auth/register').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token)
    .set('Content-Type', 'application/json').send('{bad').expect(400);
  assert.equal(ctx.users.rows.size, 0);
});

test('session store enforces absolute expiry and cannot resurrect a logged-out row', async t => {
  const ctx = await testContext(); t.after(ctx.dispose);
  const agent = request.agent(ctx.app);
  await agent.get('/api/auth/csrf');
  const row = [...ctx.sessions.rows.values()][0]!;
  const store = new DatabaseSessionStore(ctx.sessions);
  await ctx.sessions.destroy(row.sid);
  const error = await new Promise<unknown>(resolve => store.set(row.sid, row.data, resolve));
  assert.equal((error as { code: string }).code, 'AUTH_REQUIRED');
  assert.equal(ctx.sessions.rows.size, 0);
  row.expiresAt = new Date(Date.now() - 1); await ctx.sessions.create(row);
  const data = await new Promise(resolve => store.get(row.sid, (err, value) => { assert.equal(err, null); resolve(value); }));
  assert.equal(data, null); assert.equal(ctx.sessions.rows.size, 0);
});

test('wrong email/password share INVALID_CREDENTIALS; failed login limit has Retry-After', async t => {
  const ctx = await testContext(); t.after(ctx.dispose);
  const agent = request.agent(ctx.app);
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  for (let i = 0; i < 10; i++) {
    const res = await agent.post('/api/auth/login').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token)
      .send({ email: 'missing@example.com', password: 'password123' }).expect(401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  }
  const blocked = await agent.post('/api/auth/login').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token)
    .send({ email: 'missing@example.com', password: 'password123' }).expect(429);
  assert.ok(Number(blocked.headers['retry-after']) > 0); assert.equal(blocked.body.error.code, 'RATE_LIMITED');
});

test('register rate limit, production Secure cookie and password 72-byte boundary', async t => {
  const ctx=await testContext(); t.after(ctx.dispose);
  const agent=request.agent(ctx.app); const token=(await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const password='😀'.repeat(18); assert.equal(Buffer.byteLength(password),72);
  await agent.post('/api/auth/register').set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',token)
    .send({name:'😀'.repeat(120),email:'boundary@example.com',password,confirmPassword:password}).expect(201);
  for(let i=0;i<9;i++) await agent.post('/api/auth/register').set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',token).send({}).expect(400);
  await agent.post('/api/auth/register').set('Origin',ctx.config.APP_ORIGIN).set('X-CSRF-Token',token).send({}).expect(429);
  const production=createApp({...ctx.config,NODE_ENV:'production',TRUST_PROXY_HOPS:1},ctx);
  const csrf=await request(production).get('/api/auth/csrf').set('X-Forwarded-Proto','https').expect(200);
  assert.match(csrf.headers['set-cookie'][0],/; Secure/);
});

test('production deep links serve the web build while API/media misses remain JSON 404',async t=>{
  const ctx=await testContext();t.after(ctx.dispose);
  const webDist=path.join(ctx.tempRoot,'web-dist');await mkdir(webDist);
  await writeFile(path.join(webDist,'index.html'),'<!doctype html><title>Gallery test build</title><div id="root"></div>');
  const app=createApp(ctx.config,ctx,{webDist});
  for(const route of ['/','/photos','/photos/upload','/photos/123','/login','/register'])
    await request(app).get(route).expect(200).expect('Content-Type',/text\/html/);
  for(const route of ['/api/missing','/media/missing']){
    const missing=await request(app).get(route).expect(404).expect('Content-Type',/application\/json/);
    assert.equal(missing.body.error.code,'NOT_FOUND');
  }
  assert.throws(()=>createApp(ctx.config,ctx,{webDist:path.join(ctx.tempRoot,'missing-build')}),/React build is missing/);
});
