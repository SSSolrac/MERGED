const GUEST_ORDER_IDENTITY_KEY = "happyTailsGuestOrderIdentity_v1";
const GUEST_LAST_ORDER_KEY = "happyTailsGuestLastOrder_v1";

export function normalizeGuestPhone(value) {
  let digitsOnly = String(value || "").replace(/\D/g, "");
  if (!digitsOnly) return "";

  if (digitsOnly.startsWith("63")) digitsOnly = digitsOnly.slice(2);
  if (digitsOnly.startsWith("0")) digitsOnly = digitsOnly.slice(1);

  const localDigits = digitsOnly.slice(0, 10);
  if (!/^9\d{9}$/.test(localDigits)) return "";
  return `+63${localDigits}`;
}

export function normalizeGuestEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function readJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function saveGuestOrderIdentity({ phone, email } = {}) {
  const phoneNormalized = normalizeGuestPhone(phone);
  const emailNormalized = normalizeGuestEmail(email);
  if (!phoneNormalized && !emailNormalized) return null;

  const identity = {
    phoneNormalized,
    emailNormalized,
    updatedAt: new Date().toISOString(),
  };
  writeJson(GUEST_ORDER_IDENTITY_KEY, identity);
  return identity;
}

export function getStoredGuestOrderIdentity() {
  return readJson(GUEST_ORDER_IDENTITY_KEY, null);
}

export function saveGuestLastOrder(order) {
  const orderRef = String(order?.code || order?.id || "").trim();
  if (!orderRef) return;
  writeJson(GUEST_LAST_ORDER_KEY, {
    orderId: String(order?.id || "").trim(),
    orderCode: String(order?.code || "").trim(),
    savedAt: new Date().toISOString(),
  });
}

export function getStoredGuestLastOrder() {
  return readJson(GUEST_LAST_ORDER_KEY, null);
}
