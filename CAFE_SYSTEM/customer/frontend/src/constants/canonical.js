export const CANONICAL_ORDER_STATUSES = ["pending", "preparing", "ready", "out_for_delivery", "completed", "delivered", "cancelled", "refunded"];
export const CANONICAL_PAYMENT_METHODS = ["qrph", "gcash", "maribank", "bdo", "cash"];
export const CANONICAL_PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];
export const CANONICAL_ORDER_TYPES = ["dine_in", "pickup", "takeout", "delivery"];

export const STATUS_LABELS = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded"
};

export const PAYMENT_METHOD_LABELS = {
  qrph: "QRPH",
  gcash: "GCash",
  maribank: "MariBank",
  bdo: "BDO",
  cash: "Cash",
};

export const ORDER_TYPE_LABELS = {
  dine_in: "Dine-in",
  pickup: "Pickup",
  takeout: "Takeout",
  delivery: "Delivery"
};

export function canonicalStatusToLabel(status) {
  return STATUS_LABELS[String(status || "").toLowerCase()] || "Pending";
}

export function canonicalPaymentMethodToLabel(method) {
  return PAYMENT_METHOD_LABELS[String(method || "").toLowerCase()] || "QRPH";
}

export function canonicalOrderTypeToLabel(type) {
  return ORDER_TYPE_LABELS[String(type || "").toLowerCase()] || "Takeout";
}

export function labelToCanonicalPaymentMethod(value) {
  const key = String(value || "").trim().toLowerCase();
  if (CANONICAL_PAYMENT_METHODS.includes(key)) return key;
  if (key === "qrph") return "qrph";
  if (key === "gcash") return "gcash";
  if (key === "cash") return "cash";
  if (["mari bank", "mari-bank"].includes(key)) return "maribank";
  return null;
}

export function labelToCanonicalOrderType(value) {
  const key = String(value || "").trim().toLowerCase();
  if (["dine-in", "dine_in", "dinein"].includes(key)) return "dine_in";
  if (key === "pickup") return "pickup";
  if (key === "delivery") return "delivery";
  return "takeout";
}
