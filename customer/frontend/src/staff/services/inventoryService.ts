import { normalizeError } from '@/lib/errors';
import { mapInventoryCategoryRow, mapInventoryItemRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import type { InventoryCategory, InventoryItem } from '@/types/inventory';

const asTrimmed = (value: string | null | undefined) => String(value ?? '').trim();
const hasPetKeyword = (value: string | null | undefined) => asTrimmed(value).toLowerCase().includes('pet');

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
    const payload = {
      category_id: asTrimmed(item.categoryId),
      name: asTrimmed(item.name),
      unit: asTrimmed(item.unit) || 'pcs',
      quantity_on_hand: Number.isFinite(item.quantityOnHand) ? item.quantityOnHand : 0,
      reorder_level: Number.isFinite(item.reorderLevel) ? item.reorderLevel : 0,
      display_quantity: asTrimmed(item.displayQuantity) || null,
      notes: asTrimmed(item.notes) || null,
      is_active: item.isActive,
    };

    if (item.id) {
      const { data, error } = await supabase.from('inventory_items').update(payload).eq('id', item.id).select('*').single();
      if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save inventory item.' });
      return mapInventoryItemRow(data);
    }

    const { data, error } = await supabase.from('inventory_items').insert(payload).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to create inventory item.' });
    return mapInventoryItemRow(data);
  },

  async deleteItem(id: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to delete inventory item.' });
  },
};
