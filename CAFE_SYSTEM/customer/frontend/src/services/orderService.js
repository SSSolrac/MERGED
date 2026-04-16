import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";
import { getSession } from "./authService";
import {
  canonicalOrderTypeToLabel,
  canonicalPaymentMethodToLabel,
  canonicalStatusToLabel,
  labelToCanonicalOrderType,
  labelToCanonicalPaymentMethod,
} from "../constants/canonical";
import { validateCheckout } from "./checkoutValidation";

export { validateCheckout };

const TERMINAL_STATUSES = new Set(["cancelled", "completed", "delivered", "refunded"]);

const STATUS_STEPS_BY_ORDER_TYPE = {
  delivery: ["pending", "preparing", "ready", "out_for_delivery", "delivered"],
  dine_in: ["pending", "preparing", "ready", "completed"],
  pickup: ["pending", "preparing", "ready", "completed"],
  takeout: ["pending", "preparing", "ready", "completed"],
};

function asDbError(error, fallback, options) {
  return asSupabaseError(error, {
    fallbackMessage: fallback || "Database request failed.",
    ...options,
  });
}

async function getUserOrNull() {
  const session = await getSession();
  return session?.user || null;
}

async function requireUser() {
  const user = await getUserOrNull();
  if (!user) throw new Error("You must be signed in to place an order.");
  return user;
}

function toMs(value) {
  return new Date(value).getTime() || 0;
}

function asTrimmedText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toCanonicalOrderType(value) {
  return labelToCanonicalOrderType(value);
}

function asNumber(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.-]/g, "").trim();
    if (!normalized) return fallback;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function normalizeCode(value) {
  return String(value || "").trim().toLowerCase();
}

function mapOrderRow(row) {
  if (!row) return null;

  const subtotal = asNumber(row.subtotal ?? row.subTotal ?? row.sub_total ?? 0);
  const discountTotal = asNumber(row.discount_total ?? row.discountTotal ?? row.discount ?? 0);
  const totalAmount = asNumber(row.total_amount ?? row.totalAmount ?? row.total ?? row.amount ?? row.grand_total ?? row.grandTotal ?? 0);

  return {
    id: String(row.id),
    code: String(row.code || ""),
    customerId: row.customer_id ?? row.customerId ?? null,
    orderType: String(row.order_type ?? row.orderType ?? "takeout"),
    status: String(row.status || "pending"),
    paymentMethod: row.payment_method ?? row.paymentMethod ?? null,
    paymentStatus: String(row.payment_status ?? row.paymentStatus ?? "pending"),
    subtotal,
    discountTotal,
    totalAmount,
    receiptImageUrl: row.receipt_image_url ?? row.receiptImageUrl ?? null,
    notes: row.notes ?? null,
    deliveryAddress: row.delivery_address ?? row.deliveryAddress ?? null,
    placedAt: row.placed_at ?? row.placedAt ?? row.created_at ?? row.createdAt ?? new Date().toISOString(),
    createdAt: row.created_at ?? row.createdAt ?? "",
    updatedAt: row.updated_at ?? row.updatedAt ?? row.created_at ?? row.createdAt ?? "",
  };
}

function mapOrderItemRow(row, index) {
  const safe = row || {};
  const unitPrice = asNumber(safe.unit_price ?? safe.unitPrice ?? safe.price ?? 0);
  const discountAmount = asNumber(safe.discount_amount ?? safe.discountAmount ?? safe.discount ?? 0);
  const quantity = Math.max(1, Math.floor(asNumber(safe.quantity ?? safe.qty ?? 1, 1)));
  const lineTotal = asNumber(safe.line_total ?? safe.lineTotal ?? safe.total ?? safe.amount ?? 0);

  return {
    id: String(safe.id || `line-${index + 1}`),
    orderId: String(safe.order_id || ""),
    menuItemId: safe.menu_item_id ? String(safe.menu_item_id) : null,
    menuItemCode: safe.menu_item_code ? String(safe.menu_item_code) : null,
    itemName: String(safe.item_name ?? safe.itemName ?? safe.name ?? ""),
    unitPrice,
    discountAmount,
    quantity,
    lineTotal,
    createdAt: safe.created_at ?? "",
  };
}

