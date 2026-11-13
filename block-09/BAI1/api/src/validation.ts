import { z } from 'zod';
import { categories } from './data.js';

const queryInteger = (minimum: number, maximum: number) => z.preprocess(value => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return value;
  return Number(value);
}, z.number().int().min(minimum).max(maximum));

const dishListQuerySchema = z.object({
  mode: z.enum(['basic', 'advanced', 'fulltext', 'fuzzy']).default('basic'),
  q: z.string().trim().max(160, 'Từ khóa tối đa 160 ký tự.').optional().transform(value => value || undefined),
  category: z.string().trim().min(1, 'Danh mục không được để trống.').max(60).optional(),
  minPrice: queryInteger(0, 999999999).optional(),
  maxPrice: queryInteger(0, 999999999).optional(),
  available: z.enum(['true', 'false']).optional().transform(value => value === undefined ? undefined : value === 'true'),
  sort: z.enum(['name_asc', 'name_desc', 'price_asc', 'price_desc']).optional(),
  page: queryInteger(1, 2147483647).default(1),
  pageSize: queryInteger(1, 100).default(12),
}).strict().superRefine((value, context) => {
  if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
    context.addIssue({ code: 'custom', path: ['minPrice'], message: 'Giá tối thiểu không được lớn hơn giá tối đa.' });
  }
  if ((value.mode === 'fulltext' || value.mode === 'fuzzy') && !value.q) {
    context.addIssue({ code: 'custom', path: ['q'], message: 'Chế độ tìm kiếm này yêu cầu từ khóa q.' });
  }
});

export type DishListQuery = z.infer<typeof dishListQuerySchema>;
export function parseDishListQuery(value: unknown) {
  return dishListQuerySchema.safeParse(value);
}

const text = (max: number) => z.string().trim().min(1, 'Vui lòng nhập thông tin.').max(max, `Tối đa ${max} ký tự.`);
const dish = z.object({
  name: text(160),
  description: text(5000),
  price: z.number().int('Giá phải là số nguyên.').min(0, 'Giá phải >= 0.').max(999999999),
  category: z.string().refine(value => categories.includes(value), 'Danh mục không hợp lệ.'),
  available: z.boolean(),
  chefId: z.number().int().positive().max(2147483647),
});
const chef = z.object({ name: text(120), specialty: text(200), bio: z.string().trim().max(3000) });
const ingredient = z.object({ name: text(120), unit: text(30) });

// Zod strips unknown keys: IDs, timestamps and nested relations cannot be written.
export const createSchemas = {
  dishes: dish.extend({ available: z.boolean().default(true) }),
  chefs: chef.extend({ bio: z.string().trim().max(3000).default('') }),
  ingredients: ingredient,
};
export const patchSchemas = {
  dishes: dish.partial(),
  chefs: chef.partial(),
  ingredients: ingredient.partial(),
};
export type Kind = keyof typeof createSchemas;
export function validId(raw: string) {
  const id = Number(raw);
  return /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
