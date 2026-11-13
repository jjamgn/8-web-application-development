import type { Dish, Ingredient } from '../types';
export type IngredientPage = { items: Ingredient[]; total: number; page: number; pageSize: number };
export type SelectedIngredient = { ingredientId: number; name: string; unit: string; quantity: string };
export function selectedIngredients(dish?: Dish): SelectedIngredient[] {
  return (dish?.ingredients || []).map(row => ({ ingredientId: row.ingredientId ?? row.ingredient!.id, name: row.ingredient?.name || `Nguyên liệu #${row.ingredientId}`, unit: row.ingredient?.unit || '', quantity: String(row.quantity) }));
}
export function recipePayload(rows: SelectedIngredient[]) { return rows.map(row => ({ ingredientId: row.ingredientId, quantity: Number(row.quantity) })); }
export function recipeKey(rows: SelectedIngredient[]) { return JSON.stringify(recipePayload(rows).sort((a, b) => a.ingredientId - b.ingredientId)); }
export function recipeError(rows: SelectedIngredient[]) {
  if (rows.length > 100) return 'Tối đa 100 nguyên liệu cho một món.';
  const invalid = rows.find(row => !/^\d+(?:\.\d{1,2})?$/.test(row.quantity) || Number(row.quantity) <= 0 || Number(row.quantity) > 99999999.99);
  return invalid ? `Số lượng ${invalid.name} phải lớn hơn 0, tối đa 99.999.999,99 và có tối đa 2 chữ số thập phân.` : '';
}