function normalizeOrderItem(item) {
  const quantity = Math.max(1, Math.floor(asNumber(item.quantity ?? 1, 1)));
  const unitPrice = asNumber(item.unitPrice ?? 0);
  const discountAmount = asNumber(item.discountAmount ?? 0);
  const computedLineTotal = Math.max(unitPrice - discountAmount, 0) * quantity;
  const storedLineTotal = asNumber(item.lineTotal ?? 0);

  return {
    ...item,
    quantity,
    unitPrice,
    discountAmount,
    lineTotal: storedLineTotal > 0 ? storedLineTotal : computedLineTotal,
  };
}

function deriveOrderTotals(order, items) {
  const subtotalFromItems = items.reduce((sum, item) => sum + Math.max(item.unitPrice, 0) * Math.max(item.quantity, 1), 0);
  const discountFromItems = items.reduce((sum, item) => sum + Math.max(item.discountAmount, 0) * Math.max(item.quantity, 1), 0);
  const totalFromItems = items.reduce((sum, item) => sum + Math.max(item.lineTotal, 0), 0);

  const storedSubtotal = asNumber(order.subtotal ?? 0);
  const storedDiscountTotal = asNumber(order.discountTotal ?? 0);
  const storedTotalAmount = asNumber(order.totalAmount ?? 0);

  const subtotal = storedSubtotal > 0 ? storedSubtotal : subtotalFromItems;
  const discountTotal = storedDiscountTotal > 0 ? storedDiscountTotal : discountFromItems;
  const fallbackTotal = totalFromItems > 0 ? totalFromItems : Math.max(subtotal - discountTotal, 0);
  const totalAmount = storedTotalAmount > 0 ? storedTotalAmount : fallbackTotal;

  return { subtotal, discountTotal, totalAmount };
}

function mapStatusHistoryRow(row) {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    status: String(row.status || "pending").toLowerCase(),
    changedBy: row.changed_by ?? null,
    note: row.note ?? null,
    changedAt: row.changed_at ?? "",
  };
}

function buildFallbackTimeline(order) {
  if (!order) return [];
  const baseAt = order.placedAt || order.createdAt || new Date().toISOString();
  const updatedAt = order.updatedAt || baseAt;
  const status = String(order.status || "pending").toLowerCase();

  if (status === "pending") return [{ status: "pending", at: baseAt, note: "" }];
  return [
    { status: "pending", at: baseAt, note: "" },
    { status, at: updatedAt, note: "" },
  ];
}

function withUiLabels(order) {
  if (!order) return null;
  const orderType = toCanonicalOrderType(order.orderType);
  const status = String(order.status || "pending").toLowerCase();
  const paymentMethod = labelToCanonicalPaymentMethod(order.paymentMethod || null);

  return {
    ...order,
    orderType,
    orderTypeLabel: canonicalOrderTypeToLabel(orderType),
    status,
    statusLabel: canonicalStatusToLabel(status),
    paymentMethod,
    paymentMethodLabel: canonicalPaymentMethodToLabel(paymentMethod || "qrph"),
  };
}

async function fetchOrderItems(orderIds) {
  if (!orderIds.length) return [];
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.from("order_items").select("*").in("order_id", orderIds);
  if (error) throw asDbError(error, "Unable to load order items.", { table: "order_items", operation: "select" });
  return Array.isArray(data) ? data : [];
}

async function fetchStatusHistory(orderIds) {
  if (!orderIds.length) return [];
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("order_status_history")
    .select("*")
    .in("order_id", orderIds)
    .order("changed_at", { ascending: true });

  if (error) return [];
  return Array.isArray(data) ? data : [];
}

function attachRelatedData(orderRows, itemRows, historyRows) {
  const itemsByOrderId = itemRows.reduce((acc, row) => {
    const orderId = row.order_id ?? row.orderId;
    if (!orderId) return acc;
    const key = String(orderId);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(row);
    return acc;
  }, new Map());

  const historyByOrderId = historyRows.reduce((acc, row) => {
    const orderId = row.order_id ?? row.orderId;
    if (!orderId) return acc;
    const key = String(orderId);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(row);
    return acc;
  }, new Map());

  return orderRows
    .map((row) => {
      const order = mapOrderRow(row);
      if (!order) return null;

      const orderId = String(order.id);
      const items = (itemsByOrderId.get(orderId) || []).map(mapOrderItemRow).map(normalizeOrderItem);
      const history = (historyByOrderId.get(orderId) || []).map(mapStatusHistoryRow);
      const timeline = history.length
        ? history.map((entry) => ({
            status: entry.status,
            at: entry.changedAt,
            note: asTrimmedText(entry.note),
          }))
        : buildFallbackTimeline(order);
      const totals = deriveOrderTotals(order, items);

      return withUiLabels({
        ...order,
        ...totals,
        items,
        statusTimeline: timeline,
      });
    })
    .filter(Boolean);
}

