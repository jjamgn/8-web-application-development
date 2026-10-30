import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { chefs, ingredients, dishes } from '../src/data.js';

// Adapted from Block5 mutations.test.ts. Never connect to or mutate Supabase.
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.SPA_ORIGIN = 'http://localhost:5173';
const { prisma } = await import('../src/db.js');
const { app } = await import('../src/app.js');
const p = prisma as any;
const resources = ['dishes', 'chefs', 'ingredients'] as const;
const samples = {
  dishes: { name: 'Món mới', description: 'Mô tả', price: 0, category: 'Món chính', chefId: 1, available: false },
  chefs: { name: 'Đầu bếp mới', specialty: 'Món Việt', bio: 'Giới thiệu' },
  ingredients: { name: 'Nguyên liệu mới', unit: 'g' },
};
let state: Record<string, any[]>;
let calls: { kind: string; op: string; args: any }[];
let fault: Error | undefined;
const dbError = (code: string) => new Prisma.PrismaClientKnownRequestError('private database details', { code, clientVersion: '6.12.0' });
before(() => {
  for (const [kind, model] of [['chefs', 'chef'], ['ingredients', 'ingredient'], ['dishes', 'dish']]) {
    for (const op of ['findMany', 'findUnique', 'create', 'update', 'delete']) {
      p[model][op] = async (args: any) => {
        calls.push({ kind, op, args });
        if (fault) throw fault;
        const rows = state[kind];
        if (op === 'findMany') return rows.filter(row => !args.where?.name || row.name.toLocaleLowerCase('vi').includes(args.where.name.contains.toLocaleLowerCase('vi')));
        if (op === 'findUnique') return rows.find(row => row.id === args.where.id) ?? null;
        if (kind === 'ingredients' && args.data?.name && rows.some(row => row.name === args.data.name && row.id !== args.where?.id)) throw dbError('P2002');
        if (op === 'create') {
          const row = { id: Math.max(0, ...rows.map(row => row.id)) + 1, ...args.data };
          rows.push(row);
          return row;
        }
        const index = rows.findIndex(row => row.id === args.where.id);
        if (index < 0) throw dbError('P2025');
        if (op === 'update') { rows[index] = { ...rows[index], ...args.data }; return rows[index]; }
        if (kind !== 'dishes' && args.where.id === 1) throw dbError('P2003');
        return rows.splice(index, 1)[0];
      };
    }
  }
});
beforeEach(() => {
  state = {
    dishes: dishes.map(row => ({ ...row, price: new Prisma.Decimal(row.price), ingredients: row.ingredients.map(item => ({ ...item, quantity: new Prisma.Decimal(item.quantity) })) })),
    chefs: chefs.map(row => ({ ...row })),
    ingredients: ingredients.map(row => ({ ...row })),
  };
  calls = [];
  fault = undefined;
});
after(() => prisma.$disconnect());

