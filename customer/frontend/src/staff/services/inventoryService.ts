import { normalizeError } from '@/lib/errors';
import { mapInventoryCategoryRow, mapInventoryItemRow, mapInventoryMovementRow, mapInventoryRecipeLineRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import type { InventoryCategory, InventoryItem, InventoryMovement, InventoryMovementType, InventoryRecipeLine } from '@/types/inventory';

const asTrimmed = (value: string | null | undefined) => String(value ?? '').trim();
const hasPetKeyword = (value: string | null | undefined) => asTrimmed(value).toLowerCase().includes('pet');
const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;
const isMissingInventoryExtension = (error: unknown) => {
  const record = error as { code?: unknown; message?: unknown };
  const code = String(record?.code ?? '').toLowerCase();
  const message = String(record?.message ?? '').toLowerCase();
  return code === '42p01' || code === '42703' || message.includes('does not exist') || message.includes('column');
};
const isOptionalInventoryReadBlocked = (error: unknown) => {
  const record = error as { code?: unknown; message?: unknown; status?: unknown };
  const code = String(record?.code ?? '').toLowerCase();
  const message = String(record?.message ?? '').toLowerCase();
  const status = Number(record?.status ?? 0);
  return (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('rls')
  );
};
const canSkipOptionalInventoryRead = (error: unknown) => isMissingInventoryExtension(error) || isOptionalInventoryReadBlocked(error);

const migrationMessage =
  'Inventory production tables are not ready yet. Run supabase/inventory_production_migration.sql, then try again.';

const requirePositiveQuantity = (quantity: number, label = 'Quantity') => {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
};

const quantityDeltaForMovement = (movementType: InventoryMovementType, quantity: number) => {
  if (movementType === 'stock_in' || movementType === 'production') return roundQuantity(quantity);
  return -roundQuantity(quantity);
};

const buildBasicItemPayload = (item: InventoryItem) => ({
  category_id: asTrimmed(item.categoryId),
  name: asTrimmed(item.name),
  unit: asTrimmed(item.unit) || 'pcs',
  quantity_on_hand: Number.isFinite(item.quantityOnHand) ? roundQuantity(item.quantityOnHand) : 0,
  reorder_level: Number.isFinite(item.reorderLevel) ? roundQuantity(item.reorderLevel) : 0,
  display_quantity: asTrimmed(item.displayQuantity) || null,
  notes: asTrimmed(item.notes) || null,
  is_active: item.isActive,
});

const buildExtendedItemPayload = (item: InventoryItem) => ({
  ...buildBasicItemPayload(item),
  item_type: item.itemType === 'finished_product' ? 'finished_product' : 'raw_material',
  recipe_yield_quantity: Number.isFinite(item.recipeYieldQuantity) && item.recipeYieldQuantity > 0 ? roundQuantity(item.recipeYieldQuantity) : 1,
});

export const inventoryService = {
  async listCategories(): Promise<InventoryCategory[]> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('inventory_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load inventory categories.' });
    return (Array.isArray(data) ? data : [])
      .map(mapInventoryCategoryRow)
      .filter((row) => row.isActive !== false && !hasPetKeyword(row.name));
  },

  async saveCategory(category: InventoryCategory): Promise<InventoryCategory> {
    const supabase = requireSupabaseClient();
    const payload = {
      name: asTrimmed(category.name),
      sort_order: Number.isFinite(category.sortOrder) ? category.sortOrder : 0,
      is_active: category.isActive,
    };

    if (category.id) {
      const { data, error } = await supabase.from('inventory_categories').update(payload).eq('id', category.id).select('*').single();
      if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save inventory category.' });
      return mapInventoryCategoryRow(data);
    }

    const { data, error } = await supabase.from('inventory_categories').insert(payload).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to create inventory category.' });
    return mapInventoryCategoryRow(data);
  },

  async deleteCategory(id: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('inventory_categories').delete().eq('id', id);
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to delete inventory category.' });
  },

  async listItems(): Promise<InventoryItem[]> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .order('category_id', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load inventory items.' });
    return (Array.isArray(data) ? data : [])
      .map(mapInventoryItemRow)
      .filter((row) => row.isActive !== false && !hasPetKeyword(row.name));
  },

  async saveItem(item: InventoryItem): Promise<InventoryItem> {
    const supabase = requireSupabaseClient();
    const payload = buildExtendedItemPayload(item);

    if (item.id) {
      let { data, error } = await supabase.from('inventory_items').update(payload).eq('id', item.id).select('*').single();
      if (error && isMissingInventoryExtension(error)) {
        const retry = await supabase.from('inventory_items').update(buildBasicItemPayload(item)).eq('id', item.id).select('*').single();
        data = retry.data;
        error = retry.error;
      }
      if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save inventory item.' });
      return mapInventoryItemRow(data);
    }

    let { data, error } = await supabase.from('inventory_items').insert(payload).select('*').single();
    if (error && isMissingInventoryExtension(error)) {
      const retry = await supabase.from('inventory_items').insert(buildBasicItemPayload(item)).select('*').single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to create inventory item.' });
    return mapInventoryItemRow(data);
  },

  async deleteItem(id: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to delete inventory item.' });
  },

  async listRecipeLines(): Promise<InventoryRecipeLine[]> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('inventory_recipe_lines')
      .select('*')
      .order('finished_item_id', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (canSkipOptionalInventoryRead(error)) return [];
      throw normalizeError(error, { fallbackMessage: 'Unable to load inventory recipes.' });
    }
    return (Array.isArray(data) ? data : []).map(mapInventoryRecipeLineRow);
  },

  async saveRecipeLine(line: InventoryRecipeLine): Promise<InventoryRecipeLine> {
    const supabase = requireSupabaseClient();
    requirePositiveQuantity(line.quantityRequired, 'Raw material quantity');
    const payload = {
      finished_item_id: asTrimmed(line.finishedItemId),
      raw_item_id: asTrimmed(line.rawItemId),
      quantity_required: roundQuantity(line.quantityRequired),
      unit: asTrimmed(line.unit) || null,
    };

    const result = line.id
      ? await supabase.from('inventory_recipe_lines').update(payload).eq('id', line.id).select('*').single()
      : await supabase.from('inventory_recipe_lines').insert(payload).select('*').single();

    if (result.error) {
      if (isMissingInventoryExtension(result.error)) throw new Error(migrationMessage);
      throw normalizeError(result.error, { fallbackMessage: 'Unable to save recipe line.' });
    }
    return mapInventoryRecipeLineRow(result.data);
  },

  async deleteRecipeLine(id: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('inventory_recipe_lines').delete().eq('id', id);
    if (error) {
      if (isMissingInventoryExtension(error)) throw new Error(migrationMessage);
      throw normalizeError(error, { fallbackMessage: 'Unable to delete recipe line.' });
    }
  },

  async listMovements(limit = 10): Promise<InventoryMovement[]> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('inventory_stock_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(100, Math.floor(limit))));

    if (error) {
      if (canSkipOptionalInventoryRead(error)) return [];
      throw normalizeError(error, { fallbackMessage: 'Unable to load inventory movement log.' });
    }
    return (Array.isArray(data) ? data : []).map(mapInventoryMovementRow);
  },

  async recordMovement(params: {
    itemId: string;
    movementType: InventoryMovementType;
    quantityDelta: number;
    quantityBefore: number;
    quantityAfter: number;
    reason?: string | null;
    referenceId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<InventoryMovement | null> {
    const supabase = requireSupabaseClient();
    const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const { data, error } = await supabase
      .from('inventory_stock_movements')
      .insert({
        inventory_item_id: params.itemId,
        movement_type: params.movementType,
        quantity_delta: roundQuantity(params.quantityDelta),
        quantity_before: roundQuantity(params.quantityBefore),
        quantity_after: roundQuantity(params.quantityAfter),
        reason: asTrimmed(params.reason) || null,
        reference_id: asTrimmed(params.referenceId) || null,
        metadata: params.metadata ?? null,
        created_by: userData?.user?.id ?? null,
      })
      .select('*')
      .single();

    if (error) {
      if (isMissingInventoryExtension(error)) return null;
      throw normalizeError(error, { fallbackMessage: 'Unable to write inventory movement log.' });
    }
    return mapInventoryMovementRow(data);
  },

  async adjustStock(params: {
    item: InventoryItem;
    movementType: Exclude<InventoryMovementType, 'production'>;
    quantity: number;
    reason?: string | null;
  }): Promise<InventoryItem> {
    requirePositiveQuantity(params.quantity);
    if (params.movementType === 'waste' && !asTrimmed(params.reason)) {
      throw new Error('Waste reason is required.');
    }

    const quantityDelta = quantityDeltaForMovement(params.movementType, params.quantity);
    const nextQuantity = roundQuantity(params.item.quantityOnHand + quantityDelta);
    if (nextQuantity < 0) {
      throw new Error('Invalid stock deduction. Quantity on hand is not enough.');
    }

    const saved = await this.saveItem({
      ...params.item,
      quantityOnHand: nextQuantity,
      displayQuantity: String(nextQuantity),
    });

    await this.recordMovement({
      itemId: saved.id,
      movementType: params.movementType,
      quantityDelta,
      quantityBefore: params.item.quantityOnHand,
      quantityAfter: saved.quantityOnHand,
      reason: params.reason,
      metadata: { source: 'manual_adjustment' },
    });

    return saved;
  },

  async produceFinishedProduct(params: {
    finishedItem: InventoryItem;
    quantity: number;
    items: InventoryItem[];
    recipeLines: InventoryRecipeLine[];
    reason?: string | null;
  }): Promise<InventoryItem[]> {
    requirePositiveQuantity(params.quantity, 'Production quantity');
    if (params.finishedItem.itemType !== 'finished_product') {
      throw new Error('Select a finished product to produce.');
    }

    const recipe = params.recipeLines.filter((line) => line.finishedItemId === params.finishedItem.id);
    if (!recipe.length) {
      throw new Error('Add at least one raw material recipe line before production.');
    }

    const itemById = new Map(params.items.map((item) => [item.id, item]));
    const deductions = recipe.map((line) => {
      const rawItem = itemById.get(line.rawItemId);
      if (!rawItem) {
        throw new Error('A recipe raw material is missing from inventory.');
      }
      const requiredQuantity = roundQuantity(line.quantityRequired * params.quantity);
      if (requiredQuantity <= 0) {
        throw new Error('Recipe quantity must be greater than zero.');
      }
      if (rawItem.quantityOnHand < requiredQuantity) {
        throw new Error(`${rawItem.name} is insufficient. Needed ${requiredQuantity} ${rawItem.unit}, available ${rawItem.quantityOnHand} ${rawItem.unit}.`);
      }
      return { line, rawItem, requiredQuantity };
    });

    const referenceId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `production-${Date.now().toString(36)}`;
    const savedItems: InventoryItem[] = [];

    for (const deduction of deductions) {
      const nextQuantity = roundQuantity(deduction.rawItem.quantityOnHand - deduction.requiredQuantity);
      const savedRaw = await this.saveItem({
        ...deduction.rawItem,
        quantityOnHand: nextQuantity,
        displayQuantity: String(nextQuantity),
      });
      savedItems.push(savedRaw);
      await this.recordMovement({
        itemId: savedRaw.id,
        movementType: 'production',
        quantityDelta: -deduction.requiredQuantity,
        quantityBefore: deduction.rawItem.quantityOnHand,
        quantityAfter: savedRaw.quantityOnHand,
        reason: params.reason || `Produced ${params.quantity} ${params.finishedItem.unit} ${params.finishedItem.name}`,
        referenceId,
        metadata: {
          finishedItemId: params.finishedItem.id,
          finishedItemName: params.finishedItem.name,
          producedQuantity: params.quantity,
          recipeLineId: deduction.line.id,
        },
      });
    }

    const nextFinishedQuantity = roundQuantity(params.finishedItem.quantityOnHand + params.quantity);
    const savedFinished = await this.saveItem({
      ...params.finishedItem,
      quantityOnHand: nextFinishedQuantity,
      displayQuantity: String(nextFinishedQuantity),
    });
    savedItems.push(savedFinished);
    await this.recordMovement({
      itemId: savedFinished.id,
      movementType: 'production',
      quantityDelta: params.quantity,
      quantityBefore: params.finishedItem.quantityOnHand,
      quantityAfter: savedFinished.quantityOnHand,
      reason: params.reason || 'Finished product produced from raw materials.',
      referenceId,
      metadata: {
        finishedItemId: params.finishedItem.id,
        finishedItemName: params.finishedItem.name,
        producedQuantity: params.quantity,
        rawMaterials: deductions.map((deduction) => ({
          itemId: deduction.rawItem.id,
          itemName: deduction.rawItem.name,
          quantity: deduction.requiredQuantity,
          unit: deduction.rawItem.unit,
        })),
      },
    });

    return savedItems;
  },
};