export function getStatusSteps(orderType) {
  return STATUS_STEPS_BY_ORDER_TYPE[toCanonicalOrderType(orderType)] || STATUS_STEPS_BY_ORDER_TYPE.takeout;
}

export function getStatusLabel(status) {
  return canonicalStatusToLabel(status);
}

export function getOrderStatusNote(order, status) {
  if (!order) return "";
  const targetStatus = String(status || order.status || "").toLowerCase();
  if (!targetStatus) return "";

  const timeline = Array.isArray(order.statusTimeline) ? order.statusTimeline : [];
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (String(entry?.status || "").toLowerCase() !== targetStatus) continue;
    const note = asTrimmedText(entry?.note);
    if (note) return note;
  }
  return "";
}

export function getOrderCancellationReason(order) {
  return getOrderStatusNote(order, "cancelled");
}

export function formatRemainingCancellationTime(remainingSeconds) {
  const safeSeconds = Math.max(0, Number(remainingSeconds || 0));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function getOrderCancellationState(order) {
  if (!order) return { canCancel: false, reason: "Order not found." };

  const status = String(order.status || "").toLowerCase();
  if (status === "cancelled") return { canCancel: false, reason: "Order is already cancelled." };
  if (TERMINAL_STATUSES.has(status)) return { canCancel: false, reason: `Order is already ${getStatusLabel(status).toLowerCase()}.` };
  if (status !== "pending") {
    return {
      canCancel: false,
      reason: "Cancellation is only allowed while the order is still pending.",
    };
  }

  return { canCancel: true };
}

function deriveLineAmounts(item) {
  const unitPrice = asNumber(item.unitPrice ?? item.originalPrice ?? item.price ?? 0);
  const discountAmount = asNumber(item.discountAmount ?? 0);
  const quantity = Math.max(1, Math.floor(asNumber(item.qty ?? item.quantity ?? 1, 1)));
  const lineTotal = Math.max(unitPrice - discountAmount, 0) * Math.max(1, quantity);

  return { unitPrice, discountAmount, quantity: Math.max(1, quantity), lineTotal };
}

async function fetchMenuSnapshot(items) {
  const safeItems = Array.isArray(items) ? items : [];
  const codes = [...new Set(
    safeItems
      .map((item) => String(item?.menuItemCode || item?.menu_item_code || item?.code || "").trim())
      .filter(Boolean)
  )];
  const ids = [...new Set(
    safeItems
      .map((item) => String(item?.id || item?.menu_item_id || "").trim())
      .filter((id) => isUuid(id))
  )];

  if (!codes.length && !ids.length) return { byCode: new Map(), byId: new Map() };

  const supabase = requireSupabaseClient();
  const requests = [];
  if (codes.length) {
    requests.push(
      supabase
        .from("menu_items")
        .select("id, code, name, price, discount, is_available")
        .in("code", codes)
    );
  }
  if (ids.length) {
    requests.push(
      supabase
        .from("menu_items")
        .select("id, code, name, price, discount, is_available")
        .in("id", ids)
    );
  }

  const results = await Promise.all(requests);
  const rows = [];
  for (const result of results) {
    if (result?.error) continue;
    if (Array.isArray(result?.data)) rows.push(...result.data);
  }

  const uniqueRows = rows.reduce((acc, row) => {
    const id = String(row?.id || "").trim();
    if (!id) return acc;
    if (!acc.has(id)) acc.set(id, row);
    return acc;
  }, new Map());

  const byId = new Map();
  const byCode = new Map();
  uniqueRows.forEach((row) => {
    const idKey = String(row?.id || "").trim();
    const codeKey = normalizeCode(row?.code);
    if (idKey) byId.set(idKey, row);
    if (codeKey) byCode.set(codeKey, row);
  });

  return { byCode, byId };
}

function resolveMenuSnapshot(item, menuSnapshot) {
  const idKey = String(item?.id || item?.menu_item_id || "").trim();
  if (idKey && menuSnapshot.byId.has(idKey)) return menuSnapshot.byId.get(idKey);

  const codeKey = normalizeCode(item?.menuItemCode || item?.menu_item_code || item?.code);
  if (codeKey && menuSnapshot.byCode.has(codeKey)) return menuSnapshot.byCode.get(codeKey);

  return null;
}

export async function createOrder(orderPayload) {
  await requireUser();
  const supabase = requireSupabaseClient();

  const validation = await validateCheckout(orderPayload);
  if (!validation.isValid) {
    const error = new Error("Checkout validation failed.");
    error.validationErrors = validation.errors;
    throw error;
  }

  const placedAt = new Date().toISOString();
  const canonicalType = toCanonicalOrderType(orderPayload.orderType);
  const paymentMethod = labelToCanonicalPaymentMethod(orderPayload.paymentMethod || orderPayload.payment || "qrph");
  const normalizedReceiptImageUrl =
    paymentMethod === "cash" ? null : String(orderPayload.receiptImageUrl || "").trim() || null;

  const rawItems = Array.isArray(orderPayload.items) ? orderPayload.items : [];
  const menuSnapshot = await fetchMenuSnapshot(rawItems);

  const lineItems = rawItems.map((item, index) => {
    const snapshot = resolveMenuSnapshot(item, menuSnapshot);
    const menuItemCode = String(snapshot?.code || item.menuItemCode || item.menu_item_code || item.code || "").trim();
    const fallbackName = String(item.displayName || item.name || item.itemName || `Item ${index + 1}`).trim();

    if (!snapshot) {
      throw new Error(`${fallbackName} is no longer available. Please remove it from your cart and add it again.`);
    }

    if (snapshot && snapshot.is_available === false) {
      throw new Error(`${snapshot.name || menuItemCode} is no longer available. Please update your cart.`);
    }

    const amounts = deriveLineAmounts({
      ...item,
      unitPrice: snapshot ? snapshot.price : item.unitPrice,
      price: snapshot ? snapshot.price : item.price,
      discountAmount: snapshot ? snapshot.discount : item.discountAmount,
    });

    return {
      menu_item_id: snapshot?.id || (isUuid(item.id) ? item.id : null),
      menu_item_code: menuItemCode || snapshot?.code || null,
      item_name: String(snapshot?.name || fallbackName).trim(),
      unit_price: amounts.unitPrice,
      discount_amount: amounts.discountAmount,
      quantity: amounts.quantity,
      line_total: amounts.lineTotal,
    };
  });

  const subtotal = lineItems.reduce(
    (sum, line) => sum + asNumber(line.unit_price, 0) * Math.max(1, Math.floor(asNumber(line.quantity, 1))),
    0
  );
  const discountTotal = lineItems.reduce(
    (sum, line) => sum + asNumber(line.discount_amount, 0) * Math.max(1, Math.floor(asNumber(line.quantity, 1))),
    0
  );
  const totalAmount = Math.max(subtotal - discountTotal, 0);

  const deliveryAddress = {
    name: orderPayload.customer?.name || "",
    phone: orderPayload.customer?.phone || "",
    email: orderPayload.customer?.email || "",
    address: orderPayload.customer?.address || "",
    ...(orderPayload.deliveryMeta && typeof orderPayload.deliveryMeta === "object" ? orderPayload.deliveryMeta : {}),
  };

  const { data, error } = await supabase.rpc("create_customer_order", {
    p_order_type: canonicalType,
    p_payment_method: paymentMethod,
    p_subtotal: subtotal,
    p_discount_total: discountTotal,
    p_total_amount: totalAmount,
    p_receipt_image_url: normalizedReceiptImageUrl,
    p_notes: orderPayload.notes || null,
    p_delivery_address: deliveryAddress,
    p_items: lineItems,
    p_placed_at: placedAt,
  });

  if (error) {
    // Detect missing/undeployed RPC to surface an actionable message.
    const normalized = asSupabaseError(error, {
      fallbackMessage: "Unable to place your order.",
      table: "orders",
      relation: "create_customer_order",
    });

    if (normalized.kind === "missing_rpc" || normalized.kind === "missing_relation") {
      const err = new Error(
        "Order system is not fully deployed. Please apply unified_schema.sql and delivery_area_schema.sql so create_customer_order and delivery validations are available."
      );
      err.kind = normalized.kind;
      err.relation = normalized.relation || "create_customer_order";
      throw err;
    }

    throw normalized;
  }

  const payload = data || {};
  const orderRow = payload.order || null;
  const itemRows = Array.isArray(payload.items) ? payload.items : [];
  const historyRows = Array.isArray(payload.history) ? payload.history : [];

  const merged = attachRelatedData([orderRow], itemRows, historyRows);
  return merged[0] || null;
}

export async function cancelOrder(order, note = "Cancelled by customer while pending") {
  const user = await requireUser();
  const supabase = requireSupabaseClient();

  const existingOrder = typeof order === "string" ? await getOrderById(order) : order;
  if (!existingOrder) throw new Error("Order not found.");

  const cancellationState = getOrderCancellationState(existingOrder);
  if (!cancellationState.canCancel) throw new Error(cancellationState.reason || "Cancellation is no longer allowed.");

  const { data: updatedRow, error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", existingOrder.id)
    .eq("customer_id", user.id)
    .select("*")
    .single();

  if (error) throw asDbError(error, "Unable to cancel this order.", { table: "orders", operation: "update" });

  try {
    await supabase.from("order_status_history").insert({
      order_id: existingOrder.id,
      status: "cancelled",
      changed_by: user.id,
      note,
      changed_at: new Date().toISOString(),
    });
  } catch {
    // best effort
  }

  const [items, history] = await Promise.all([fetchOrderItems([updatedRow.id]), fetchStatusHistory([updatedRow.id])]);
  return attachRelatedData([updatedRow], items, history)[0] || null;
}

export async function getLatestOrder() {
  const user = await getUserOrNull();
  if (!user) return null;

  const supabase = requireSupabaseClient();
  const { data: rows, error } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", user.id)
    .order("placed_at", { ascending: false })
    .limit(1);

  if (error) throw asDbError(error, "Unable to load your latest order.", { table: "orders", operation: "select" });

  const orderRow = Array.isArray(rows) ? rows[0] : null;
  if (!orderRow) return null;

  const orderIds = [orderRow.id];
  const [items, history] = await Promise.all([fetchOrderItems(orderIds), fetchStatusHistory(orderIds)]);
  return attachRelatedData([orderRow], items, history)[0] || null;
}

async function getOrderRowByIdOrCode(orderIdOrCode, userId) {
  const supabase = requireSupabaseClient();
  const idFirst = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderIdOrCode)
    .eq("customer_id", userId)
    .maybeSingle();

  if (idFirst.error) throw asDbError(idFirst.error, "Unable to load order.", { table: "orders", operation: "select" });
  if (idFirst.data) return idFirst.data;

  const codeMatch = await supabase
    .from("orders")
    .select("*")
    .eq("code", orderIdOrCode)
    .eq("customer_id", userId)
    .maybeSingle();

  if (codeMatch.error) throw asDbError(codeMatch.error, "Unable to load order.", { table: "orders", operation: "select" });
  return codeMatch.data || null;
}

export async function getOrderById(orderIdOrCode) {
  if (!orderIdOrCode) return null;
  const user = await getUserOrNull();
  if (!user) return null;

  const row = await getOrderRowByIdOrCode(String(orderIdOrCode).trim(), user.id);
  if (!row) return null;

  const orderIds = [row.id];
  const [items, history] = await Promise.all([fetchOrderItems(orderIds), fetchStatusHistory(orderIds)]);
  return attachRelatedData([row], items, history)[0] || null;
}

export async function getOrderHistory() {
  const user = await getUserOrNull();
  if (!user) return [];

  const supabase = requireSupabaseClient();
  const { data: rows, error } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", user.id)
    .order("placed_at", { ascending: false });

  if (error) throw asDbError(error, "Unable to load your orders.", { table: "orders", operation: "select" });

  const orderRows = Array.isArray(rows) ? rows : [];
  const orderIds = orderRows.map((row) => row.id).filter(Boolean);
  const [items, history] = await Promise.all([fetchOrderItems(orderIds), fetchStatusHistory(orderIds)]);

  const merged = attachRelatedData(orderRows, items, history);
  return merged.sort((a, b) => toMs(b.placedAt) - toMs(a.placedAt));
}

export async function getOrderStatusHistory(orderId) {
  if (!orderId) return [];
  const user = await getUserOrNull();
  if (!user) return [];

  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("order_status_history")
    .select("*")
    .eq("order_id", orderId)
    .order("changed_at", { ascending: true });

  if (error) return [];

  return (Array.isArray(data) ? data : []).map(mapStatusHistoryRow);
}
