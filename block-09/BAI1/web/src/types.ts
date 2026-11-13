export type Resource = 'dishes' | 'chefs' | 'ingredients';
export interface Chef { id: number; name: string; specialty: string; bio?: string }
export interface Ingredient { id: number; name: string; unit: string }
export interface Dish {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
  chefId: number;
  imageUrl?: string;
  imagePath?: string;
  chef?: Chef;
  ingredients?: { ingredientId?: number; quantity: number | string; ingredient?: Ingredient }[];
}
export type Entity = Dish | Chef | Ingredient;
export type Draft = Record<string, string | boolean>;
export type FieldErrors = Record<string, string>;
export type ErrorKind = 'network' | 'http' | 'response' | 'business';
