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
  const createdAt = row.created_at ?? row.createdAt ?? "";
  const updatedAt = row.updated_at ?? row.updatedAt ?? createdAt;
  const newTagStartedAt = row.new_tag_started_at ?? row.newTagStartedAt ?? null;
  const newTagExpiresAt = row.new_tag_expires_at ?? row.newTagExpiresAt ?? null;
  const isNew = Boolean(row.is_new ?? row.isNew ?? false);
  return {
    id: String(row.id),
    name: row.name ?? "",
    description: description || null,
    sortOrder: Number(sortOrder ?? 0),
    isActive,
    newTagStartedAt,
    newTagExpiresAt,
    isNew,
    createdAt,
    updatedAt,
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
  const rawDiscount = Number(row.discount ?? 0);
  const effectiveDiscount = Number(row.effective_discount ?? row.effectiveDiscount ?? rawDiscount);
  const effectivePrice = Number(row.effective_price ?? row.effectivePrice ?? Math.max(Number(row.price ?? 0) - effectiveDiscount, 0));
  const discountStartsAt = row.discount_starts_at ?? row.discountStartsAt ?? null;
  const discountEndsAt = row.discount_ends_at ?? row.discountEndsAt ?? null;
  const newTagStartedAt = row.new_tag_started_at ?? row.newTagStartedAt ?? null;
  const newTagExpiresAt = row.new_tag_expires_at ?? row.newTagExpiresAt ?? null;
  const limitedTimeEndsAt = row.limited_time_ends_at ?? row.limitedTimeEndsAt ?? null;

  return {
    id: String(row.id),
    code: row.code ?? "",
    categoryId,
    name: row.name ?? "",
    description: row.description ?? null,
    price: Number(row.price ?? 0),
    discount: rawDiscount,
    effectiveDiscount,
    effectivePrice,
    isDiscountActive: Boolean(row.is_discount_active ?? row.isDiscountActive ?? effectiveDiscount > 0),
    discountStartsAt,
    discountEndsAt,
    isAvailable,
    imageUrl,
    newTagStartedAt,
    newTagExpiresAt,
    isNew: Boolean(row.is_new ?? row.isNew ?? false),
    limitedTimeEndsAt,
    isLimited: Boolean(row.is_limited ?? row.isLimited ?? false),
    isLimitedExpired: Boolean(row.is_limited_expired ?? row.isLimitedExpired ?? false),
    categoryIsNew: Boolean(row.category_is_new ?? row.categoryIsNew ?? false),
    createdAt,
    updatedAt,
  };
}

export async function getMenuCategories() {
  if (isCacheFresh(menuCategoriesCache)) {
    return cloneRows(menuCategoriesCache.data);
  }

  const supabase = requireSupabaseClient();
  const view = await supabase.from("menu_category_effective_state").select("*").order("sort_order", { ascending: true });
  const sourceRows = !view.error ? view.data : null;
  const fallback = sourceRows
    ? { data: sourceRows, error: null }
    : await supabase.from("menu_categories").select("*").order("sort_order", { ascending: true });

  if (fallback.error) throw asDbError(fallback.error, "Unable to load menu categories.", { table: "menu_categories", operation: "select" });
  const mapped = (Array.isArray(fallback.data) ? fallback.data : []).map(mapMenuCategoryRow).filter((row) => row.isActive !== false);
  menuCategoriesCache = { ts: Date.now(), data: mapped };
  return cloneRows(mapped);
}

async function listMenuItemsFromAvailabilityView() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("menu_item_effective_availability")
    .select(
      "id, code, category_id, name, description, price, discount, effective_discount, effective_price, is_discount_active, discount_starts_at, discount_ends_at, is_available, effective_is_available, image_url, new_tag_started_at, new_tag_expires_at, is_new, limited_time_ends_at, is_limited, is_limited_expired, category_is_new, created_at, updated_at"
    )
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
