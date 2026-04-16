import { normalizeError } from '@/lib/errors';
import { mapMenuCategoryRow, mapMenuItemRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import type { MenuCategory, MenuItem } from '@/types/menuItem';

const MENU_IMAGE_BUCKET = 'menu-images';
const MAX_MENU_IMAGE_BYTES = 5 * 1024 * 1024;

const sanitizeImageFileName = (fileName: string) => {
  const trimmed = fileName.trim().toLowerCase();
  if (!trimmed) return 'menu-item-image';
  return trimmed
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const getImageExtension = (fileName: string) => {
  const parts = fileName.split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1]?.trim() : '';
  if (!ext) return 'jpg';
  return ext.replace(/[^a-z0-9]/gi, '') || 'jpg';
};

export const menuService = {
  async getMenuCategories(): Promise<MenuCategory[]> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.from('menu_categories').select('*').order('sort_order', { ascending: true });
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load menu categories.' });
    return (Array.isArray(data) ? data : []).map(mapMenuCategoryRow).filter((row) => row.isActive !== false);
  },

  async saveMenuCategory(category: MenuCategory): Promise<MenuCategory> {
    const supabase = requireSupabaseClient();
    const payload = {
      name: category.name,
      description: category.description == null ? null : category.description.trim() || null,
      sort_order: category.sortOrder,
      is_active: category.isActive,
    };

    if (category.id) {
      const { data, error } = await supabase.from('menu_categories').update(payload).eq('id', category.id).select('*').single();
      if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save menu category.' });
      return mapMenuCategoryRow(data);
    }

    const { data, error } = await supabase.from('menu_categories').insert(payload).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to create menu category.' });
    return mapMenuCategoryRow(data);
  },

  async deleteMenuCategory(categoryId: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('menu_categories').delete().eq('id', categoryId);
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to delete menu category.' });
  },

  async getMenuItems(): Promise<MenuItem[]> {
    const supabase = requireSupabaseClient();
    const view = await supabase
      .from('menu_item_effective_availability')
      .select('id, code, category_id, name, description, price, discount, is_available, effective_is_available, image_url, created_at, updated_at')
      .order('name', { ascending: true });
    if (!view.error) return (Array.isArray(view.data) ? view.data : []).map(mapMenuItemRow);

    const { data, error } = await supabase.from('menu_items').select('*').order('name', { ascending: true });
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load menu items.' });
    return (Array.isArray(data) ? data : []).map(mapMenuItemRow);
  },

  async saveMenuItem(item: MenuItem): Promise<MenuItem> {
    const supabase = requireSupabaseClient();
    const payload = {
      category_id: item.categoryId || null,
      name: item.name,
      description: item.description || null,
      price: item.price,
      discount: item.discount,
      is_available: item.isAvailable,
      image_url: item.imageUrl || null,
    };

    if (item.id) {
      const { data, error } = await supabase.from('menu_items').update(payload).eq('id', item.id).select('*').single();
      if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save menu item.' });
      return mapMenuItemRow(data);
    }

    const { data, error } = await supabase.from('menu_items').insert(payload).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to create menu item.' });
    return mapMenuItemRow(data);
  },

  async uploadMenuItemImage(file: File): Promise<string> {
    if (!file) throw new Error('Select an image file before uploading.');
    if (!file.type || !file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
    if (file.size > MAX_MENU_IMAGE_BYTES) throw new Error('Image must be 5 MB or smaller.');

    const supabase = requireSupabaseClient();
    const safeName = sanitizeImageFileName(file.name || 'menu-item-image');
    const extension = getImageExtension(safeName);
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    const path = `menu-items/${Date.now()}-${randomSuffix}.${extension}`;

    const { error } = await supabase.storage.from(MENU_IMAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('bucket') && message.includes('not found')) {
        throw new Error('Storage bucket "menu-images" is missing. Create it in Supabase or use an image URL instead.');
      }
      throw normalizeError(error, { fallbackMessage: 'Unable to upload menu image.' });
    }

    const { data } = supabase.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('Image uploaded, but public URL could not be generated.');
    return data.publicUrl;
  },

  async deleteMenuItem(itemId: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('menu_items').delete().eq('id', itemId);
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to delete menu item.' });
  },
};
