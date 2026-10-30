import type { Dish } from '../types';
import type { DishPage, DishQuery } from './dishes';

// The seeded backend returns an array; newer backends return a paginated object.
export function paginateLegacyDishes(rows: Dish[], query: DishQuery): DishPage {
  const items = rows.filter(dish =>
    (!query.category || dish.category === query.category) &&
    (!query.available || dish.available === (query.available === 'true')) &&
    (!query.minPrice || dish.price >= Number(query.minPrice)) &&
    (!query.maxPrice || dish.price <= Number(query.maxPrice)));
  const direction = query.sort.endsWith('desc') ? -1 : 1;
  items.sort((a, b) => (query.sort.startsWith('price') ? a.price - b.price : a.name.localeCompare(b.name, 'vi')) * direction || a.id - b.id);
  const start = (query.page - 1) * query.pageSize;
  return { items: items.slice(start, start + query.pageSize), total: items.length, page: query.page, pageSize: query.pageSize };
}
