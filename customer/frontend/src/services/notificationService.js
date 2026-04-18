import { getOrderHistory } from "./orderService";
import { getMenuCategories, getMenuItems } from "./menuService";
import { getSession } from "./authService";
import { requireSupabaseClient } from "../lib/supabase";
import { canonicalStatusToLabel } from "../constants/canonical";

const NOTIFICATION_STORE_KEY = "happyTailsCustomerNotifications_v1";
const NEW_ITEM_METADATA_KEY = "happyTailsCustomerNewItemNotificationMeta_v1";
const NOTIFICATION_SYNC_TTL_MS = 15000;
const MENU_SOURCE_TTL_MS = 30000;
const NEW_ITEM_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const NEW_ITEM_METADATA_RETENTION_MS = NEW_ITEM_RECENT_WINDOW_MS * 8;
let inFlightSync = null;
let lastSyncAt = 0;
let menuSourceCache = { ts: 0, items: [], categories: [] };

const ORDER_STATUS_NOTIFICATION_MAP = {
  pending: "order_created",
  preparing: "order_preparing",
  ready: "order_ready",
  out_for_delivery: "order_out_for_delivery",
  completed: "order_completed",
  delivered: "order_completed",
  cancelled: "order_cancelled",
  refunded: "order_refunded",
};

const NOTIFICATION_TYPE_LABELS = {
  order_created: "Order received",
  order_confirmed: "Order confirmed",
  order_preparing: "Now preparing",
  order_ready: "Order ready",
  order_out_for_delivery: "Out for delivery",
  order_completed: "Order completed",
  order_cancelled: "Order cancelled",
  order_refunded: "Order refunded",
  promo_discount: "Promo discount",
  menu_new_item: "New menu item",
  loyalty_stamps_awarded: "Loyalty stamps",
};

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFICATION_STORE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeStore(items) {
  localStorage.setItem(NOTIFICATION_STORE_KEY, JSON.stringify(items));
}

function readNewItemMetadata() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NEW_ITEM_METADATA_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeNewItemMetadata(metadata) {
  localStorage.setItem(NEW_ITEM_METADATA_KEY, JSON.stringify(metadata));
}

