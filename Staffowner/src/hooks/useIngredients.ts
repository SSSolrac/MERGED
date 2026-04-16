import { useCallback, useEffect, useState } from 'react';
import { ingredientService } from '@/services/ingredientService';
import { getErrorMessage } from '@/lib/errors';
import type { Ingredient } from '@/types/ingredient';

export const useIngredients = () => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setIngredients(await ingredientService.listIngredients());
    } catch (loadError) {
      console.error('Failed to load ingredients', loadError);
      setIngredients([]);
      setError(getErrorMessage(loadError, 'Unable to load ingredients.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const saveIngredient = useCallback(async (ingredient: Ingredient) => {
    const saved = await ingredientService.saveIngredient(ingredient);
    setIngredients((rows) => rows.some((row) => row.id === saved.id) ? rows.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...rows]);
    return saved;
  }, []);

  const deleteIngredient = useCallback(async (id: string) => {
    await ingredientService.deleteIngredient(id);
    setIngredients((rows) => rows.filter((row) => row.id !== id));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ingredients, loading, error, saveIngredient, deleteIngredient, refresh: load };
};
