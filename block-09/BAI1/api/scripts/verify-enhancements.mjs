import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { app } from '../src/app.ts';
import { prisma } from '../src/db.ts';
const server = app.listen(0, '127.0.0.1');
const results = [];
let ownedId;
let before;
async function check(name, action) { await action(); results.push({ name, result: 'PASS' }); console.log(`PASS ${name}`); }
try {
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, body, method = 'GET') => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
    const json = await res.json(); assert.equal(json.ok, true, JSON.stringify({ path, status: res.status, error: json.error })); return json.data;
  };
  before = await prisma.dish.count();
  let choices;
  await check('Server ingredient pages and search ignore accents while legacy list stays compatible', async () => {
    const first = await call('/ingredients?page=1&pageSize=8');
    const second = await call('/ingredients?page=2&pageSize=8');
    assert.ok(first.total >= first.items.length); assert.equal(first.items.length, 8);
    assert.equal(second.total, first.total); assert.ok(second.items.every(i => !first.items.some(j => j.id === i.id)));
    choices = first.items.slice(0, 2); assert.equal(choices.length, 2);
    const fold = v => v.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
    const name = choices[0].name;
    const [a, b] = await Promise.all([call(`/ingredients?page=1&q=${encodeURIComponent(name)}`), call(`/ingredients?page=1&q=${encodeURIComponent(fold(name))}`)]);
    assert.equal(a.total, b.total); assert.deepEqual(a.items.map(i => i.id), b.items.map(i => i.id));
    assert.ok(Array.isArray(await call('/ingredients')));
  });
  await check('Vietnamese normalization feeds simple tsquery: gỏi mực matches goi muc', async () => {
    const [row] = await prisma.$queryRaw`SELECT public.b7_normalize('GỎI MỰC ĐẬU HŨ') AS normalized, websearch_to_tsquery('simple', public.b7_normalize('goi muc'))::text AS query, to_tsvector('simple', public.b7_normalize('Gỏi mực')) @@ websearch_to_tsquery('simple', public.b7_normalize('goi muc')) AS matches`;
    assert.equal(row.normalized, 'goi muc dau hu'); assert.equal(row.matches, true);
    console.log(JSON.stringify(row));
  });
  const marker = `B7R_${randomUUID().slice(0, 8)} Gỏi mực`;
  await check('Create dish with actual ingredient relations and decimal quantities', async () => {
    const [chef] = await call('/chefs');
    const created = await call('/dishes', { name: marker, description: 'Món kiểm thử nguyên liệu, sẽ được dọn sau lượt chạy.', price: 0, category: 'Khai vị', chefId: chef.id, available: false, ingredients: [{ ingredientId: choices[0].id, quantity: 2.5 }, { ingredientId: choices[1].id, quantity: 100 }] }, 'POST');
    ownedId = created.id;
    assert.equal(created.ingredients.length, 2);
    const record = await call(`/dishes/${ownedId}`); assert.equal(record.ingredients.length, 2);
    assert.ok(record.ingredients.every(r => r.ingredient?.name));
    assert.equal(record.ingredients.find(r => r.ingredientId === choices[0].id).quantity, 2.5);
  });
  await check('All four search modes return identical results with accented/unaccented query', async () => {
    const plain = marker.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd');
    for (const mode of ['basic', 'advanced', 'fulltext', 'fuzzy']) {
      const [a, b] = await Promise.all([call(`/dishes?mode=${mode}&q=${encodeURIComponent(marker)}`), call(`/dishes?mode=${mode}&q=${encodeURIComponent(plain)}`)]);
      assert.equal(a.total, b.total); assert.deepEqual(a.items.map(d => d.id), b.items.map(d => d.id)); assert.ok(a.items.some(d => d.id === ownedId));
    }
  });
  await check('PATCH replaces recipe, omitted recipe preserves it, empty recipe clears it', async () => {
    const changed = await call(`/dishes/${ownedId}`, { ingredients: [{ ingredientId: choices[1].id, quantity: 12.5 }] }, 'PATCH');
    assert.equal(changed.ingredients.length, 1); assert.equal(changed.ingredients[0].quantity, 12.5);
    const kept = await call(`/dishes/${ownedId}`, { description: 'Chỉ sửa mô tả' }, 'PATCH'); assert.equal(kept.ingredients[0].quantity, 12.5);
    const cleared = await call(`/dishes/${ownedId}`, { ingredients: [] }, 'PATCH'); assert.deepEqual(cleared.ingredients, []);
  });
} finally {
  if (ownedId) await prisma.dish.delete({ where: { id: ownedId } });
  const after = await prisma.dish.count();
  await mkdir(new URL('../../docs/evidence/', import.meta.url), { recursive: true });
  await writeFile(new URL('../../docs/evidence/ingredients-live.json', import.meta.url), JSON.stringify({ source: 'real HTTP API and Supabase; only owned test dish is modified and removed', before, after, results, removedOwnedId: ownedId }, null, 2));
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect();
}
