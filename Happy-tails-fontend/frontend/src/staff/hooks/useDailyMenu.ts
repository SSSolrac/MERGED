import { useCallback, useEffect, useState } from 'react';
import { dailyMenuService } from '@/services/dailyMenuService';
import { getErrorMessage } from '@/lib/errors';
import type { DailyMenu } from '@/types/dailyMenu';

export const useDailyMenu = () => {
  const [menuDate, setMenuDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [menu, setMenu] = useState<DailyMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setMenu(await dailyMenuService.getDailyMenu(menuDate));
    } catch (loadError) {
      console.error('Failed to load daily menu', loadError);
      setError(getErrorMessage(loadError, 'Unable to load daily menu.'));
    } finally {
      setLoading(false);
    }
  }, [menuDate]);

  const saveDraft = useCallback(async (next: DailyMenu) => {
    setSaving(true);
    try {
      const saved = await dailyMenuService.saveDailyMenu(next);
      setMenu(saved);
      return saved;
    } finally {
      setSaving(false);
    }
  }, []);

  const publish = useCallback(async (next: DailyMenu) => {
    setSaving(true);
    try {
      await dailyMenuService.saveDailyMenu(next);
      const saved = await dailyMenuService.publishDailyMenu(next.menuDate);
      setMenu(saved);
      return saved;
    } finally {
      setSaving(false);
    }
  }, []);

  const unpublish = useCallback(async () => {
    setSaving(true);
    try {
      const menuDate = menu?.menuDate ?? new Date().toISOString().slice(0, 10);
      const saved = await dailyMenuService.unpublishDailyMenu(menuDate);
      setMenu(saved);
      return saved;
    } finally {
      setSaving(false);
    }
  }, [menu?.menuDate]);

  const clearMenu = useCallback(async () => {
    setSaving(true);
    try {
      const menuDate = menu?.menuDate ?? new Date().toISOString().slice(0, 10);
      const saved = await dailyMenuService.clearDailyMenu(menuDate);
      setMenu(saved);
      return saved;
    } finally {
      setSaving(false);
    }
  }, [menu?.menuDate]);

  useEffect(() => {
    load();
  }, [load]);

  return { menuDate, setMenuDate, menu, loading, saving, error, saveDraft, publish, unpublish, clearMenu, refresh: load };
};