function sortByDateDesc(notifications) {
  return [...notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function toDateMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function getNotificationTypeLabel(type) {
  const key = String(type || "").trim().toLowerCase();
  if (!key) return "Notification";
  if (NOTIFICATION_TYPE_LABELS[key]) return NOTIFICATION_TYPE_LABELS[key];
  return key.replaceAll("_", " ");
}

function mapStatusToMessage(type, orderRef, statusLabel, note = "") {
  const shortOrder = orderRef ? `order ${orderRef}` : "your order";
  const trimmedNote = String(note || "").trim();
  switch (type) {
    case "order_created":
      return {
        title: "Order received",
        message: `We received ${shortOrder}. The kitchen will review it shortly.`
      };
    case "order_confirmed":
      return {
        title: "Order confirmed",
        message: `${shortOrder} has been confirmed by the cafe team.`
      };
    case "order_preparing":
      return {
        title: "Now preparing",
        message: `${shortOrder} is now being prepared.`
      };
    case "order_ready":
      return {
        title: "Ready",
        message: `${shortOrder} is ready.`
      };
    case "order_out_for_delivery":
      return {
        title: "Out for delivery",
        message: `${shortOrder} is on the way.`
      };
    case "order_completed":
      return {
        title: "Order completed",
        message: `${shortOrder} has been completed. Enjoy and thank you!`
      };
    case "order_cancelled":
      return {
        title: "Order cancelled",
        message: trimmedNote ? `${shortOrder} was cancelled. Reason: ${trimmedNote}` : `${shortOrder} was cancelled.`
      };
    case "order_refunded":
      return {
        title: "Order refunded",
        message: `${shortOrder} has been refunded.`
      };
    default:
      return {
        title: `Order ${statusLabel}`,
        message: `${shortOrder} is now ${statusLabel.toLowerCase()}.`
      };
  }
}

function buildOrderNotifications(orders) {
  const notifications = [];

  orders.forEach((order) => {
    const timeline = Array.isArray(order.statusTimeline) && order.statusTimeline.length
      ? order.statusTimeline
      : [{ status: order.status, at: order.updatedAt || order.createdAt }];

    const orderRef = String(order.code || order.id || "").trim();

    timeline.forEach((entry) => {
      const normalizedStatus = String(entry.status || "").toLowerCase();
      const type = ORDER_STATUS_NOTIFICATION_MAP[normalizedStatus];
      if (!type) return;

      const createdAt = entry.at || order.updatedAt || order.createdAt;
      const statusLabel = canonicalStatusToLabel(normalizedStatus);
      const copy = mapStatusToMessage(type, orderRef, statusLabel, entry?.note);

      notifications.push({
        id: `order:${order.id}:${normalizedStatus}:${createdAt}`,
        type,
        title: copy.title,
        message: copy.message,
        createdAt,
        isRead: false,
        orderId: order.id
      });
    });
  });

  return notifications;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeManualStampEvent(row) {
  return {
    id: asText(row?.id),
    stampDelta: Math.max(1, asNumber(row?.stamp_delta ?? row?.stampDelta ?? 1, 1)),
    reason: asText(row?.reason),
    earnedAt: row?.earned_at ?? row?.earnedAt ?? row?.created_at ?? row?.createdAt ?? new Date().toISOString(),
  };
}

async function getManualLoyaltyStampEvents() {
  const session = await getSession().catch(() => null);
  const userId = session?.user?.id || "";
  if (!userId) return [];

  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("loyalty_stamp_events")
    .select("id, stamp_delta, source, reason, earned_at, created_at")
    .eq("customer_id", userId)
    .eq("source", "manual_staff_award")
    .order("earned_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return (Array.isArray(data) ? data : []).map(normalizeManualStampEvent);
}

function buildLoyaltyStampNotifications(stampEvents) {
  return (Array.isArray(stampEvents) ? stampEvents : []).map((event) => {
    const stampLabel = `${event.stampDelta} stamp${event.stampDelta === 1 ? "" : "s"}`;
    return {
      id: `loyalty_stamps_awarded:${event.id}:${event.earnedAt}`,
      type: "loyalty_stamps_awarded",
      title: "Loyalty stamps awarded",
      message: event.reason
        ? `The cafe team awarded you ${stampLabel}. Reason: ${event.reason}`
        : `The cafe team awarded you ${stampLabel}.`,
      createdAt: event.earnedAt,
      isRead: false,
    };
  });
}

async function getMenuNotificationSource() {
  const isCacheFresh = Date.now() - menuSourceCache.ts < MENU_SOURCE_TTL_MS;
  if (isCacheFresh && Array.isArray(menuSourceCache.items) && Array.isArray(menuSourceCache.categories)) {
    return {
      items: [...menuSourceCache.items],
      categories: [...menuSourceCache.categories],
    };
  }

  const [items, categories] = await Promise.all([getMenuItems().catch(() => []), getMenuCategories().catch(() => [])]);
  const safeItems = Array.isArray(items) ? items : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  menuSourceCache = {
    ts: Date.now(),
    items: safeItems,
    categories: safeCategories,
  };

  return {
    items: [...safeItems],
    categories: [...safeCategories],
  };
}

function buildPromoNotifications(menuSource) {
  const source = menuSource && typeof menuSource === "object" ? menuSource : {};
  const items = Array.isArray(source.items) ? source.items : [];
  const categories = Array.isArray(source.categories) ? source.categories : [];
  const categoryById = new Map(categories.map((category) => [String(category.id), String(category.name || "")]));

  return items
    .filter((item) => Boolean(item.isDiscountActive) && Number(item.effectiveDiscount ?? item.discount ?? 0) > 0)
    .filter((item) => item.isAvailable !== false)
    .map((item) => {
      const categoryName = categoryById.get(String(item.categoryId || "")) || "Menu";
      const discountAmount = Number(item.effectiveDiscount ?? item.discount ?? 0);
      const displayName = item.name || "Item";
      const createdAt = item.discountStartsAt || item.updatedAt || item.createdAt || new Date().toISOString();

      return {
        id: `promo:item:${item.id}:${discountAmount}:${createdAt}`,
        type: "promo_discount",
        title: "Item discount available",
        message: `${displayName} is Php ${discountAmount.toFixed(2)} off. (${categoryName})`,
        createdAt,
        isRead: false,
      };
    });
}

function pruneNewItemMetadata(metadata, nowMs) {
  const safeMetadata = metadata && typeof metadata === "object" ? metadata : {};
  const next = {};

  Object.entries(safeMetadata).forEach(([itemId, createdMsValue]) => {
    const createdMs = Number(createdMsValue);
    if (!Number.isFinite(createdMs)) return;
    if (nowMs - createdMs > NEW_ITEM_METADATA_RETENTION_MS) return;
    next[itemId] = createdMs;
  });

  return next;
}

function buildNewItemNotifications(items) {
  const nowMs = Date.now();
  const metadata = pruneNewItemMetadata(readNewItemMetadata(), nowMs);
  const nextMetadata = { ...metadata };
  const notifications = [];

  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || item.isAvailable === false || !item.isNew) return;

    const itemId = String(item.id || "").trim();
    if (!itemId) return;

    const createdMs = toDateMs(item.newTagStartedAt || item.createdAt);
    if (!createdMs) return;
    if (createdMs > nowMs + 60_000) return;
    if (nowMs - createdMs > NEW_ITEM_RECENT_WINDOW_MS) return;
    if (Number(nextMetadata[itemId]) === createdMs) return;

    const itemName = String(item.name || "This item").trim() || "This item";
    notifications.push({
      id: `menu_new_item:${itemId}:${createdMs}`,
      type: "menu_new_item",
      title: "New menu item",
      message: `${itemName} is now available on the menu.`,
      createdAt: new Date(createdMs).toISOString(),
      isRead: false,
    });

    nextMetadata[itemId] = createdMs;
  });

  writeNewItemMetadata(nextMetadata);
  return notifications;
}

export async function syncCustomerNotifications({ force = false } = {}) {
  if (!force && inFlightSync) return inFlightSync;
  if (!force && Date.now() - lastSyncAt < NOTIFICATION_SYNC_TTL_MS) return getCustomerNotifications();

  inFlightSync = (async () => {
    const current = readStore();
    const byId = new Map(current.map((item) => [item.id, item]));

    const [orders, menuSource, manualStampEvents] = await Promise.all([
      getOrderHistory().catch(() => []),
      getMenuNotificationSource().catch(() => ({ items: [], categories: [] })),
      getManualLoyaltyStampEvents().catch(() => []),
    ]);

    const derivedOrderNotifications = buildOrderNotifications(orders);
    const promoNotifications = buildPromoNotifications(menuSource);
    const newItemNotifications = buildNewItemNotifications(menuSource.items);
    const loyaltyStampNotifications = buildLoyaltyStampNotifications(manualStampEvents);

    [...derivedOrderNotifications, ...promoNotifications, ...newItemNotifications, ...loyaltyStampNotifications].forEach((notification) => {
      const existing = byId.get(notification.id);
      byId.set(notification.id, {
        ...notification,
        isRead: existing?.isRead ?? false
      });
    });

    const merged = sortByDateDesc(Array.from(byId.values()));
    writeStore(merged);
    lastSyncAt = Date.now();
    return getCustomerNotifications();
  })().finally(() => {
    inFlightSync = null;
  });

  return inFlightSync;
}

export function getCustomerNotifications() {
  return sortByDateDesc(readStore().filter((item) => !item.isRead));
}

export function getUnreadNotificationCount() {
  return readStore().filter((item) => !item.isRead).length;
}

export function markNotificationRead(notificationId) {
  if (!notificationId) return;
  const items = readStore();
  const next = items.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item));
  writeStore(next);
}

export function markAllNotificationsRead() {
  const items = readStore();
  const next = items.map((item) => ({ ...item, isRead: true }));
  writeStore(next);
}
