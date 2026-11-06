import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { categories } from '../data.js';
import { prisma } from '../db.js';
import { BusinessError } from './resources.js';

const numberParam = (fallback: number, max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(max)).default(String(fallback));
const priceParam = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(999999999)).optional();
const schema = z.object({
  mode: z.enum(['basic', 'advanced', 'fulltext', 'fuzzy']).default('basic'), q: z.string().trim().max(160).default(''),
  category: z.string().refine(c => categories.includes(c), 'Danh mục không hợp lệ.').optional(),
  minPrice: priceParam, maxPrice: priceParam, available: z.enum(['true', 'false']).optional(),
  sort: z.enum(['name_asc', 'name_desc', 'price_asc', 'price_desc', 'relevance']).default('name_asc'),
  page: numberParam(1, 1000000), pageSize: numberParam(12, 100),
}).refine(v => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, { path: ['maxPrice'], message: 'Giá từ không được lớn hơn giá đến.' });
export type DishSearch = z.infer<typeof schema>;
export function parseDishSearch(input: unknown): DishSearch {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] || 'query')] = issue.message;
    throw new BusinessError('VALIDATION_FAILED', 'Điều kiện tìm kiếm không hợp lệ.', fields);
  }
  return parsed.data;
}
export function buildDishQueries(q: DishSearch) {
  const conditions: Prisma.Sql[] = [];
  const ranked = q.q !== '' && ['fulltext', 'fuzzy'].includes(q.mode);
  const name = Prisma.sql`public.b7_normalize(d.name)`;
  const keyword = Prisma.sql`public.b7_normalize(${q.q})`;
  const document = Prisma.sql`to_tsvector('simple', public.b7_normalize(coalesce(d.name, '') || ' ' || coalesce(d.description, '')))`;
  const textQuery = Prisma.sql`websearch_to_tsquery('simple', ${keyword})`;
  if (q.q) {
    if (q.mode === 'fulltext') conditions.push(Prisma.sql`${document} @@ ${textQuery}`);
    else if (q.mode === 'fuzzy') conditions.push(Prisma.sql`similarity(${name}, ${keyword}) >= 0.3`);
    else conditions.push(Prisma.sql`${name} LIKE public.b7_normalize(${`%${q.q.replace(/[!%_]/g, '!$&')}%`}) ESCAPE '!'`);
  }
  if (q.category !== undefined) conditions.push(Prisma.sql`d.category = ${q.category}`);
  if (q.minPrice !== undefined) conditions.push(Prisma.sql`d.price >= ${q.minPrice}`);
  if (q.maxPrice !== undefined) conditions.push(Prisma.sql`d.price <= ${q.maxPrice}`);
  if (q.available !== undefined) conditions.push(Prisma.sql`d.available = ${q.available === 'true'}`);
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  const sort = {
    name_asc: Prisma.sql`d.name ASC, d.id ASC`, name_desc: Prisma.sql`d.name DESC, d.id ASC`,
    price_asc: Prisma.sql`d.price ASC, d.id ASC`, price_desc: Prisma.sql`d.price DESC, d.id ASC`, relevance: Prisma.sql`d.name ASC, d.id ASC`,
  }[q.sort];
  const order = ranked ? q.mode === 'fulltext' ? Prisma.sql`ts_rank(${document}, ${textQuery}) DESC, d.id ASC` : Prisma.sql`similarity(${name}, ${keyword}) DESC, d.id ASC` : sort;
  return {
    count: Prisma.sql`SELECT count(*)::int AS total FROM "Dish" d ${where}`,
    items: Prisma.sql`SELECT d.*, row_to_json(c) AS chef FROM "Dish" d LEFT JOIN "Chef" c ON c.id = d."chefId" ${where} ORDER BY ${order} LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
  };
}
export async function searchDishes(q: DishSearch) {
  const sql = buildDishQueries(q);
  return prisma.$transaction(async tx => {
    // Supabase can install pg_trgm in extensions; ordinary PostgreSQL uses public.
    await tx.$executeRaw`SET LOCAL search_path TO public, extensions`;
    const [count] = await tx.$queryRaw<{ total: number }[]>(sql.count);
    const items = await tx.$queryRaw(sql.items);
    return { items, total: count.total, page: q.page, pageSize: q.pageSize };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 15000, timeout: 15000 });
}
