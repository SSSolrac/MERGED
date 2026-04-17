import { normalizeError } from '@/lib/errors';
import { mapIngredientRow, mapRecipeLineRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import type { Ingredient, RecipeLine } from '@/types/ingredient';

export const ingredientService = {
  async listIngredients(): Promise<Ingredient[]> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.from('ingredients').select('*').order('code', { ascending: true });
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load ingredients.' });
    return (Array.isArray(data) ? data : []).map(mapIngredientRow).filter((row) => row.isActive !== false);
  },

  async saveIngredient(ingredient: Ingredient): Promise<Ingredient> {
    const supabase = requireSupabaseClient();
    const payload = {
      ...(ingredient.code ? { code: ingredient.code } : {}),
      name: ingredient.name,
      unit: ingredient.unit,
      stock_on_hand: ingredient.stockOnHand,
      reorder_level: ingredient.reorderLevel,
      is_active: ingredient.isActive,
    };

    if (ingredient.id) {
      const { data, error } = await supabase.from('ingredients').update(payload).eq('id', ingredient.id).select('*').single();
      if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save ingredient.' });
      return mapIngredientRow(data);
    }

    const { data, error } = await supabase.from('ingredients').insert(payload).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to create ingredient.' });
    return mapIngredientRow(data);
  },

  async deleteIngredient(id: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('ingredients').delete().eq('id', id);
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to delete ingredient.' });
  },

  async listRecipeLines(menuItemId?: string): Promise<RecipeLine[]> {
    const supabase = requireSupabaseClient();
    const query = supabase.from('menu_item_recipe_lines').select('*').order('id', { ascending: true });
    const { data, error } = menuItemId ? await query.eq('menu_item_id', menuItemId) : await query;
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load recipe lines.' });
    return (Array.isArray(data) ? data : []).map(mapRecipeLineRow);
  },

  async saveRecipeLine(line: RecipeLine): Promise<RecipeLine> {
    const supabase = requireSupabaseClient();
    const payload = {
      menu_item_id: line.menuItemId,
      ingredient_id: line.ingredientId,
      quantity_required: line.quantityRequired,
    };

    if (line.id) {
      const { data, error } = await supabase.from('menu_item_recipe_lines').update(payload).eq('id', line.id).select('*').single();
      if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save recipe line.' });
      return mapRecipeLineRow(data);
    }

    const { data, error } = await supabase.from('menu_item_recipe_lines').insert(payload).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to create recipe line.' });
    return mapRecipeLineRow(data);
  },

  async deleteRecipeLine(id: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('menu_item_recipe_lines').delete().eq('id', id);
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to delete recipe line.' });
  },
};
