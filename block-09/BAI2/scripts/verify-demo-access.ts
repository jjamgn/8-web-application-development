import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import request from 'supertest';
process.env.DEMO_MODE = 'false';
const { prisma } = await import('../src/db.js');
const { app } = await import('../src/app.js');
const data = JSON.parse(readFileSync('docs/demo-access.json', 'utf8'));
const password = process.env.DEMO_ACCESS_PASSWORD || readFileSync('.env.demo', 'utf8').match(/^DEMO_ACCESS_PASSWORD=(.+)$/m)?.[1];
const results: Record<string, unknown>[] = [];
let stage = 'public';
const token = (html: string) => html.match(/name="_csrf"\s+value="([a-f0-9]+)"/)![1];
try {
  for (const dish of data.dishes) {
    const response = await request(app).get(`/dishes/${dish.id}`).timeout(30000);
    assert.equal(response.status, dish.status === 'draft' ? 404 : 200);
    results.push({ request: `GET /dishes/${dish.id}`, role: 'guest', status: response.status });
  }
  for (const user of data.users) {
    stage = `${user.role}-login`;
    const agent = request.agent(app), login = await agent.get('/auth/login').timeout(30000);
    assert.equal((await agent.post('/auth/login').timeout(30000).type('form').send({ _csrf: token(login.text), email: user.email, password })).status, 303);
    stage = `${user.role}-read`;
    const page = await agent.get('/admin/dishes').timeout(30000); assert.equal(page.status, 200);
    const csrf = token((await agent.get('/auth/account').timeout(30000)).text);
    results.push({ request: 'GET /admin/dishes', role: user.role, status: page.status });
    for (const dish of data.dishes) {
      const ownDraft = user.role === 'editor' && user.chefId === dish.chefId && dish.status === 'draft';
      stage = `${user.role}-edit`;
      const edit = await agent.get(`/admin/dishes/${dish.id}/edit`).timeout(30000);
      assert.equal(edit.status, user.role === 'admin' || ownDraft ? 200 : 403);
      results.push({ request: `GET /admin/dishes/${dish.id}/edit`, role: user.role, chefId: user.chefId, status: edit.status });
      // Only rejected writes are exercised on live demo; successful mutations
      // and destructive tests run exclusively in fixture/isolated schema tests.
      if (user.role !== 'admin' && !ownDraft) {
        const patch = await agent.patch(`/admin/dishes/${dish.id}`).timeout(30000).type('form').send({ _csrf: csrf, role: 'admin', chefId: user.chefId || 1, status: 'published', name: 'FORGED' });
        assert.equal(patch.status, 403);
        results.push({ request: `PATCH /admin/dishes/${dish.id}`, role: user.role, status: patch.status });
      }
    }
    stage = `${user.role}-logout`;
    const logout = await agent.post('/auth/logout').timeout(30000).type('form').send({ _csrf: csrf }); assert.equal(logout.status, 303);
    console.log(`Verified ${user.role} HTTP permissions.`);
  }
  writeFileSync('docs/demo-http-verification.json', JSON.stringify({ passed: true, timestamp: new Date().toISOString(), results }, null, 2) + '\n');
  console.log(`Live demo HTTP verification passed (${results.length} checks); no application records mutated.`);
} catch (error: any) {
  console.error(JSON.stringify({ passed: false, stage, checksCompleted: results.length, code: error.code || 'ASSERTION', actualStatus: typeof error.actual === 'number' ? error.actual : undefined })); process.exitCode = 1;
} finally { await prisma.$disconnect(); }
