import { useCallback, useEffect, useState } from 'react';
import { menuService } from '@/services/menuService';
import { getErrorMessage } from '@/lib/errors';
import type { MenuCategory } from '@/types/menuItem';

export const useMenuCategories = () => {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setCategories(await menuService.getMenuCategories());
    } catch (loadError) {
      console.error('Failed to load menu categories', loadError);
      setError(getErrorMessage(loadError, 'Unable to load menu categories.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const saveCategory = useCallback(async (category: MenuCategory) => {
    const saved = await menuService.saveMenuCategory(category);
    setCategories((rows) => {
      const exists = rows.some((row) => row.id === saved.id);
      return exists ? rows.map((row) => (row.id === saved.id ? saved : row)) : [...rows, saved].sort((a, b) => a.sortOrder - b.sortOrder);
    });
    return saved;
  }, []);

  const deleteCategory = useCallback(async (categoryId: string) => {
    await menuService.deleteMenuCategory(categoryId);
    setCategories((rows) => rows.filter((row) => row.id !== categoryId));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { categories, loading, error, saveCategory, deleteCategory, refresh: load };
};
