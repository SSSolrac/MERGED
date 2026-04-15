import { getOrderHistory } from "./orderService";
import { getMenuCategories, getMenuItems } from "./menuService";
import { canonicalStatusToLabel } from "../constants/canonical";

const NOTIFICATION_STORE_KEY = "happyTailsCustomerNotifications_v1";
const NOTIFICATION_SYNC_TTL_MS = 15000;
const PROMO_SOURCE_TTL_MS = 30000;
let inFlightSync = null;
let lastSyncAt = 0;
let promoSourceCache = { ts: 0, data: [] };

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

function sortByDateDesc(notifications) {
  return [...notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function mapStatusToMessage(type, orderRef, statusLabel) {
  const shortOrder = orderRef ? `order ${orderRef}` : "your order";
  switch (type) {
    case "order_created":
      return {
        title: "Order received",
        message: `We received ${shortOrder}. The kitchen will review it shortly.`
      };
    case "order_confirmed":
      return {
        title: "Order confirmed",
        message: `${shortOrder} has been confirmed by the café team.`
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
        message: `${shortOrder} was cancelled.`
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
      const copy = mapStatusToMessage(type, orderRef, statusLabel);

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

async function getPromoSource() {
  if (Date.now() - promoSourceCache.ts < PROMO_SOURCE_TTL_MS && Array.isArray(promoSourceCache.data)) {
    return [...promoSourceCache.data];
  }

  const [items, categories] = await Promise.all([getMenuItems().catch(() => []), getMenuCategories().catch(() => [])]);

  const categoryById = new Map(categories.map((category) => [String(category.id), String(category.name || "")]));

  const promos = items
    .filter((item) => Number(item.discount || 0) > 0)
    .filter((item) => item.isAvailable !== false)
    .map((item) => {
      const categoryName = categoryById.get(String(item.categoryId || "")) || "Menu";
      const discountAmount = Number(item.discount || 0);
      const displayName = item.name || "Item";
      const createdAt = item.updatedAt || new Date().toISOString();

      return {
        id: `promo:item:${item.id}:${discountAmount}:${createdAt}`,
        type: "promo_discount",
        title: "Item discount available",
        message: `${displayName} is ₱${discountAmount.toFixed(2)} off. (${categoryName})`,
        createdAt,
        isRead: false,
      };
    });

  promoSourceCache = { ts: Date.now(), data: promos };
  return [...promos];
}

export async function syncCustomerNotifications({ force = false } = {}) {
  if (!force && inFlightSync) return inFlightSync;
  if (!force && Date.now() - lastSyncAt < NOTIFICATION_SYNC_TTL_MS) return getCustomerNotifications();

  inFlightSync = (async () => {
    const current = readStore();
    const byId = new Map(current.map((item) => [item.id, item]));

    const [orders, promoNotifications] = await Promise.all([getOrderHistory().catch(() => []), getPromoSource().catch(() => [])]);
    const derivedOrderNotifications = buildOrderNotifications(orders);

    [...derivedOrderNotifications, ...promoNotifications].forEach((notification) => {
      const existing = byId.get(notification.id);
      byId.set(notification.id, {
        ...notification,
        isRead: existing?.isRead ?? false
      });
    });

    const merged = sortByDateDesc(Array.from(byId.values()));
    writeStore(merged);
    lastSyncAt = Date.now();
    return merged;
  })().finally(() => {
    inFlightSync = null;
  });

  return inFlightSync;
}

export function getCustomerNotifications() {
  return sortByDateDesc(readStore());
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
