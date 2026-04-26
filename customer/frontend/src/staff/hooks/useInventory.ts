import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '@/lib/errors';
import { getSupabaseClient } from '@/lib/supabase';
import { inventoryService } from '@/services/inventoryService';
import type { InventoryCategory, InventoryItem, InventoryMovement, InventoryMovementType, InventoryRecipeLine } from '@/types/inventory';

export const useInventory = () => {
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [recipeLines, setRecipeLines] = useState<InventoryRecipeLine[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [nextCategories, nextItems] = await Promise.all([
        inventoryService.listCategories(),
        inventoryService.listItems(),
      ]);
      const visibleCategoryIds = new Set(nextCategories.map((category) => category.id));
      const visibleItems = nextItems.filter((item) => visibleCategoryIds.has(item.categoryId));
      setCategories(nextCategories);
      setItems(visibleItems);

      const [recipeResult, movementResult] = await Promise.allSettled([
        inventoryService.listRecipeLines(),
        inventoryService.listMovements(10),
      ] as const);
      if (recipeResult.status === 'fulfilled') {
        setRecipeLines(recipeResult.value);
      } else {
        console.warn('Inventory recipe table is not readable yet', recipeResult.reason);
        if (!silent) setRecipeLines([]);
      }
      if (movementResult.status === 'fulfilled') {
        setMovements(movementResult.value);
      } else {
        console.warn('Inventory movement log is not readable yet', movementResult.reason);
        if (!silent) setMovements([]);
      }
    } catch (loadError) {
      console.error('Failed to load inventory', loadError);
      if (!silent) {
        setCategories([]);
        setItems([]);
        setRecipeLines([]);
        setMovements([]);
      }
      setError(getErrorMessage(loadError, 'Unable to load inventory tracker.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const saveCategory = useCallback(async (category: InventoryCategory) => {
    const saved = await inventoryService.saveCategory(category);
    setCategories((rows) => (rows.some((row) => row.id === saved.id) ? rows.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...rows]));
    return saved;
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    await inventoryService.deleteCategory(id);
    setCategories((rows) => rows.filter((row) => row.id !== id));
  }, []);

  const saveItem = useCallback(async (item: InventoryItem) => {
    const saved = await inventoryService.saveItem(item);
    setItems((rows) => (rows.some((row) => row.id === saved.id) ? rows.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...rows]));
    return saved;
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    await inventoryService.deleteItem(id);
    setItems((rows) => rows.filter((row) => row.id !== id));
  }, []);

  const saveRecipeLine = useCallback(async (line: InventoryRecipeLine) => {
    const saved = await inventoryService.saveRecipeLine(line);
    setRecipeLines((rows) => (rows.some((row) => row.id === saved.id) ? rows.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...rows]));
    return saved;
  }, []);

  const deleteRecipeLine = useCallback(async (id: string) => {
    await inventoryService.deleteRecipeLine(id);
    setRecipeLines((rows) => rows.filter((row) => row.id !== id));
  }, []);

  const adjustStock = useCallback(
    async (params: { item: InventoryItem; movementType: Exclude<InventoryMovementType, 'production'>; quantity: number; reason?: string | null }) => {
      const saved = await inventoryService.adjustStock(params);
      setItems((rows) => rows.map((row) => (row.id === saved.id ? saved : row)));
      setMovements(await inventoryService.listMovements(10));
      return saved;
    },
    [],
  );

  const produceFinishedProduct = useCallback(
    async (params: { finishedItem: InventoryItem; quantity: number; reason?: string | null }) => {
      const savedItems = await inventoryService.produceFinishedProduct({
        ...params,
        items,
        recipeLines,
      });
      setItems((rows) => {
        const savedById = new Map(savedItems.map((item) => [item.id, item]));
        return rows.map((row) => savedById.get(row.id) ?? row);
      });
      setMovements(await inventoryService.listMovements(10));
      return savedItems;
    },
    [items, recipeLines],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const queueRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void load({ silent: true });
      }, 180);
    };

    const channelName = `inventory-live-updates-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_categories' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_recipe_lines' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock_movements' }, queueRefresh)
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  return {
    categories,
    items,
    recipeLines,
    movements,
    loading,
    error,
    saveCategory,
    deleteCategory,
    saveItem,
    deleteItem,
    saveRecipeLine,
    deleteRecipeLine,
    adjustStock,
    produceFinishedProduct,
    refresh: () => load(),
  };
};
