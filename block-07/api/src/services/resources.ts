import { Prisma } from '@prisma/client';
import { prisma, imageUrl } from '../db.js';
import type { Kind } from '../validation.js';

export class BusinessError extends Error {
  constructor(public code: 'NOT_FOUND' | 'VALIDATION_FAILED', message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}
const include = { chef: true, ingredients: { include: { ingredient: true } } };
// Model selection preserves the shared CRUD flow from Block5.
function model(kind: Kind): any {
  return kind === 'dishes' ? prisma.dish : kind === 'chefs' ? prisma.chef : prisma.ingredient;
}
const relations = (kind: Kind) => kind === 'dishes' ? { include } : {};

export async function list(kind: Kind, q = '') {
  return model(kind).findMany({
    ...(kind === 'dishes' ? { where: { name: { contains: q, mode: 'insensitive' } } } : {}),
    orderBy: { id: 'asc' }, ...relations(kind),
  });
}
export async function record(kind: Kind, id: number) {
  const row = await model(kind).findUnique({ where: { id }, ...relations(kind) });
  if (!row) throw new BusinessError('NOT_FOUND', 'Không tìm thấy bản ghi.');
  return row;
}
export async function save(kind: Kind, data: Record<string, unknown>, id?: number) {
  if (id !== undefined) await record(kind, id);
  if (kind === 'dishes' && data.chefId !== undefined) {
    const chef = await prisma.chef.findUnique({ where: { id: data.chefId as number } });
    if (!chef) throw new BusinessError('VALIDATION_FAILED', 'Đầu bếp không tồn tại.', { chefId: 'Vui lòng chọn đầu bếp tồn tại.' });
  }
  const { ingredients, ...fields } = data;
  const values: Record<string, unknown> = kind === 'dishes' && id === undefined ? { ...fields, imagePath: fields.imagePath ?? '/images/beef.png' } : fields;
  if (kind === 'dishes' && ingredients !== undefined) {
    const rows = ingredients as { ingredientId: number; quantity: number }[];
    const found = await prisma.ingredient.findMany({ where: { id: { in: rows.map(row => row.ingredientId) } }, select: { id: true } });
    if (found.length !== rows.length) throw new BusinessError('VALIDATION_FAILED', 'Nguyên liệu đã thay đổi. Vui lòng chọn lại.', { ingredients: 'Có nguyên liệu không còn tồn tại.' });
    // Nested Prisma writes are atomic: replace only when the client explicitly sends a recipe.
    values.ingredients = id === undefined ? { create: rows } : { deleteMany: {}, create: rows };
  }
  return id === undefined
    ? model(kind).create({ data: values, ...relations(kind) })
    : model(kind).update({ where: { id }, data: values, ...relations(kind) });
}
export async function remove(kind: Kind, id: number) {
  // No Storage deletion: an image may be shared, and uploads are outside this API.
  await model(kind).delete({ where: { id } });
  return null;
}
export function databaseBusinessError(error: unknown): BusinessError | null {
  // Use Prisma's actual error type; arbitrary system errors must remain HTTP 500.
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (error.code === 'P2025') return new BusinessError('NOT_FOUND', 'Không tìm thấy bản ghi.');
  if (error.code === 'P2002') return new BusinessError('VALIDATION_FAILED', 'Tên này đã tồn tại.', { name: 'Tên này đã tồn tại.' });
  if (error.code === 'P2003') return new BusinessError('VALIDATION_FAILED', 'Dữ liệu đang được sử dụng hoặc bản ghi liên quan đã thay đổi.');
  return null;
}
export function serialize(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return {
      ...Object.fromEntries(Object.entries(row).map(([key, item]) => [key, serialize(item)])),
      ...(typeof row.imagePath === 'string' ? { imageUrl: imageUrl(row.imagePath) } : {}),
    };
  }
  return value;
}
