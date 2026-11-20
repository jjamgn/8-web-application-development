import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { dishes, chefs, ingredients } from '../src/data.js';
import { stubSession, stubLoginAttempts } from './helpers/prisma-session.js';

process.env.DEMO_MODE = 'false';
process.env.DATABASE_URL = process.env.DIRECT_URL = 'postgresql://test:test@localhost:5432/test';
process.env.SESSION_SECRET = 'access-tests-session-secret-at-least-32-characters';
process.env.AUTH_TOKEN_SECRET = 'access-tests-token-secret-at-least-32-characters';
const { prisma } = await import('../src/db.js');
const { app } = await import('../src/app.js');
const p = prisma as any;
const sessions = stubSession(p);
const attempts = stubLoginAttempts(p);
const hash = await bcrypt.hash('access-test-password', 4);
let users: any[], rows: any[], writes: number, storageCalls: string[];
let onLock: (() => void) | undefined, onUpload: (() => void) | undefined;
const server = createServer((req, res) => {
  storageCalls.push(req.method!);
  req.resume(); req.on('end', () => {
    if (req.method === 'POST') onUpload?.();
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}');
  });
});
before(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  p.user.findUnique = async ({ where }: any) => structuredClone(users.find(u => u.id === where.id || u.email === where.email) || null);
  p.$queryRaw = async () => { const hook = onLock; onLock = undefined; hook?.(); return []; };
  p.$transaction = async (fn: any) => fn(p);
  p.dish.findUnique = async ({ where }: any) => structuredClone(rows.find(d => d.id === where.id) || null);
  p.dish.findMany = async ({ where = {} }: any) => structuredClone(rows.filter(d => !where.status || d.status === where.status));
  p.dish.count = async ({ where = {} }: any = {}) => rows.filter(d => !where.status || d.status === where.status).length;
  for (const [model, data] of [['chef', chefs], ['ingredient', ingredients]] as const) {
    p[model].findMany = async () => data;
    p[model].findUnique = async ({ where }: any) => data.find(x => x.id === where.id) || null;
    p[model].count = async () => data.length;
    for (const method of ['create', 'update', 'delete']) p[model][method] = async () => { writes++; return {}; };
  }
  p.dishIngredient.deleteMany = async () => { writes++; return { count: 1 }; };
  p.dish.create = async ({ data }: any) => { writes++; const row = { ...data, id: 90 }; rows.push(row); return row; };
  p.dish.update = async ({ where, data }: any) => {
    writes++;
    const { ingredients: recipe, ...fields } = data;
    Object.assign(rows.find(x => x.id === where.id), fields, {
      chef: chefs.find(c => c.id === fields.chefId),
      ingredients: recipe.create.map((r: any) => ({ ...r, ingredient: ingredients.find(i => i.id === r.ingredientId) }))
    });
    return {};
  };
  p.dish.delete = async ({ where }: any) => { writes++; rows = rows.filter(x => x.id !== where.id); return {}; };
});
beforeEach(() => {
  sessions.clear(); attempts.clear(); writes = 0; storageCalls = []; onLock = onUpload = undefined;
  users = ['viewer', 'editor', 'editor', 'admin'].map((role, i) => ({
    id: i + 1, email: `user${i + 1}@example.test`, name: role, role, chefId: role === 'editor' ? i : null,
    status: 'active', emailVerifiedAt: new Date(), passwordHash: hash, passwordVersion: 0
  }));
  rows = dishes.slice(0, 3).map((d, i) => ({ ...d, id: i + 1, chefId: i === 1 ? 2 : 1, status: i === 2 ? 'published' : 'draft' }));
});
after(async () => { await new Promise<void>(r => server.close(() => r())); await prisma.$disconnect(); });
function token(html: string) { return html.match(/name="_csrf"\s+value="([a-f0-9]+)"/)![1]; }
async function login(id: number) {
  const agent = request.agent(app), page = await agent.get('/auth/login');
  assert.equal((await agent.post('/auth/login').type('form').send({ _csrf: token(page.text), email: users[id - 1].email, password: 'access-test-password' })).status, 303);
  return { agent, csrf: token((await agent.get('/auth/account')).text) };
}
const input = { name: 'Món kiểm thử quyền', description: 'Mô tả kiểm thử', price: '120000', category: 'Món chính', available: 'on', chefId: '2', status: 'published', role: 'admin' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

test('request matrix: all roles read; only allowed roles get mutation forms or mutate', async () => {
  for (const id of [1, 2, 3, 4]) {
    const { agent, csrf } = await login(id);
    for (const kind of ['dishes', 'chefs', 'ingredients']) assert.equal((await agent.get(`/admin/${kind}`)).status, 200);
    assert.equal((await agent.get('/admin/dishes/new')).status, id === 1 ? 403 : 200);
    assert.equal((await agent.get('/admin/dishes/1/edit')).status, [2, 4].includes(id) ? 200 : 403);
    assert.equal((await agent.get('/admin/dishes/3/edit')).status, id === 4 ? 200 : 403);
    for (const kind of ['chefs', 'ingredients']) {
      assert.equal((await agent.get(`/admin/${kind}/new`)).status, id === 4 ? 200 : 403);
      assert.equal((await agent.get(`/admin/${kind}/1/edit`)).status, id === 4 ? 200 : 403);
      if (id !== 4) {
        for (const method of ['post', 'patch', 'delete'] as const)
          assert.equal((await agent[method](`/admin/${kind}${method === 'post' ? '' : '/1'}`).type('form').send({ _csrf: csrf, ...input })).status, 403);
        assert.equal((await agent.get(`/admin/${kind}/1/delete`)).status, 403);
      }
    }
    if (id !== 4) {
      assert.equal((await agent.get('/admin/dishes/1/delete')).status, 403);
      assert.equal((await agent.post('/admin/dishes/1').type('form').send({ _csrf: csrf, _method: 'DELETE', role: 'admin' })).status, 403);
    }
    assert.equal((await agent.patch('/admin/dishes/9999').type('form').send({ _csrf: csrf, ...input })).status, 404);
  }
  assert.equal(writes, 0); assert.deepEqual(storageCalls, []);
});
test('editor ignores forged ownership/status/role; availability remains editable on own draft', async () => {
  const { agent, csrf } = await login(2);
  assert.equal((await agent.patch('/admin/dishes/1').type('form').send({ _csrf: csrf, ...input })).status, 303);
  assert.equal(rows[0].chefId, 1); assert.equal(rows[0].status, 'draft'); assert.equal(rows[0].available, true);
  assert.equal((await agent.patch('/admin/dishes/1').type('form').send({ _csrf: csrf, ...input, available: '' })).status, 303);
  assert.equal(rows[0].available, false);
  assert.equal((await agent.post('/admin/dishes').field('_csrf', csrf).field(input).attach('image', png, 'dish.png')).status, 303);
  assert.equal(rows.at(-1).chefId, 1); assert.equal(rows.at(-1).status, 'draft');
  for (const id of [2, 3]) assert.equal((await agent.patch(`/admin/dishes/${id}`).type('form').send({ _csrf: csrf, ...input })).status, 403);
});
test('admin may reassign/publish dishes; missing status on edit preserves existing draft', async () => {
  const { agent, csrf } = await login(4);
  const { status, ...withoutStatus } = input;
  assert.equal((await agent.patch('/admin/dishes/1').type('form').send({ _csrf: csrf, ...withoutStatus })).status, 303);
  assert.equal(rows[0].status, 'draft');
  assert.equal((await agent.patch('/admin/dishes/1').type('form').send({ _csrf: csrf, ...input })).status, 303);
  assert.equal(rows[0].status, 'published'); assert.equal(rows[0].chefId, 2);
  assert.equal((await request(app).get('/dishes/1')).status, 200);
});
test('unknown role and editor without chef fail closed, and stale password version cannot write', async () => {
  const { agent, csrf } = await login(2);
  users[1].role = 'owner';
  assert.equal((await agent.get('/admin/dishes')).status, 403);
  users[1].role = 'editor'; users[1].chefId = null;
  assert.equal((await agent.get('/admin/dishes')).status, 403);
  users[1].chefId = 1;
  onLock = () => { users[1].passwordVersion++; };
  assert.equal((await agent.patch('/admin/dishes/1').type('form').send({ _csrf: csrf, ...input })).status, 403);
  assert.equal(writes, 0);
});
test('PATCH rechecks role, linked chef, dish owner/status after a valid edit GET', async () => {
  for (const change of [() => { users[1].role = 'viewer'; users[1].chefId = null; }, () => { users[1].chefId = 2; }, () => { rows[0].status = 'published'; }, () => { rows[0].chefId = 2; }]) {
    users[1].role = 'editor'; users[1].chefId = 1; rows[0].status = 'draft'; rows[0].chefId = 1;
    const { agent, csrf } = await login(2);
    assert.equal((await agent.get('/admin/dishes/1/edit')).status, 200);
    onLock = change;
    assert.equal((await agent.patch('/admin/dishes/1').type('form').send({ _csrf: csrf, ...input })).status, 403);
    assert.equal(writes, 0);
  }
});
test('storage untouched on denied/CSRF requests; race rejection removes newly uploaded image', async () => {
  const { agent, csrf } = await login(2);
  assert.equal((await agent.patch('/admin/dishes/2').field('_csrf', csrf).field(input).attach('image', png, 'dish.png')).status, 403);
  assert.equal((await agent.patch('/admin/dishes/1').field(input).attach('image', png, 'dish.png')).status, 403);
  assert.deepEqual(storageCalls, []);
  onUpload = () => { rows[0].status = 'published'; };
  assert.equal((await agent.patch('/admin/dishes/1').field('_csrf', csrf).field(input).attach('image', png, 'dish.png')).status, 403);
  assert.deepEqual(storageCalls, ['POST', 'DELETE']); assert.equal(writes, 0);
});
test('public listing and both detail URLs hide drafts while admin can read them', async () => {
  const page = await request(app).get('/dishes'); assert.equal(page.status, 200);
  const grid = page.text.slice(page.text.indexOf('class="dish-grid"'));
  assert.ok(!grid.includes(`/dishes/1"`)); assert.ok(grid.includes('/dishes/3'));
  for (const prefix of ['/dish', '/dishes']) assert.equal((await request(app).get(`${prefix}/1`)).status, 404);
  assert.equal((await request(app).get('/dishes/3')).status, 200);
  const {agent}=await login(1);
  assert.equal((await agent.get('/admin/dishes/1')).status,200);
});
test('pending sessions cannot read admin/account; expired/reset pending goes to login', async () => {
  const { agent } = await login(2);
  const row = [...sessions.values()].find(s => s.userId === 2)!;
  delete row.sess.userId; row.userId = null;
  Object.assign(row.sess, { mfaPendingUserId: 2, mfaPendingPasswordVersion: 0, mfaPendingExpiresAt: Date.now() + 300000 });
  for (const url of ['/admin/dishes', '/auth/account']) assert.equal((await agent.get(url)).headers.location, '/auth/mfa');
  users[1].passwordVersion++;
  assert.equal((await agent.get('/admin/dishes')).headers.location, '/auth/login');
  users[1].passwordVersion--; row.sess.mfaPendingExpiresAt = Date.now() - 1;
  assert.equal((await agent.get('/auth/account')).headers.location, '/auth/login');
});
