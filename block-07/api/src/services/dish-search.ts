import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import type { DishListQuery } from '../validation.js';

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
      filters.push(Prisma.sql`GREATEST(similarity(public.search_unaccent("Dish"."name"), public.search_unaccent(${query.q})), ${ingredientSimilarity(query.q)}) >= 0.3`);
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
