import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { testContext } from './helpers.js';

test('LAN and explicit local origins pass CSRF with valid token; unknown origins and bad tokens stay blocked', async t => {
  const ctx = await testContext(); t.after(ctx.dispose);
  ctx.config.APP_ORIGIN = 'http://192.168.100.154:5173';
  ctx.config.ADDITIONAL_APP_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const agent = request.agent(createApp(ctx.config, ctx));
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  for (const origin of [ctx.config.APP_ORIGIN, ...ctx.config.ADDITIONAL_APP_ORIGINS]) {
    const res = await agent.post('/api/auth/login').set('Origin', origin).set('X-CSRF-Token', token).send({}).expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
  for (const origin of ['http://localhost:5174', 'https://evil.example', 'null']) {
    const res = await agent.post('/api/auth/login').set('Origin', origin).set('X-CSRF-Token', token).send({}).expect(403);
    assert.equal(res.body.error.code, 'ORIGIN_NOT_ALLOWED');
  }
  const invalid = await agent.post('/api/auth/login').set('Origin', 'http://localhost:5173').set('X-CSRF-Token', 'bad').send({}).expect(403);
  assert.equal(invalid.body.error.code, 'CSRF_INVALID');
  assert.equal(ctx.users.rows.size, 0);
});

test('extra origins are explicit development configuration and are rejected for production', async t => {
  const ctx = await testContext(); t.after(ctx.dispose);
  const keys = [...Object.keys(ctx.config), 'ADDITIONAL_APP_ORIGINS'];
  const saved = new Map(keys.map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(ctx.config)) process.env[key] = String(value);
    process.env.NODE_ENV = 'development'; process.env.ADDITIONAL_APP_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';
    assert.equal(loadConfig().ADDITIONAL_APP_ORIGINS?.length, 2);
    process.env.NODE_ENV = 'production';
    assert.throws(() => loadConfig(), /ADDITIONAL_APP_ORIGINS/);
    process.env.ADDITIONAL_APP_ORIGINS = '';
    assert.deepEqual(loadConfig().ADDITIONAL_APP_ORIGINS, []);
  } finally { for (const [key, value] of saved) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
