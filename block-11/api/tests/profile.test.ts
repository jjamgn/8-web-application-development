import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { testContext } from './helpers.js';

test('profile filter requires active session, only returns own photos and counts pages', async t => {
  const ctx = await testContext(); t.after(ctx.dispose);
  await request(ctx.app).get('/api/photos?mine=true').expect(401);
  for (const query of ['mine=false', 'mine=true&mine=true', 'uploaderId=another', 'mine=true&page=0'])
    await request(ctx.app).get('/api/photos?' + query).expect(400);
  const user = await ctx.users.create({ name: 'Owner', email: 'profile@example.test', passwordHash: await bcrypt.hash('password123', 12) });
  for (let i = 0; i < 15; i++) {
    const id = randomUUID();
    ctx.photos.rows.set(id, { id, title: 'Photo', alt: 'Test', uploader: i < 13 ? user : { id: randomUUID(), name: 'Other' }, width: 1, height: 1, createdAt: new Date().toISOString(), variants: [] });
  }
  const agent = request.agent(ctx.app);
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const login = await agent.post('/api/auth/login').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', token).send({ email: 'profile@example.test', password: 'password123' }).expect(200);
  const first = await agent.get('/api/photos?mine=true').expect(200).expect('Cache-Control', 'no-store');
  assert.equal(first.body.data.total, 13); assert.equal(first.body.data.items.length, 12);
  assert.ok(first.body.data.items.every((p: { uploader: { id: string } }) => p.uploader.id === user.id));
  const second = await agent.get('/api/photos?mine=true&page=2').expect(200);
  assert.equal(second.body.data.items.length, 1);
  assert.equal((await request(ctx.app).get('/api/photos')).body.data.total, 15);
  await agent.post('/api/auth/logout').set('Origin', ctx.config.APP_ORIGIN).set('X-CSRF-Token', login.body.data.csrfToken).expect(204);
  await agent.get('/api/photos?mine=true').expect(401);
});
