import { Prisma } from '@prisma/client';
import { prisma, imageUrl } from '../db.js';
import type { Kind } from '../validation.js';

export class BusinessError extends Error {
  constructor(public code: 'NOT_FOUND' | 'VALIDATION_FAILED', message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}
const chefInclude = { specialties: { include: { specialty: true } } };
const include = { chef: { include: chefInclude }, ingredients: { include: { ingredient: true } } };
// Model selection preserves the shared CRUD flow from Block5.
function model(kind: Kind): any {
  return kind === 'dishes' ? prisma.dish : kind === 'chefs' ? prisma.chef : prisma.ingredient;
}
const relations = (kind: Kind) => kind === 'dishes' ? { include }
  : kind === 'chefs' ? { include: chefInclude } : {};
export async function listSpecialties() {
  return prisma.specialty.findMany({ orderBy: { name: 'asc' } });
}

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
  let values: Record<string, unknown> = { ...data };
  if (kind === 'chefs') {
    const { specialtyIds, ...chefValues } = data;
    values = chefValues;
    if (specialtyIds !== undefined) {
      const ids = specialtyIds as number[];
      const existing = await prisma.specialty.count({ where: { id: { in: ids } } });
      if (existing !== ids.length) {
        throw new BusinessError('VALIDATION_FAILED', 'Có chuyên môn không tồn tại.', { specialtyIds: 'Vui lòng chọn chuyên môn trong danh mục.' });
      }
      const selected = ids.map(specialtyId => ({ specialty: { connect: { id: specialtyId } } }));
      values.specialties = id === undefined ? { create: selected } : { deleteMany: {}, create: selected };
    }
  }
  if (kind === 'dishes' && data.ingredients !== undefined) {
    const recipe = data.ingredients as { ingredientId: number; quantity: number }[];
    const ingredientCount = await prisma.ingredient.count({ where: { id: { in: recipe.map(item => item.ingredientId) } } });
    if (ingredientCount !== recipe.length) {
      throw new BusinessError('VALIDATION_FAILED', 'Có nguyên liệu không tồn tại.', { ingredients: 'Vui lòng chọn nguyên liệu trong danh sách.' });
    }
    const { ingredients: _ingredients, ...dishValues } = values;
    const selected = recipe.map(item => ({ quantity: item.quantity, ingredient: { connect: { id: item.ingredientId } } }));
    values = { ...dishValues, ingredients: id === undefined ? { create: selected } : { deleteMany: {}, create: selected } };
  }
  // Missing PATCH fields stay untouched. Dish recipes are replaced only when ingredients is provided.
  if (kind === 'dishes' && id === undefined) values = { ...values, imagePath: '/images/beef.png' };
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
    const serialized = Object.fromEntries(Object.entries(row).map(([key, item]) => [key, serialize(item)]));
    if (Array.isArray(row.specialties)) {
      serialized.specialties = row.specialties.map(item => {
        if (item && typeof item === 'object' && 'specialty' in item) {
          return serialize((item as { specialty: unknown }).specialty);
        }
        return serialize(item);
      });
    }
    return {
      ...serialized,
      ...(typeof row.imagePath === 'string' ? { imageUrl: imageUrl(row.imagePath) } : {}),
    };
  }
  return value;
}
