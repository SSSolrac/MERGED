import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";

const MENU_CACHE_TTL_MS = 15000;
let menuCategoriesCache = { ts: 0, data: null };
let menuItemsCache = { ts: 0, data: null };

function asNonEmptyText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function isUuid(value) {
  const text = asNonEmptyText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
}

function asDbError(error, fallback, options) {
  return asSupabaseError(error, {
    fallbackMessage: fallback || "Database request failed.",
    ...options,
  });
}

function isCacheFresh(entry) {
  return Array.isArray(entry?.data) && Date.now() - Number(entry?.ts || 0) < MENU_CACHE_TTL_MS;
}

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function normalizeMenuImageUrl(value) {
  const text = asNonEmptyText(value);
  if (!text) return null;
  if (text.startsWith("/") || text.startsWith("data:image/")) return text;

  try {
    const parsed = new URL(text);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return text;
    return null;
  } catch {
    return null;
  }
}

function mapMenuCategoryRow(row) {
  const sortOrder = row.sort_order ?? row.sortOrder ?? 0;
  const isActive = row.is_active ?? row.isActive ?? true;
  const description = asNonEmptyText(row.description);
  return {
    id: String(row.id),
    name: row.name ?? "",
    description: description || null,
    sortOrder: Number(sortOrder ?? 0),
    isActive,
  };
}

function mapMenuItemRow(row) {
  // Canonical schema: menu_items.category_id is a UUID FK to menu_categories.id (never a name/label).
  const rawCategoryId = asNonEmptyText(row.category_id);
  const categoryId = isUuid(rawCategoryId) ? rawCategoryId : "";

  const isAvailable =
    row.effective_is_available ??
    row.effectiveIsAvailable ??
    row.is_effectively_available ??
    row.isEffectivelyAvailable ??
    row.is_available ??
    row.isAvailable ??
    true;

  const imageUrl = normalizeMenuImageUrl(row.image_url ?? row.imageUrl);
  const createdAt = row.created_at ?? row.createdAt ?? "";
  const updatedAt = row.updated_at ?? row.updatedAt ?? "";

  return {
    id: String(row.id),
    code: row.code ?? "",
    categoryId,
    name: row.name ?? "",
    description: row.description ?? null,
    price: Number(row.price ?? 0),
    discount: Number(row.discount ?? 0),
    isAvailable,
    imageUrl,
    createdAt,
    updatedAt,
  };
}

export async function getMenuCategories() {
  if (isCacheFresh(menuCategoriesCache)) {
    return cloneRows(menuCategoriesCache.data);
  }

  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.from("menu_categories").select("*").order("sort_order", { ascending: true });
  if (error) throw asDbError(error, "Unable to load menu categories.", { table: "menu_categories", operation: "select" });
  const mapped = (Array.isArray(data) ? data : []).map(mapMenuCategoryRow).filter((row) => row.isActive !== false);
  menuCategoriesCache = { ts: Date.now(), data: mapped };
  return cloneRows(mapped);
}

async function listMenuItemsFromAvailabilityView() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("menu_item_effective_availability")
    .select("id, code, category_id, name, description, price, discount, is_available, effective_is_available, image_url, created_at, updated_at")
    .order("name", { ascending: true });

  if (error) return { data: null, error };
  return { data: Array.isArray(data) ? data : [], error: null };
}

export async function getMenuItems() {
  if (isCacheFresh(menuItemsCache)) {
    return cloneRows(menuItemsCache.data);
  }

  const view = await listMenuItemsFromAvailabilityView();
  if (view.data) {
    const mapped = view.data.map(mapMenuItemRow);
    // If the availability view exists but returns no rows (common during setup),
    // fall back to the base table so customers still see the catalog.
    const hasCategories = mapped.some((item) => Boolean(asNonEmptyText(item.categoryId)));
    if (mapped.length && hasCategories) {
      menuItemsCache = { ts: Date.now(), data: mapped };
      return cloneRows(mapped);
    }
  }

  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.from("menu_items").select("*").order("name", { ascending: true });
  if (error) throw asDbError(error, "Unable to load menu items.", { table: "menu_items", operation: "select" });
  const mapped = (Array.isArray(data) ? data : []).map(mapMenuItemRow);
  menuItemsCache = { ts: Date.now(), data: mapped };
  return cloneRows(mapped);
}

export async function getMenuCatalog() {
  return getMenuItems();
}
