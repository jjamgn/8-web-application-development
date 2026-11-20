import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { stubSession } from './helpers/prisma-session.js';

process.env.DEMO_MODE = 'false';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.SESSION_SECRET = 'recovery-test-session-secret-at-least-32';
const { prisma } = await import('../src/db.js');
const { captchaProvider } = await import('../src/auth/captcha.js');
const { app } = await import('../src/app.js');
stubSession(prisma);
let accountLookups = 0;
(prisma.user as any).findUnique = async () => { accountLookups++; return null; };
captchaProvider.create = () => ({ text: 'ABC234', data: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });
after(async () => { await prisma.$disconnect(); });

function csrf(html: string) {
  const token = html.match(/name="_csrf"\s+value="([a-f0-9]+)"/)?.[1];
  assert.ok(token);
  return token;
}

test('forgot password limits requests by IP even with fresh sessions and different emails', async () => {
  for (let count = 1; count <= 11; count++) {
    const agent = request.agent(app);
    const page = await agent.get('/auth/forgot-password');
    await agent.get('/auth/captcha');
    const response = await agent.post('/auth/forgot-password').type('form').send({ _csrf: csrf(page.text), email: `member-${count}@example.test`, captcha: 'ABC234' });
    assert.equal(response.status, count <= 10 ? 303 : 429);
    if (count > 10) assert.ok(Number(response.headers['retry-after']) > 0);
  }
  assert.equal(accountLookups, 10, 'blocked requests never query account existence');
  assert.equal((await request(app).get('/auth/forgot-password')).status, 200);
  assert.equal((await request(app).post('/auth/forgot-password').send({email: 'member@example.test'})).status, 403);
});

test('reset attempts are limited independently and malformed tokens never reach the database', async () => {
  const agent = request.agent(app);
  const page = await agent.get('/auth/reset-password');
  const token = csrf(page.text);
  const before = accountLookups;
  for (let count = 1; count <= 21; count++) {
    const response = await agent.post('/auth/reset-password').type('form').send({ _csrf: token, token: 'not-a-token', password: 'replacement-password', confirmPassword: 'replacement-password' });
    assert.equal(response.status, count <= 20 ? 400 : 429);
    assert.doesNotMatch(response.text, /value="replacement-password"/);
  }
  assert.equal(accountLookups, before);
  assert.equal((await agent.get('/auth/reset-password')).status, 200);
});
