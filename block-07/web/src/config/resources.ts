import type { Dish, DishIngredientDraft, Draft, Entity, FieldErrors, Resource } from '../types';

export const categories = ['Khai vị', 'Món chính', 'Món chay', 'Tráng miệng'];
export interface Field {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'multi-select';
  maxLength?: number;
}
interface ResourceConfig {
  label: string;
  singular: string;
  icon: string;
  fields: Field[];
  columns: { key: string; label: string }[];
}
export const resources: Record<Resource, ResourceConfig> = {
  dishes: {
    label: 'Món ăn', singular: 'món ăn', icon: '◫',
    columns: [{ key: 'category', label: 'Danh mục' }, { key: 'price', label: 'Giá / phần' }, { key: 'available', label: 'Trạng thái' }],
    fields: [
      { name: 'name', label: 'Tên món ăn', type: 'text', maxLength: 160 },
      { name: 'description', label: 'Mô tả', type: 'textarea', maxLength: 5000 },
      { name: 'price', label: 'Giá (VNĐ)', type: 'number' },
      { name: 'category', label: 'Danh mục', type: 'select' },
      { name: 'chefId', label: 'Đầu bếp', type: 'select' },
      { name: 'ingredients', label: 'Nguyên liệu', type: 'multi-select' },
      { name: 'available', label: 'Đang phục vụ món ăn này', type: 'checkbox' },
    ],
  },
  chefs: {
    label: 'Đầu bếp', singular: 'đầu bếp', icon: '♧',
    columns: [{ key: 'specialties', label: 'Chuyên môn' }],
    fields: [{ name: 'name', label: 'Tên đầu bếp', type: 'text', maxLength: 120 }, { name: 'specialtyIds', label: 'Chuyên môn', type: 'multi-select' }],
  },
  ingredients: {
    label: 'Nguyên liệu', singular: 'nguyên liệu', icon: '❋',
    columns: [{ key: 'unit', label: 'Đơn vị' }],
    fields: [{ name: 'name', label: 'Tên nguyên liệu', type: 'text', maxLength: 120 }, { name: 'unit', label: 'Đơn vị', type: 'text', maxLength: 30 }],
  },
};

export function isResource(value: string | undefined): value is Resource {
  return value !== undefined && Object.hasOwn(resources, value);
}
export function validId(value: string | undefined): boolean {
  return !!value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}
export const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

const seedImages = new Set(['beef.png', 'dessert.png', 'fish.png', 'fresh-rolls.png', 'mango.png', 'mushroom.png', 'rolls.png', 'tofu.png']);
export function imageSource(value?: string, imagePath?: string): string {
  // Block5 seed files are also bundled locally; avoid waiting for Storage for these copies.
  const seedName = imagePath?.match(/^(?:seed\/|\/images\/)([^/]+)$/)?.[1];
  if (seedName && seedImages.has(seedName)) return `/images/${seedName}`;
  if (value?.startsWith('/images/') || /^https?:\/\//i.test(value || '')) return value!;
  return '/images/beef.png';
}

export function createDraft(resource: Resource, item?: Entity): Draft {
  const source = (item || {}) as unknown as Record<string, unknown>;
  return Object.fromEntries(resources[resource].fields.map(field => {
    const fallback = field.type === 'checkbox' ? true : field.name === 'category' ? categories[0] : '';
    const value = field.name === 'specialtyIds'
      ? Array.isArray(source.specialties) ? source.specialties.map((item: { id: number }) => item.id) : []
      : field.name === 'ingredients'
        ? Array.isArray(source.ingredients)
          ? (source.ingredients as NonNullable<Dish['ingredients']>).map(item => ({
            ingredientId: item.ingredientId ?? item.ingredient?.id ?? 0,
            quantity: String(item.quantity),
          })).filter(item => item.ingredientId > 0)
          : []
      : source[field.name] ?? fallback;
    return [field.name, field.type === 'checkbox' ? value === true
      : field.type === 'multi-select' && Array.isArray(value) ? value : String(value)];
  }));
}

export function validateDraft(resource: Resource, draft: Draft): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of resources[resource].fields) {
    if (field.type === 'checkbox' || field.type === 'multi-select') continue;
    const value = String(draft[field.name] ?? '').trim();
    if (!value) errors[field.name] = `Vui lòng nhập ${field.label.toLocaleLowerCase('vi')}.`;
    else if (field.maxLength && value.length > field.maxLength) errors[field.name] = `Tối đa ${field.maxLength} ký tự.`;
  }
  if (resource === 'chefs' && (!Array.isArray(draft.specialtyIds) || draft.specialtyIds.length === 0)) {
    errors.specialtyIds = 'Chọn ít nhất một chuyên môn.';
  }
  if (resource === 'dishes') {
    const rawPrice = String(draft.price ?? '').trim();
    if (rawPrice && (!Number.isSafeInteger(Number(rawPrice)) || Number(rawPrice) < 0)) errors.price = 'Giá phải là số nguyên không âm.';
    if (rawPrice && Number(rawPrice) > 999999999) errors.price = 'Giá tối đa 999.999.999đ.';
    if (!validId(String(draft.chefId ?? ''))) errors.chefId = 'Vui lòng chọn đầu bếp hợp lệ.';
    const recipe = draft.ingredients;
    if (!Array.isArray(recipe) || recipe.length === 0) errors.ingredients = 'Chọn ít nhất một nguyên liệu.';
    else if (recipe.some(item => {
      const quantity = Number(item.quantity);
      return !Number.isFinite(quantity) || quantity <= 0 || quantity > 99999999.99 || Math.round(quantity * 100) / 100 !== quantity;
    })) errors.ingredients = 'Nhập định lượng lớn hơn 0, tối đa 2 chữ số thập phân cho từng nguyên liệu.';
  }
  return errors;
}

export function toPayload(resource: Resource, draft: Draft): Record<string, string | number | boolean | number[] | DishIngredientDraft[]> {
  return Object.fromEntries(resources[resource].fields.map(field => {
    const value = draft[field.name];
    return [field.name, field.type === 'checkbox' ? value === true
      : field.type === 'multi-select' ? (Array.isArray(value)
        ? field.name === 'ingredients'
          ? (value as DishIngredientDraft[]).map(item => ({ ingredientId: item.ingredientId, quantity: Number(item.quantity) }))
          : value
        : [])
        : field.name === 'price' || field.name === 'chefId' ? Number(value) : String(value ?? '').trim()];
  }));
}
