import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMenuCatalog } from '../prisma/menu-catalog.js';

test('catalog contains enough distinct recipes to supplement the original menu', () => {
  const rows = buildMenuCatalog();
  assert.ok(rows.length >= 1000);
  assert.equal(new Set(rows.map(row => row.name)).size, rows.length);
  const signatures = rows.map(row => JSON.stringify(row.ingredients.map(item => [item.name, item.quantity, item.unit]).sort()));
  assert.equal(new Set(signatures).size, rows.length, 'Every recipe must have a distinct ingredient/quantity combination');
  for (const row of rows) {
    assert.ok(row.name.length <= 160 && !/Phiên bản|\d{4}/.test(row.name));
    assert.ok(row.description.length > 80 && row.description.length <= 5000);
    assert.ok(row.price >= 1000 && Number.isInteger(row.price));
    assert.ok(row.ingredients.length >= 3);
    assert.equal(new Set(row.ingredients.map(item => item.name)).size, row.ingredients.length);
    assert.ok(row.ingredients.every(item => item.quantity > 0 && ['g', 'ml', 'quả'].includes(item.unit)));
    if (row.category === 'Món chay') assert.ok(row.ingredients.every(item => !/thịt|cá |nước mắm|trứng|gelatin|sa tế$/i.test(item.name)));
  }
  const first992 = rows.slice(0, 992);
  for (const category of ['Món chính', 'Khai vị', 'Món chay', 'Tráng miệng']) assert.equal(first992.filter(row => row.category === category).length, 248);
});
