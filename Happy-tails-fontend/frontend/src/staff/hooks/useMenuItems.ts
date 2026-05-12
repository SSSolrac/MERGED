import { useCallback, useEffect, useState } from 'react';
import { menuService } from '@/services/menuService';
import { getErrorMessage } from '@/lib/errors';
import type { MenuItem } from '@/types/menuItem';

export const useMenuItems = () => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setItems(await menuService.getMenuItems());
    } catch (loadError) {
      console.error('Failed to load menu items', loadError);
      setError(getErrorMessage(loadError, 'Unable to load menu items.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const saveItem = useCallback(async (item: MenuItem) => {
    const saved = await menuService.saveMenuItem(item);
    setItems((rows) => {
      const exists = rows.some((row) => row.id === saved.id);
      return exists ? rows.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...rows];
    });
    return saved;
  }, []);

  const deleteItem = useCallback(async (itemId: string) => {
    await menuService.deleteMenuItem(itemId);
    setItems((rows) => rows.filter((item) => item.id !== itemId));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, error, saveItem, deleteItem, refresh: load };
};