test('all 15 endpoints: CRUD, read after writes and successful deletion use HTTP 200 JSON', async () => {
  for (const kind of resources) {
    const list = await request(app).get(`/api/${kind}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.ok, true);
    assert.ok(Array.isArray(list.body.data));
    const created = await request(app).post(`/api/${kind}`).send({ ...samples[kind], id: 999, admin: true, createdAt: 'fake' });
    assert.equal(created.status, 200);
    assert.equal(created.body.ok, true);
    const row = created.body.data;
    assert.notEqual(row.id, 999);
    assert.equal(row.admin, undefined);
    assert.equal(row.createdAt, undefined);
    const detail = await request(app).get(`/api/${kind}/${row.id}`);
    assert.equal(detail.body.data.name, samples[kind].name);
    const updated = await request(app).patch(`/api/${kind}/${row.id}`).send({ name: 'Đã sửa' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.name, 'Đã sửa');
    assert.equal((await request(app).get(`/api/${kind}/${row.id}`)).body.data.name, 'Đã sửa');
    const deleted = await request(app).delete(`/api/${kind}/${row.id}`);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body, { ok: true, data: null });
    assert.equal((await request(app).get(`/api/${kind}/${row.id}`)).body.error.code, 'NOT_FOUND');
  }
});

test('search trims q, uses case-insensitive Prisma query and returns empty data array', async () => {
  const r = await request(app).get('/api/dishes').query({ q: '  BÚN  ' });
  assert.equal(r.body.data.length, 2);
  assert.deepEqual(calls[0].args.where, { name: { contains: 'BÚN', mode: 'insensitive' } });
  assert.ok(calls[0].args.include.chef);
  assert.deepEqual((await request(app).get('/api/dishes?q=NO_MATCH')).body, { ok: true, data: [] });
  for (const query of ['q=a&q=b', `q=${'x'.repeat(161)}`]) {
    assert.equal((await request(app).get(`/api/dishes?${query}`)).body.error.code, 'VALIDATION_FAILED');
  }
});

test('serialize Decimal price and recipe quantity as numbers, with resolved imageUrl', async () => {
  const r = await request(app).get('/api/dishes/1');
  assert.equal(typeof r.body.data.price, 'number');
  assert.equal(typeof r.body.data.ingredients[0].quantity, 'number');
  assert.equal(r.body.data.imageUrl, '/images/beef.png');
  process.env.SUPABASE_URL = 'https://storage.example.test';
  state.dishes[0].imagePath = 'seed/a b.png';
  const storage = await request(app).get('/api/dishes/1');
  assert.equal(storage.body.data.imageUrl, 'https://storage.example.test/storage/v1/object/public/dish-images/seed/a%20b.png');
  delete process.env.SUPABASE_URL;
});

test('price accepts zero and rejects missing, null, empty string, strings, negatives and decimals', async () => {
  for (const price of [-1, 0.5, null, '', '0', true, undefined]) {
    const r = await request(app).post('/api/dishes').send({ ...samples.dishes, price });
    assert.equal(r.status, 200);
    assert.equal(r.body.error.code, 'VALIDATION_FAILED');
    assert.ok(r.body.error.fields.price);
  }
  const r = await request(app).post('/api/dishes').send(samples.dishes);
  assert.equal(r.body.data.price, 0);
  assert.equal(r.body.data.available, false);
  assert.equal(r.body.data.imagePath, '/images/beef.png');
});

test('PATCH preserves omitted image, chef, recipe, availability and bio; whitelist strips nested writes', async () => {
  const original = { ...state.dishes[0] };
  const r = await request(app).patch('/api/dishes/1').send({ name: 'Tên mới', id: 9, imagePath: 'evil', ingredients: { deleteMany: {} }, chef: { delete: true } });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.data.chefId, original.chefId);
  assert.equal(r.body.data.imagePath, original.imagePath);
  assert.equal(r.body.data.available, original.available);
  assert.equal(r.body.data.ingredients.length, original.ingredients.length);
  assert.deepEqual(calls.find(call => call.op === 'update')?.args.data, { name: 'Tên mới' });
  const bio = state.chefs[0].bio;
  const chef = await request(app).patch('/api/chefs/1').send({ specialty: 'Mới' });
  assert.equal(chef.body.data.bio, bio);
  const zero = await request(app).patch('/api/dishes/1').send({ price: 0, available: false });
  assert.equal(zero.body.data.price, 0);
  assert.equal(zero.body.data.available, false);
});

test('create defaults are not applied to PATCH; boolean type and chef references validated', async () => {
  const { available, ...dish } = samples.dishes;
  assert.equal((await request(app).post('/api/dishes').send(dish)).body.data.available, true);
  const { bio, ...chef } = samples.chefs;
  assert.equal((await request(app).post('/api/chefs').send(chef)).body.data.bio, '');
  for (const available of ['false', 0, null]) {
    assert.ok((await request(app).patch('/api/dishes/1').send({ available })).body.error.fields.available);
  }
  assert.ok((await request(app).patch('/api/dishes/1').send({ chefId: 999 })).body.error.fields.chefId);
});

test('invalid bodies, empty patches, required text and unknown-only patches are business validation', async () => {
  for (const kind of resources) {
    for (const body of [null, [], 5, {}, { id: 123 }, { name: ' ' }]) {
      const r = await request(app).patch(`/api/${kind}/1`).send(JSON.stringify(body)).set('Content-Type', 'application/json');
      assert.equal(r.status, 200);
      assert.equal(r.body.error.code, 'VALIDATION_FAILED');
      assert.ok(Object.keys(r.body.error.fields).length);
    }
    assert.equal((await request(app).post(`/api/${kind}`).send({})).body.error.code, 'VALIDATION_FAILED');
  }
  assert.equal(calls.some(call => ['update', 'create', 'delete'].includes(call.op)), false);
});

test('invalid and nonexistent IDs return business NOT_FOUND for GET/PATCH/DELETE', async () => {
  for (const kind of resources) for (const id of ['0', '-1', 'abc', '1.2', '01', '2147483648', '9999']) {
    for (const method of ['get', 'patch', 'delete'] as const) {
      const req = request(app)[method](`/api/${kind}/${id}`);
      const r = await (method === 'patch' ? req.send({ name: 'Mới' }) : req);
      assert.equal(r.status, 200);
      assert.equal(r.body.error.code, 'NOT_FOUND', `${method} ${kind}/${id}`);
    }
  }
});

test('unique and foreign-key failures are business validation; missing delete maps P2025', async () => {
  const duplicate = await request(app).post('/api/ingredients').send({ name: ingredients[0].name, unit: 'g' });
  assert.equal(duplicate.status, 200);
  assert.ok(duplicate.body.error.fields.name);
  for (const kind of ['chefs', 'ingredients']) {
    const blocked = await request(app).delete(`/api/${kind}/1`);
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.error.code, 'VALIDATION_FAILED');
  }
});

test('technical 404/400/500 use JSON without business envelope and keep CORS headers', async () => {
  const origin = 'http://localhost:5173';
  const missing = await request(app).get('/api/no-resource').set('Origin', origin);
  const malformed = await request(app).post('/api/dishes').set('Origin', origin).set('Content-Type', 'application/json').send('{');
  fault = new Error('postgresql://secret:password@db/private');
  const broken = await request(app).get('/api/dishes').set('Origin', origin);
  for (const [response, status] of [[missing, 404], [malformed, 400], [broken, 500]] as const) {
    assert.equal(response.status, status);
    assert.match(response.headers['content-type'], /application\/json/);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.equal(response.body.ok, undefined);
    assert.equal(response.body.error, undefined);
    assert.doesNotMatch(response.text, /password|postgresql|private|<html/i);
  }
});

test('CORS preflight allows exact SPA origin, JSON and required methods only', async () => {
  const r = await request(app).options('/api/dishes/1').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'PATCH').set('Access-Control-Request-Headers', 'content-type');
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.match(r.headers['access-control-allow-methods'], /GET, POST, PATCH, DELETE, OPTIONS/);
  assert.equal(r.headers['access-control-allow-headers'], 'Content-Type');
  assert.match(r.headers.vary, /Origin/);
  const loopback = 'http://127.0.0.1:5173';
  const localPreflight = await request(app).options('/api/dishes/1').set('Origin', loopback).set('Access-Control-Request-Method', 'PATCH').set('Access-Control-Request-Headers', 'content-type');
  assert.equal(localPreflight.status, 204);
  assert.equal(localPreflight.headers['access-control-allow-origin'], loopback);
  assert.equal((await request(app).get('/api/dishes').set('Origin', loopback)).headers['access-control-allow-origin'], loopback);
  assert.equal((await request(app).get('/api/unknown').set('Origin', loopback)).headers['access-control-allow-origin'], loopback);
  for (const origin of ['http://localhost:5174', 'https://evil.test', 'http://localhost:5173.evil.test']) {
    assert.equal((await request(app).get('/api/dishes').set('Origin', origin)).headers['access-control-allow-origin'], undefined);
    assert.equal((await request(app).options('/api/dishes').set('Origin', origin)).headers['access-control-allow-origin'], undefined);
  }
});

test('GET does not write; SSR URLs and unsupported methods never redirect/render', async () => {
  await request(app).get('/api/dishes');
  await request(app).get('/api/dishes/1');
  assert.equal(calls.some(call => ['update', 'create', 'delete'].includes(call.op)), false);
  for (const path of ['/admin/login', '/dishes', '/api/dishes/1/edit']) {
    const r = await request(app).get(path);
    assert.equal(r.status, 404);
    assert.equal(r.headers.location, undefined);
    assert.match(r.headers['content-type'], /application\/json/);
  }
  assert.equal((await request(app).put('/api/dishes/1').send({ name: 'Mới' })).status, 404);
});
