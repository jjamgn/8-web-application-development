import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { BusinessError } from './resources.js';
const positive = (fallback: number, max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(max)).default(String(fallback));
const schema = z.object({ q: z.string().trim().max(160).default(''), page: positive(1, 1000000), pageSize: positive(12, 100) });
export function parseIngredientSearch(value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new BusinessError('VALIDATION_FAILED', 'Điều kiện tìm nguyên liệu không hợp lệ.', Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0]), issue.message])));
  return result.data;
}
export async function searchIngredients(query: z.infer<typeof schema>) {
  const pattern = `%${query.q.replace(/[!%_]/g, '!$&')}%`;
  const where = query.q ? Prisma.sql`WHERE public.b7_normalize(name) LIKE public.b7_normalize(${pattern}) ESCAPE '!'` : Prisma.empty;
  return prisma.$transaction(async tx => {
    const [count] = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total FROM "Ingredient" ${where}`);
    const items = await tx.$queryRaw(Prisma.sql`SELECT id, name, unit FROM "Ingredient" ${where} ORDER BY name ASC, id ASC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    return { items, total: count.total, page: query.page, pageSize: query.pageSize };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 15000, timeout: 15000 });
}
