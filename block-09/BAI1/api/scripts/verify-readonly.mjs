// Temporary HTTP listener in this process; closes on completion. Never seeds or writes records.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../src/app.ts';
import { prisma } from '../src/db.ts';

const server = app.listen(0, '127.0.0.1');
try {
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}/api`;
  const origin = process.env.SPA_ORIGIN || 'http://localhost:5173';
  async function get(path) {
    const response = await fetch(`${base}${path}`, { headers: { Origin: origin }, signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200, `Unexpected HTTP status for ${path}`);
    assert.equal(response.headers.get('access-control-allow-origin'), origin, 'CORS origin mismatch');
    const body = await response.json();
    assert.equal(body.ok, true, `Business error for ${path}: ${body.error?.code || 'UNKNOWN'}`);
    return body.data;
  }
  const first = await get('/dishes?page=1&pageSize=12');
  assert.ok(Array.isArray(first.items));
  assert.ok(first.total >= first.items.length);
  assert.equal(first.page, 1);
  console.log(JSON.stringify({ check: 'pagination + CORS', total: first.total, returned: first.items.length, result: 'PASS' }));
  if (first.total > 12) {
    const second = await get('/dishes?page=2&pageSize=12');
    assert.equal(second.total, first.total);
    const seen = new Set(first.items.map(item => item.id));
    assert.ok(second.items.every(item => !seen.has(item.id)));
    console.log(JSON.stringify({ check: 'page 2 without duplicate IDs', result: 'PASS' }));
  }
  for (const path of ['/chefs', '/ingredients']) {
    const items = await get(path);
    assert.ok(Array.isArray(items));
    console.log(JSON.stringify({ check: path, count: items.length, result: 'PASS' }));
  }
  if (first.items.length) {
    const q = encodeURIComponent(first.items[0].name);
    for (const mode of ['basic', 'advanced', 'fulltext', 'fuzzy']) {
      const found = await get(`/dishes?mode=${mode}&q=${q}`);
      assert.ok(found.total > 0, `${mode} must match an existing exact name`);
      console.log(JSON.stringify({ check: mode, matches: found.total, result: 'PASS' }));
    }
  }
} catch (error) {
  console.error(JSON.stringify({ result: 'FAIL', type: error.name, message: error instanceof assert.AssertionError ? error.message : 'Không thể hoàn tất kiểm tra API. Kiểm tra cấu hình và kết nối.' }));
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
