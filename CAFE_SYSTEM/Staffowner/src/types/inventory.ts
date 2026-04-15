export type InventoryCategory = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventoryItem = {
  id: string;
  code: string;
  categoryId: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  reorderLevel: number;
  displayQuantity: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
