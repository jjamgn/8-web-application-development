import { z } from 'zod';
import { categories } from './data.js';

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
