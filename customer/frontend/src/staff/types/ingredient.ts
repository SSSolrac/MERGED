export type IngredientUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs';

export type Ingredient = {
  id: string;
  code: string;
  name: string;
  unit: IngredientUnit;
  stockOnHand: number;
  reorderLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RecipeLine = {
  id: string;
  menuItemId: string;
  ingredientId: string;
  quantityRequired: number;
};
