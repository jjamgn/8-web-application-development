import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { parseDishSearch, buildDishQueries } from '../src/services/dish-search.js';
import { detectImage, uploadDirectory } from '../src/routes/uploads.js';
import { app } from '../src/app.js';
import { imageUrl } from '../src/db.js';

test('query rejects malformed numbers, duplicate params, booleans and inverted prices', () => {
  for (const query of [{ page: '0' }, { page: 'abc' }, { pageSize: '101' }, { minPrice: '-1' }, { available: '0' }, { minPrice: '5', maxPrice: '0' }, { q: ['a', 'b'] }, { mode: 'typo' }]) assert.throws(() => parseDishSearch(query));
});
test('AND query preserves false and zero, escapes wildcards and binds user input', () => {
  const sql = buildDishQueries(parseDishSearch({ q: "a%_' OR 1=1 --", minPrice: '0', maxPrice: '100000', available: 'false', category: 'Món chay', page: '2', sort: 'price_desc' }));
  assert.match(sql.count.sql, /ESCAPE '!'/); assert.match(sql.count.sql, /price >= \?/); assert.match(sql.count.sql, /available = \?/);
  assert.ok(sql.count.values.includes(0)); assert.ok(sql.count.values.includes(false));
  assert.ok(sql.count.values.includes("%a!%!_' OR 1=1 --%"));
  assert.doesNotMatch(sql.count.sql, /OR 1=1|LIMIT/);
  assert.match(sql.items.sql, /price DESC, d.id ASC LIMIT \? OFFSET \?/);
  assert.deepEqual(sql.items.values.slice(-2), [12, 12]);
});
test('fulltext uses simple document and query; fuzzy has 0.3 threshold and stable ranking', () => {
  const fts = buildDishQueries(parseDishSearch({ mode: 'fulltext', q: 'canh rau' }));
  assert.match(fts.items.sql, /to_tsvector\('simple'/); assert.match(fts.items.sql, /websearch_to_tsquery\('simple', public.b7_normalize/);
  assert.match(fts.items.sql, /to_tsvector\('simple', public.b7_normalize/);
  assert.match(fts.items.sql, /ts_rank[\s\S]+DESC, d.id ASC/);
  const fuzzy = buildDishQueries(parseDishSearch({ mode: 'fuzzy', q: 'phoo' }));
  assert.match(fuzzy.count.sql, /similarity\(public.b7_normalize\(d.name\), public.b7_normalize/); assert.match(fuzzy.count.sql, />= 0.3/); assert.match(fuzzy.items.sql, /DESC, d.id ASC/);
});
test('upload persists real PNG and serves it cross-origin, rejects disguised content', async () => {
  const bytes = await readFile(new URL('../public/images/beef.png', import.meta.url));
  assert.equal(detectImage(bytes)?.mime, 'image/png');
  assert.equal(detectImage(Buffer.from('<svg><script/></svg>')), null);
  const uploaded = await request(app).post('/api/uploads/dishes').attach('file', bytes, { filename: 'food.png', contentType: 'image/png' });
  assert.equal(uploaded.body.ok, true, JSON.stringify(uploaded.body));
  const filename = path.basename(uploaded.body.data.imagePath);
  try {
    const served = await request(app).get(`/uploads/${filename}`);
    assert.equal(served.status, 200); assert.equal(served.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.deepEqual(await readFile(path.join(uploadDirectory, filename)), bytes);
  } finally { await unlink(path.join(uploadDirectory, filename)); }
  const bad = await request(app).post('/api/uploads/dishes').attach('file', Buffer.from('not an image'), { filename: 'fake.png', contentType: 'image/png' });
  assert.equal(bad.body.ok, false); assert.ok(bad.body.error.fields.file);
});
test('external HTTPS image is returned unchanged', () => {
  assert.equal(imageUrl('https://images.example/food?width=400'), 'https://images.example/food?width=400');
});
