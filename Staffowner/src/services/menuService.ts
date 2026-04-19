import { normalizeError } from '@/lib/errors';
import { mapMenuCategoryRow, mapMenuItemRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import type { MenuCategory, MenuItem } from '@/types/menuItem';

const MENU_IMAGE_BUCKET = 'menu-images';
const MAX_MENU_IMAGE_BYTES = 5 * 1024 * 1024;
const MENU_CATEGORY_VIEW_SELECT = '*';
const MENU_ITEM_VIEW_SELECT =
  'id, code, category_id, name, description, price, cost, discount, discount_type, discount_value, effective_discount, effective_price, is_discount_active, discount_starts_at, discount_ends_at, is_available, effective_is_available, image_url, new_tag_started_at, new_tag_expires_at, is_new, limited_time_ends_at, is_limited, is_limited_expired, category_is_new, created_at, updated_at';

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

const normalizeTimestamp = (value: string | null | undefined) => {
  const text = String(value || '').trim();
  return text || null;
};

const uploadImageAsset = async (file: File, folder: string, fallbackName: string): Promise<string> => {
  if (!file) throw new Error('Select an image file before uploading.');
  if (!file.type || !file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
  if (file.size > MAX_MENU_IMAGE_BYTES) throw new Error('Image must be 5 MB or smaller.');

  const supabase = requireSupabaseClient();
  const safeName = sanitizeImageFileName(file.name || fallbackName);
  const extension = getImageExtension(safeName);
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const path = `${folder}/${Date.now()}-${randomSuffix}.${extension}`;

  const { error } = await supabase.storage.from(MENU_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('bucket') && message.includes('not found')) {
      throw new Error('Storage bucket "menu-images" is missing. Create it in Supabase before uploading images.');
    }
    throw normalizeError(error, { fallbackMessage: 'Unable to upload image.' });
  }

  const { data } = supabase.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Image uploaded, but public URL could not be generated.');
  return data.publicUrl;
};

const fetchMenuCategoryById = async (supabase: ReturnType<typeof requireSupabaseClient>, categoryId: string) => {
  const view = await supabase.from('menu_category_effective_state').select(MENU_CATEGORY_VIEW_SELECT).eq('id', categoryId).maybeSingle();
  if (!view.error && view.data) return mapMenuCategoryRow(view.data);

  const { data, error } = await supabase.from('menu_categories').select('*').eq('id', categoryId).single();
  if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load saved menu category.' });
  return mapMenuCategoryRow(data);
};

const fetchMenuItemById = async (supabase: ReturnType<typeof requireSupabaseClient>, itemId: string) => {
  const view = await supabase.from('menu_item_effective_availability').select(MENU_ITEM_VIEW_SELECT).eq('id', itemId).maybeSingle();
  if (!view.error && view.data) return mapMenuItemRow(view.data);

  const { data, error } = await supabase.from('menu_items').select('*').eq('id', itemId).single();
  if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load saved menu item.' });
  return mapMenuItemRow(data);
};

export const menuService = {
  async getMenuCategories(): Promise<MenuCategory[]> {
    const supabase = requireSupabaseClient();
    const view = await supabase.from('menu_category_effective_state').select(MENU_CATEGORY_VIEW_SELECT).order('sort_order', { ascending: true });
    if (!view.error) return (Array.isArray(view.data) ? view.data : []).map(mapMenuCategoryRow).filter((row) => row.isActive !== false);

    const { data, error } = await supabase.from('menu_categories').select('*').order('sort_order', { ascending: true });
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load menu categories.' });
    return (Array.isArray(data) ? data : []).map(mapMenuCategoryRow).filter((row) => row.isActive !== false);
  },

  async saveMenuCategory(category: MenuCategory): Promise<MenuCategory> {
    const supabase = requireSupabaseClient();
    const payload = {
      name: category.name,
      description: category.description == null ? null : category.description.trim() || null,
      image_url: category.imageUrl || null,
      sort_order: category.sortOrder,
      is_active: category.isActive,
    };

    if (category.id) {
      const { data, error } = await supabase.from('menu_categories').update(payload).eq('id', category.id).select('*').single();
      if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save menu category.' });
      return fetchMenuCategoryById(supabase, String(data.id));
    }

    const { data, error } = await supabase.from('menu_categories').insert(payload).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to create menu category.' });
    if (category.isActive !== false) {
      const { error: tagError } = await supabase
        .from('menu_categories')
        .update({ new_tag_started_at: data.created_at })
        .eq('id', data.id);
      if (tagError) throw normalizeError(tagError, { fallbackMessage: 'Unable to tag the new category.' });
    }
    return fetchMenuCategoryById(supabase, String(data.id));
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
      .select(MENU_ITEM_VIEW_SELECT)
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
      cost: item.cost,
      discount: item.discount,
      discount_type: item.discountType,
      discount_value: item.discountValue,
      discount_starts_at: normalizeTimestamp(item.discountStartsAt),
      discount_ends_at: normalizeTimestamp(item.discountEndsAt),
      limited_time_ends_at: normalizeTimestamp(item.limitedTimeEndsAt),
      is_available: item.isAvailable,
      image_url: item.imageUrl || null,
    };

    if (item.id) {
      const { data, error } = await supabase.from('menu_items').update(payload).eq('id', item.id).select('*').single();
      if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save menu item.' });
      return fetchMenuItemById(supabase, String(data.id));
    }

    const { data, error } = await supabase.from('menu_items').insert(payload).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to create menu item.' });
    if (item.isAvailable !== false) {
      const { error: tagError } = await supabase
        .from('menu_items')
        .update({ new_tag_started_at: data.created_at })
        .eq('id', data.id);
      if (tagError) throw normalizeError(tagError, { fallbackMessage: 'Unable to tag the new menu item.' });
    }
    return fetchMenuItemById(supabase, String(data.id));
  },

  async uploadMenuItemImage(file: File): Promise<string> {
    return uploadImageAsset(file, 'menu-items', 'menu-item-image');
  },

  async uploadMenuCategoryImage(file: File): Promise<string> {
    return uploadImageAsset(file, 'menu-categories', 'menu-category-image');
  },

  async deleteMenuItem(itemId: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('menu_items').delete().eq('id', itemId);
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to delete menu item.' });
  },
};
