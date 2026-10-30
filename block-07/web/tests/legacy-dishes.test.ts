import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateLegacyDishes } from '../src/lib/legacyDishPage';
import type { Dish } from '../src/types';
import type { DishQuery } from '../src/lib/dishes';

const query: DishQuery = { mode: 'auto', q: '', category: '', minPrice: '', maxPrice: '', available: '', sort: 'price_asc', page: 1, pageSize: 2 };
const rows = [
  { id: 1, name: 'Món C', price: 20000, category: 'Món chính', available: true },
  { id: 2, name: 'Món A', price: 0, category: 'Món chay', available: false },
  { id: 3, name: 'Món B', price: 10000, category: 'Món chay', available: false },
] as Dish[];
test('legacy arrays preserve filtering, zero prices and false availability', () => {
  const result = paginateLegacyDishes(rows, { ...query, category: 'Món chay', minPrice: '0', maxPrice: '10000', available: 'false' });
  assert.deepEqual(result.items.map(row => row.id), [2, 3]);
  assert.equal(result.total, 2);
});
test('legacy pagination sorts before slicing and leaves the input unchanged', () => {
  const result = paginateLegacyDishes(rows, { ...query, page: 2 });
  assert.deepEqual(result.items.map(row => row.id), [1]);
  assert.equal(result.total, 3);
  assert.deepEqual(rows.map(row => row.id), [1, 2, 3]);
});
