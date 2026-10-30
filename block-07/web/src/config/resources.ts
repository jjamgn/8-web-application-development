import type { Draft, Entity, FieldErrors, Resource } from '../types';

export const categories = ['Khai vị', 'Món chính', 'Món chay', 'Tráng miệng'];
export interface Field {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
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
      { name: 'available', label: 'Đang phục vụ món ăn này', type: 'checkbox' },
    ],
  },
  chefs: {
    label: 'Đầu bếp', singular: 'đầu bếp', icon: '♧',
    columns: [{ key: 'specialty', label: 'Chuyên môn' }],
    fields: [{ name: 'name', label: 'Tên đầu bếp', type: 'text', maxLength: 120 }, { name: 'specialty', label: 'Chuyên môn', type: 'text', maxLength: 200 }],
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

export function imageSource(value?: string): string {
  if (value?.startsWith('/images/') || /^https?:\/\//i.test(value || '')) return value!;
  return '/images/beef.png';
}

export function createDraft(resource: Resource, item?: Entity): Draft {
  const source = (item || {}) as unknown as Record<string, unknown>;
  return Object.fromEntries(resources[resource].fields.map(field => {
    const fallback = field.type === 'checkbox' ? true : field.name === 'category' ? categories[0] : '';
    const value = source[field.name] ?? fallback;
    return [field.name, field.type === 'checkbox' ? value === true : String(value)];
  }));
}

export function validateDraft(resource: Resource, draft: Draft): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of resources[resource].fields) {
    if (field.type === 'checkbox') continue;
    const value = String(draft[field.name] ?? '').trim();
    if (!value) errors[field.name] = `Vui lòng nhập ${field.label.toLocaleLowerCase('vi')}.`;
    else if (field.maxLength && value.length > field.maxLength) errors[field.name] = `Tối đa ${field.maxLength} ký tự.`;
  }
  if (resource === 'dishes') {
    const rawPrice = String(draft.price ?? '').trim();
    if (rawPrice && (!Number.isSafeInteger(Number(rawPrice)) || Number(rawPrice) < 0)) errors.price = 'Giá phải là số nguyên không âm.';
    if (rawPrice && Number(rawPrice) > 999999999) errors.price = 'Giá tối đa 999.999.999đ.';
    if (!validId(String(draft.chefId ?? ''))) errors.chefId = 'Vui lòng chọn đầu bếp hợp lệ.';
  }
  return errors;
}

export function toPayload(resource: Resource, draft: Draft): Record<string, string | number | boolean> {
  return Object.fromEntries(resources[resource].fields.map(field => {
    const value = draft[field.name];
    return [field.name, field.type === 'checkbox' ? value === true
      : field.name === 'price' || field.name === 'chefId' ? Number(value) : String(value ?? '').trim()];
  }));
}
