import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { categories } from '../data.js';
import { prisma } from '../db.js';
import type { DishListQuery } from '../validation.js';
import { BusinessError } from './resources.js';

// Keep the original Block 7 query helpers available to its API checks/tools.
const legacyNumberParam = (fallback: number, max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(max)).default(String(fallback));
const legacyPriceParam = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(999999999)).optional();
const legacyDishSearchSchema = z.object({
  mode: z.enum(['basic', 'advanced', 'fulltext', 'fuzzy']).default('basic'), q: z.string().trim().max(160).default(''),
  category: z.string().refine(category => categories.includes(category), 'Danh mục không hợp lệ.').optional(),
  minPrice: legacyPriceParam, maxPrice: legacyPriceParam, available: z.enum(['true', 'false']).optional(),
  sort: z.enum(['name_asc', 'name_desc', 'price_asc', 'price_desc', 'relevance']).default('name_asc'),
  page: legacyNumberParam(1, 1000000), pageSize: legacyNumberParam(12, 100),
}).refine(value => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, {
  path: ['maxPrice'], message: 'Giá từ không được lớn hơn giá đến.',
});
export type DishSearch = z.infer<typeof legacyDishSearchSchema>;
export function parseDishSearch(input: unknown): DishSearch {
  const parsed = legacyDishSearchSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] || 'query')] = issue.message;
    throw new BusinessError('VALIDATION_FAILED', 'Điều kiện tìm kiếm không hợp lệ.', fields);
  }
  return parsed.data;
}
export function buildDishQueries(query: DishSearch) {
  const conditions: Prisma.Sql[] = [];
  const ranked = query.q !== '' && ['fulltext', 'fuzzy'].includes(query.mode);
  const name = Prisma.sql`public.b7_normalize(d.name)`;
  const keyword = Prisma.sql`public.b7_normalize(${query.q})`;
  const document = Prisma.sql`to_tsvector('simple', public.b7_normalize(coalesce(d.name, '') || ' ' || coalesce(d.description, '')))`;
  const textQuery = Prisma.sql`websearch_to_tsquery('simple', ${keyword})`;
  if (query.q) {
    if (query.mode === 'fulltext') conditions.push(Prisma.sql`${document} @@ ${textQuery}`);
    else if (query.mode === 'fuzzy') conditions.push(Prisma.sql`similarity(${name}, ${keyword}) >= 0.3`);
    else conditions.push(Prisma.sql`${name} LIKE public.b7_normalize(${`%${query.q.replace(/[!%_]/g, '!$&')}%`}) ESCAPE '!'`);
  }
  if (query.category !== undefined) conditions.push(Prisma.sql`d.category = ${query.category}`);
  if (query.minPrice !== undefined) conditions.push(Prisma.sql`d.price >= ${query.minPrice}`);
  if (query.maxPrice !== undefined) conditions.push(Prisma.sql`d.price <= ${query.maxPrice}`);
  if (query.available !== undefined) conditions.push(Prisma.sql`d.available = ${query.available === 'true'}`);
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  const sort = {
    name_asc: Prisma.sql`d.name ASC, d.id ASC`, name_desc: Prisma.sql`d.name DESC, d.id ASC`,
    price_asc: Prisma.sql`d.price ASC, d.id ASC`, price_desc: Prisma.sql`d.price DESC, d.id ASC`, relevance: Prisma.sql`d.name ASC, d.id ASC`,
  }[query.sort];
  const order = ranked ? query.mode === 'fulltext' ? Prisma.sql`ts_rank(${document}, ${textQuery}) DESC, d.id ASC` : Prisma.sql`similarity(${name}, ${keyword}) DESC, d.id ASC` : sort;
  return {
    count: Prisma.sql`SELECT count(*)::int AS total FROM "Dish" d ${where}`,
    items: Prisma.sql`SELECT d.*, row_to_json(c) AS chef FROM "Dish" d LEFT JOIN "Chef" c ON c.id = d."chefId" ${where} ORDER BY ${order} LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
  };
}

const dishInclude = {
  chef: { include: { specialties: { include: { specialty: true } } } },
  ingredients: { include: { ingredient: true } },
};

function escapeLike(value: string) {
  // Use ! as the LIKE escape character so user-supplied %, _ and ! are literals.
  return value.replace(/[!%_]/g, '!$&');
}

function ingredientSimilarity(query: string) {
  return Prisma.sql`coalesce((
    SELECT max(similarity(public.search_unaccent(ingredient."name"), public.search_unaccent(${query})))
    FROM "DishIngredient" AS dish_ingredient
    JOIN "Ingredient" AS ingredient ON ingredient."id" = dish_ingredient."ingredientId"
    WHERE dish_ingredient."dishId" = "Dish"."id"
  ), 0.0)`;
}

function sortSql(sort: DishListQuery['sort'], mode: DishListQuery['mode'], q?: string) {
  if (mode === 'fuzzy' && q) {
    return Prisma.sql`GREATEST(similarity(public.search_unaccent("Dish"."name"), public.search_unaccent(${q})), ${ingredientSimilarity(q)}) DESC, "id" ASC`;
  }
  switch (sort) {
    case 'name_asc': return Prisma.sql`"name" ASC, "id" ASC`;
    case 'name_desc': return Prisma.sql`"name" DESC, "id" ASC`;
    case 'price_asc': return Prisma.sql`"price" ASC, "id" ASC`;
    case 'price_desc': return Prisma.sql`"price" DESC, "id" ASC`;
    default: return Prisma.sql`"id" ASC`;
  }
}

export async function searchDishes(query: DishListQuery) {
  const filters: Prisma.Sql[] = [];

  if (query.q) {
    if (query.mode === 'fulltext') {
      filters.push(Prisma.sql`"Dish"."searchVector" @@ plainto_tsquery('simple', public.search_unaccent(${query.q}))`);
    } else if (query.mode === 'fuzzy') {
      filters.push(Prisma.sql`GREATEST(similarity(public.search_unaccent("Dish"."name"), public.search_unaccent(${query.q})), ${ingredientSimilarity(query.q)}) >= 0.4`);
    } else {
      const pattern = `%${escapeLike(query.q)}%`;
      filters.push(Prisma.sql`(
        public.search_unaccent("Dish"."name") ILIKE public.search_unaccent(${pattern}) ESCAPE '!'
        OR public.search_unaccent("Dish"."description") ILIKE public.search_unaccent(${pattern}) ESCAPE '!'
        OR EXISTS (
          SELECT 1
          FROM "DishIngredient" AS dish_ingredient
          JOIN "Ingredient" AS ingredient ON ingredient."id" = dish_ingredient."ingredientId"
          WHERE dish_ingredient."dishId" = "Dish"."id"
            AND public.search_unaccent(ingredient."name") ILIKE public.search_unaccent(${pattern}) ESCAPE '!'
        )
      )`);
    }
  }
  if (query.category !== undefined) filters.push(Prisma.sql`"category" = ${query.category}`);
  if (query.minPrice !== undefined) filters.push(Prisma.sql`"price" >= ${query.minPrice}`);
  if (query.maxPrice !== undefined) filters.push(Prisma.sql`"price" <= ${query.maxPrice}`);
  if (query.available !== undefined) filters.push(Prisma.sql`"available" = ${query.available}`);

  const where = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;
  const orderBy = sortSql(query.sort, query.mode, query.q);
  const offset = (query.page - 1) * query.pageSize;

  const [selected, counted] = await Promise.all([
    prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT "id" FROM "Dish" ${where}
      ORDER BY ${orderBy}
      LIMIT ${query.pageSize} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "total" FROM "Dish" ${where}
    `),
  ]);

  const ids = selected.map(row => row.id);
  const dishes = ids.length
    ? await prisma.dish.findMany({ where: { id: { in: ids } }, include: dishInclude })
    : [];
  const byId = new Map(dishes.map(dish => [dish.id, dish]));
  return {
    items: ids.flatMap(id => {
      const dish = byId.get(id);
      return dish ? [dish] : [];
    }),
    total: counted[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}
