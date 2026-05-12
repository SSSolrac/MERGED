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
const isMissingRpc = (error: unknown) => {
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = String(record?.code ?? '').toLowerCase();
  const message = `${String(record?.message ?? '')} ${String(record?.details ?? '')}`.toLowerCase();
  return code === 'pgrst202' || message.includes('could not find the function') || message.includes('function') && message.includes('does not exist');
};
const isLegacyMovementConstraint = (error: unknown) => {
  const record = error as { code?: unknown; message?: unknown };
  const code = String(record?.code ?? '').toLowerCase();
  const message = String(record?.message ?? '').toLowerCase();
  return code === '23514' || message.includes('inventory_stock_movements_movement_type') || message.includes('check constraint');
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

const legacyMovementTypeForDelta = (quantityDelta: number): InventoryMovementType => (quantityDelta >= 0 ? 'stock_in' : 'stock_out');

const parseRpcPayload = (value: unknown) => {
  if (!value || typeof value !== 'object') return {} as Record<string, unknown>;
  return value as Record<string, unknown>;
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
      .order('name', { ascending: true })
      .limit(500);

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
      .order('name', { ascending: true })
      .limit(1000);

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
      .order('created_at', { ascending: true })
      .limit(2000);

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
    reversalOfMovementId?: string | null;
  }): Promise<InventoryMovement | null> {
    const supabase = requireSupabaseClient();
    const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const buildPayload = (movementType: InventoryMovementType, includeReversal = true) => ({
      inventory_item_id: params.itemId,
      movement_type: movementType,
      quantity_delta: roundQuantity(params.quantityDelta),
      quantity_before: roundQuantity(params.quantityBefore),
      quantity_after: roundQuantity(params.quantityAfter),
      reason: asTrimmed(params.reason) || null,
      reference_id: asTrimmed(params.referenceId) || null,
      metadata: params.metadata ?? null,
      created_by: userData?.user?.id ?? null,
      ...(includeReversal && params.reversalOfMovementId ? { reversal_of_movement_id: params.reversalOfMovementId } : {}),
    });

    let { data, error } = await supabase
      .from('inventory_stock_movements')
      .insert(buildPayload(params.movementType))
      .select('*')
      .single();

    if (error && params.reversalOfMovementId && isMissingInventoryExtension(error)) {
      const retry = await supabase.from('inventory_stock_movements').insert(buildPayload(params.movementType, false)).select('*').single();
      data = retry.data;
      error = retry.error;
    }

    if (error && (params.movementType === 'correction' || params.movementType === 'undo') && isLegacyMovementConstraint(error)) {
      const retry = await supabase
        .from('inventory_stock_movements')
        .insert(buildPayload(legacyMovementTypeForDelta(params.quantityDelta), false))
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (isMissingInventoryExtension(error)) return null;
      throw normalizeError(error, { fallbackMessage: 'Unable to write inventory movement log.' });
    }
    return mapInventoryMovementRow(data);
  },

  async applyStockMovement(params: {
    itemId: string;
    movementType: InventoryMovementType;
    quantityDelta: number;
    reason?: string | null;
    referenceId?: string | null;
    metadata?: Record<string, unknown> | null;
    reversalOfMovementId?: string | null;
  }): Promise<{ item: InventoryItem; movement: InventoryMovement | null } | null> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.rpc('apply_inventory_stock_movement', {
      p_inventory_item_id: params.itemId,
      p_movement_type: params.movementType,
      p_quantity_delta: roundQuantity(params.quantityDelta),
      p_reason: asTrimmed(params.reason) || null,
      p_reference_id: asTrimmed(params.referenceId) || null,
      p_metadata: params.metadata ?? {},
      p_reversal_of_movement_id: params.reversalOfMovementId || null,
    });

    if (error) {
      if (isMissingRpc(error) || isMissingInventoryExtension(error)) return null;
      throw normalizeError(error, { fallbackMessage: 'Unable to apply inventory movement.' });
    }

    const payload = parseRpcPayload(data);
    const itemPayload = payload.item ?? payload.inventory_item ?? payload.inventoryItem;
    if (!itemPayload) return null;
    return {
      item: mapInventoryItemRow(itemPayload),
      movement: payload.movement ? mapInventoryMovementRow(payload.movement) : null,
    };
  },

  async adjustStock(params: {
    item: InventoryItem;
    movementType: Exclude<InventoryMovementType, 'production' | 'correction' | 'undo'>;
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

    const rpcResult = await this.applyStockMovement({
      itemId: params.item.id,
      movementType: params.movementType,
      quantityDelta,
      reason: params.reason,
      metadata: { source: 'manual_adjustment' },
    });
    if (rpcResult) return rpcResult.item;

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

    const referenceId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `production-${Date.now().toString(36)}`;
    const supabase = requireSupabaseClient();
    const rpcProduction = await supabase.rpc('produce_inventory_finished_product', {
      p_finished_item_id: params.finishedItem.id,
      p_quantity: roundQuantity(params.quantity),
      p_reason: asTrimmed(params.reason) || null,
      p_reference_id: referenceId,
    });
    if (!rpcProduction.error) {
      const payload = parseRpcPayload(rpcProduction.data);
      const items = Array.isArray(payload.items) ? payload.items.map(mapInventoryItemRow) : [];
      if (items.length) return items;
    } else if (!isMissingRpc(rpcProduction.error) && !isMissingInventoryExtension(rpcProduction.error)) {
      throw normalizeError(rpcProduction.error, { fallbackMessage: 'Unable to produce finished product.' });
    }

    const recipeMultiplier = params.quantity / Math.max(1, params.finishedItem.recipeYieldQuantity || 1);
    const itemById = new Map(params.items.map((item) => [item.id, item]));
    const deductions = recipe.map((line) => {
      const rawItem = itemById.get(line.rawItemId);
      if (!rawItem) {
        throw new Error('A recipe raw material is missing from inventory.');
      }
      const requiredQuantity = roundQuantity(line.quantityRequired * recipeMultiplier);
      if (requiredQuantity <= 0) {
        throw new Error('Recipe quantity must be greater than zero.');
      }
      if (rawItem.quantityOnHand < requiredQuantity) {
        throw new Error(`${rawItem.name} is insufficient. Needed ${requiredQuantity} ${rawItem.unit}, available ${rawItem.quantityOnHand} ${rawItem.unit}.`);
      }
      return { line, rawItem, requiredQuantity };
    });

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

  async listMovementsByReference(referenceId: string): Promise<InventoryMovement[]> {
    const cleanReferenceId = asTrimmed(referenceId);
    if (!cleanReferenceId) return [];
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('inventory_stock_movements')
      .select('*')
      .eq('reference_id', cleanReferenceId)
      .order('created_at', { ascending: true });

    if (error) {
      if (canSkipOptionalInventoryRead(error)) return [];
      throw normalizeError(error, { fallbackMessage: 'Unable to load related inventory movements.' });
    }
    return (Array.isArray(data) ? data : []).map(mapInventoryMovementRow);
  },

  async correctStock(params: { item: InventoryItem; actualQuantity: number; reason: string }): Promise<InventoryItem> {
    if (!Number.isFinite(params.actualQuantity) || params.actualQuantity < 0) {
      throw new Error('Actual quantity must be zero or higher.');
    }
    if (!asTrimmed(params.reason)) {
      throw new Error('Correction reason is required.');
    }

    const nextQuantity = roundQuantity(params.actualQuantity);
    const quantityDelta = roundQuantity(nextQuantity - params.item.quantityOnHand);
    if (quantityDelta === 0) {
      throw new Error(`${params.item.name} already matches the entered count.`);
    }

    const rpcResult = await this.applyStockMovement({
      itemId: params.item.id,
      movementType: 'correction',
      quantityDelta,
      reason: params.reason,
      metadata: {
        source: 'owner_correction',
        previousQuantity: params.item.quantityOnHand,
        correctedQuantity: nextQuantity,
      },
    });
    if (rpcResult) return rpcResult.item;

    const saved = await this.saveItem({
      ...params.item,
      quantityOnHand: nextQuantity,
      displayQuantity: String(nextQuantity),
    });

    await this.recordMovement({
      itemId: saved.id,
      movementType: 'correction',
      quantityDelta,
      quantityBefore: params.item.quantityOnHand,
      quantityAfter: saved.quantityOnHand,
      reason: params.reason,
      metadata: {
        source: 'owner_correction',
        previousQuantity: params.item.quantityOnHand,
        correctedQuantity: nextQuantity,
      },
    });

    return saved;
  },

  async undoMovement(params: { movement: InventoryMovement; reason: string }): Promise<InventoryItem[]> {
    if (!asTrimmed(params.reason)) {
      throw new Error('Undo reason is required.');
    }
    if (params.movement.movementType === 'undo') {
      throw new Error('Undo entries cannot be undone from this screen.');
    }
    if (params.movement.reversedByMovementId || params.movement.voidedAt) {
      throw new Error('This movement has already been undone.');
    }

    const group =
      params.movement.referenceId && params.movement.movementType === 'production'
        ? await this.listMovementsByReference(params.movement.referenceId)
        : [params.movement];
    const targets = group.filter((movement) => movement.movementType !== 'undo' && !movement.reversedByMovementId && !movement.voidedAt);
    if (!targets.length) {
      throw new Error('No undoable movement was found.');
    }

    const orderedTargets = [...targets].sort((left, right) => {
      const leftUndoDelta = -left.quantityDelta;
      const rightUndoDelta = -right.quantityDelta;
      if (leftUndoDelta < 0 && rightUndoDelta >= 0) return -1;
      if (leftUndoDelta >= 0 && rightUndoDelta < 0) return 1;
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });

    const savedItems: InventoryItem[] = [];
    for (const movement of orderedTargets) {
      const undoDelta = roundQuantity(-movement.quantityDelta);
      const rpcResult = await this.applyStockMovement({
        itemId: movement.itemId,
        movementType: 'undo',
        quantityDelta: undoDelta,
        reason: params.reason,
        referenceId: movement.referenceId,
        reversalOfMovementId: movement.id,
        metadata: {
          source: 'owner_undo',
          originalMovementId: movement.id,
          originalMovementType: movement.movementType,
        },
      });

      if (rpcResult) {
        savedItems.push(rpcResult.item);
        if (rpcResult.movement?.id) {
          const supabase = requireSupabaseClient();
          await supabase
            .from('inventory_stock_movements')
            .update({
              reversed_by_movement_id: rpcResult.movement.id,
              voided_at: new Date().toISOString(),
              void_reason: params.reason,
            })
            .eq('id', movement.id);
        }
        continue;
      }

      const current = await this.listItems().then((rows) => rows.find((item) => item.id === movement.itemId));
      if (!current) throw new Error('Inventory item for this movement no longer exists.');
      const nextQuantity = roundQuantity(current.quantityOnHand + undoDelta);
      if (nextQuantity < 0) {
        throw new Error(`Undo would make ${current.name} negative. Correct the count instead.`);
      }
      const saved = await this.saveItem({
        ...current,
        quantityOnHand: nextQuantity,
        displayQuantity: String(nextQuantity),
      });
      savedItems.push(saved);
      await this.recordMovement({
        itemId: saved.id,
        movementType: 'undo',
        quantityDelta: undoDelta,
        quantityBefore: current.quantityOnHand,
        quantityAfter: saved.quantityOnHand,
        reason: params.reason,
        referenceId: movement.referenceId,
        reversalOfMovementId: movement.id,
        metadata: {
          source: 'owner_undo',
          originalMovementId: movement.id,
          originalMovementType: movement.movementType,
        },
      });
    }

    return savedItems;
  },
};
