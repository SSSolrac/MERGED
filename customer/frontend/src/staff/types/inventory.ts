export type InventoryItemType = 'raw_material' | 'finished_product';
export type InventoryMovementType = 'stock_in' | 'stock_out' | 'waste' | 'production';

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
  itemType: InventoryItemType;
  recipeYieldQuantity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventoryRecipeLine = {
  id: string;
  finishedItemId: string;
  rawItemId: string;
  quantityRequired: number;
  unit: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryMovement = {
  id: string;
  itemId: string;
  movementType: InventoryMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string | null;
  referenceId: string | null;
  metadata: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
};
