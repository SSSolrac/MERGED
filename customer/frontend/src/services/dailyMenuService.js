import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";
import { getMenuCatalog as getMenuCatalogBase, getMenuCategories } from "./menuService";

function asDbError(error, fallback, options) {
  return asSupabaseError(error, {
    fallbackMessage: fallback || "Database request failed.",
    ...options,
  });
}

function formatDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function toDisplayName(item) {
  if (!item) return "Item";
  const name = item.name ? String(item.name).trim() : "";
  return name || "Item";
}

function mapBestSellerRow(row) {
  return {
    menuItemCode: String(row?.menu_item_code ?? row?.menuItemCode ?? "").trim(),
    itemName: String(row?.item_name ?? row?.itemName ?? "").trim(),
    quantitySold: Number(row?.quantity_sold ?? row?.quantitySold ?? 0),
    revenue: Number(row?.revenue ?? 0),
    orderCount: Number(row?.order_count ?? row?.orderCount ?? 0),
    lastSoldAt: String(row?.last_sold_at ?? row?.lastSoldAt ?? ""),
  };
}

export async function getCurrentDailyMenu() {
  const supabase = requireSupabaseClient();
  const today = formatDate(new Date());

  const { data: dailyMenu, error: dailyError } = await supabase
    .from("daily_menus")
    .select("*")
    .eq("menu_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dailyError) throw asDbError(dailyError, "Unable to load the daily menu.", { table: "daily_menus", operation: "select" });

  if (!dailyMenu) {
    return {
      title: "Menu of the Day",
      subtitle: "Chef picks are being prepared",
      date: today,
      isActive: false,
      categories: [],
    };
  }

  const isPublished = Boolean(dailyMenu.is_published ?? dailyMenu.isPublished ?? dailyMenu.published ?? false);

  const { data: dailyItems, error: dailyItemsError } = await supabase
    .from("daily_menu_items")
    .select("*")
    .eq("daily_menu_id", dailyMenu.id);

  if (dailyItemsError) throw asDbError(dailyItemsError, "Unable to load daily menu items.", { table: "daily_menu_items", operation: "select" });

  const menuItemIds = (Array.isArray(dailyItems) ? dailyItems : [])
    .map((row) => row.menu_item_id || row.menuItemId || row.item_id || row.itemId)
    .filter(Boolean);

  const catalog = await getMenuCatalogBase();
  const byId = new Map(catalog.map((item) => [String(item.id), item]));

  const linkedItems = menuItemIds.map((id) => byId.get(String(id))).filter(Boolean);

  const categories = await getMenuCategories().catch(() => []);
  const categoryById = new Map(categories.map((cat) => [String(cat.id), cat.name]));

  const grouped = linkedItems.reduce((acc, item) => {
    const categoryId = item.categoryId ? String(item.categoryId) : "";
    const groupName = categoryById.get(categoryId) || categoryId || "Featured";
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(toDisplayName(item));
    return acc;
  }, {});

  return {
    title: "Menu of the Day",
    subtitle: isPublished ? "Fresh picks selected by our kitchen" : "Chef picks are being prepared",
    date: formatDate(dailyMenu.menu_date || today),
    isActive: isPublished,
    categories: Object.entries(grouped).map(([name, items]) => ({ name, items })),
  };
}

export async function getMenuCatalog() {
  return getMenuCatalogBase();
}

export async function getBestSellingItems(options = {}) {
  const supabase = requireSupabaseClient();
  const rawLimit = Number(options.limit);
  const rawLookbackDays = Number(options.lookbackDays);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(24, Math.floor(rawLimit))) : 6;
  const lookbackDays = Number.isFinite(rawLookbackDays) ? Math.max(0, Math.floor(rawLookbackDays)) : 180;

  const { data, error } = await supabase.rpc("menu_best_sellers", {
    p_limit: limit,
    p_lookback_days: lookbackDays,
  });

  if (error) {
    throw asDbError(error, "Unable to load best sellers.", {
      operation: "rpc",
      fn: "menu_best_sellers",
    });
  }

  return (Array.isArray(data) ? data : [])
    .map(mapBestSellerRow)
    .filter((row) => row.itemName);
}
