import { AppError, normalizeError } from '@/lib/errors';
import { mapCustomerProfileRow, mapOrderItemRow, mapOrderRow, mapOrderStatusHistoryRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import type { DateRangePreset } from '@/types/dashboard';
import type { Order, OrderFilters, OrderStatus } from '@/types/order';

const asDbError = (error: unknown, fallback = 'Database request failed.') => {
  const normalized = normalizeError(error, { fallbackMessage: fallback });
  if (normalized.code === '54001' || /stack depth limit exceeded/i.test(normalized.message)) {
    return new AppError({
      category: 'backend',
      code: normalized.code,
      status: normalized.status,
      details: normalized.details,
      hint: normalized.hint,
      cause: error,
      message:
        "Supabase failed to load order data (Postgres error 54001: stack depth limit exceeded). This is usually caused by a recursive Row Level Security (RLS) policy on the 'orders'/'order_items' tables. Fix the RLS policies in Supabase.",
    });
  }

  return normalized;
};

const rangeToDays: Record<Exclude<DateRangePreset, 'all'>, number> = {
  today: 0,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '3m': 90,
  '6m': 180,
  '1y': 365,
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const rangeStartIso = (range: DateRangePreset): string | null => {
  if (range === 'all') return null;
  if (range === 'today') return startOfToday().toISOString();
  const days = rangeToDays[range];
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start.toISOString();
};

const orderTimestampMs = (order: Pick<Order, 'placedAt' | 'createdAt'>) => {
  const placedAtMs = new Date(order.placedAt).getTime();
  if (Number.isFinite(placedAtMs)) return placedAtMs;
  const createdAtMs = new Date(order.createdAt).getTime();
  return Number.isFinite(createdAtMs) ? createdAtMs : NaN;
};

const isWithinRange = (order: Pick<Order, 'placedAt' | 'createdAt'>, range: DateRangePreset) => {
  const startIso = rangeStartIso(range);
  if (!startIso) return true;
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) return true;
  const orderMs = orderTimestampMs(order);
  return Number.isFinite(orderMs) && orderMs >= startMs;
};

const requireUserId = async () => {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw asDbError(error, 'Unable to load session.');
  if (!data.user) throw new AppError({ category: 'auth', message: 'You must be signed in.' });
  return data.user.id;
};

const asTrimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const nonNegative = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

const quantityOrOne = (value: number) => (Number.isFinite(value) && value > 0 ? value : 1);

const deliveryAddressName = (value: unknown): string | null => {
  const record = asObject(value);
  if (!record) return null;
  const name = asTrimmed(record.name ?? record.customer_name ?? record.customerName);
  return name || null;
};

const deriveLineTotal = (item: NonNullable<Order['items']>[number]) => {
  const quantity = quantityOrOne(item.quantity);
  const unitPrice = nonNegative(item.unitPrice);
  const discountAmount = nonNegative(item.discountAmount);
  const savedLineTotal = nonNegative(item.lineTotal);
  if (savedLineTotal > 0) return savedLineTotal;
  return Math.max(0, unitPrice - discountAmount) * quantity;
};

const deriveOrderTotals = (order: ReturnType<typeof mapOrderRow>, items: NonNullable<Order['items']>) => {
  const computedSubtotal = items.reduce((sum, item) => sum + nonNegative(item.unitPrice) * quantityOrOne(item.quantity), 0);
  const computedDiscount = items.reduce((sum, item) => sum + nonNegative(item.discountAmount) * quantityOrOne(item.quantity), 0);
  const computedTotalFromItems = items.reduce((sum, item) => sum + deriveLineTotal(item), 0);

  const subtotal = nonNegative(order.subtotal) > 0 ? nonNegative(order.subtotal) : computedSubtotal;
  const discountTotal = nonNegative(order.discountTotal) > 0 ? nonNegative(order.discountTotal) : computedDiscount;

  let totalAmount = nonNegative(order.totalAmount);
  if (totalAmount <= 0) {
    if (computedTotalFromItems > 0) totalAmount = computedTotalFromItems;
    else totalAmount = Math.max(0, subtotal - discountTotal);
  }

  return {
    subtotal: roundMoney(subtotal),
    discountTotal: roundMoney(discountTotal),
    totalAmount: roundMoney(totalAmount),
  };
};

const hydrateOrder = (
  order: ReturnType<typeof mapOrderRow>,
  itemRows: NonNullable<Order['items']>,
  customer: Order['customer'],
  statusTimeline?: Order['statusTimeline'],
): Order => {
  const items = itemRows.map((item) => ({ ...item, lineTotal: roundMoney(deriveLineTotal(item)) }));
  const totals = deriveOrderTotals(order, items);
  const customerName = asTrimmed(customer?.name) || asTrimmed(order.customerName) || deliveryAddressName(order.deliveryAddress) || null;

  return {
    ...order,
    ...totals,
    customerName,
    customer,
    items,
    ...(statusTimeline ? { statusTimeline } : {}),
  };
};

const attachOrderRelations = async (orders: Array<ReturnType<typeof mapOrderRow>>): Promise<Order[]> => {
  const supabase = requireSupabaseClient();
  const orderIds = orders.map((o) => o.id).filter(Boolean);
  const customerIds = orders.map((o) => o.customerId).filter((id): id is string => Boolean(id));

  const [itemsResult, customersResult] = await Promise.all([
    orderIds.length ? supabase.from('order_items').select('*').in('order_id', orderIds) : Promise.resolve({ data: [], error: null }),
    customerIds.length ? supabase.from('profiles').select('*').in('id', customerIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (itemsResult.error) throw asDbError(itemsResult.error, 'Unable to load order items.');
  if (customersResult.error) throw asDbError(customersResult.error, 'Unable to load customer profiles.');

  const itemsByOrderId = (Array.isArray(itemsResult.data) ? itemsResult.data : []).reduce<Record<string, Order['items']>>((acc, row) => {
    const item = mapOrderItemRow(row);
    if (!acc[item.orderId]) acc[item.orderId] = [];
    acc[item.orderId]!.push(item);
    return acc;
  }, {});

  const customerById = new Map(
    (Array.isArray(customersResult.data) ? customersResult.data : []).map((row) => {
      const customer = mapCustomerProfileRow(row);
      return [customer.id, customer] as const;
    }),
  );

  return orders.map((order) => {
    const items = itemsByOrderId[order.id] ?? [];
    const customer = order.customerId ? customerById.get(order.customerId) ?? null : null;
    return hydrateOrder(order, items, customer);
  });
};

const fetchOrderById = async (orderId: string): Promise<Order> => {
  const supabase = requireSupabaseClient();
  const { data: orderRow, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (orderError) throw asDbError(orderError, 'Unable to load order.');
  if (!orderRow) throw new Error('Order not found.');

  const base = mapOrderRow(orderRow);

  const [itemsResult, historyResult, customerResult] = await Promise.all([
    supabase.from('order_items').select('*').eq('order_id', orderId),
    supabase.from('order_status_history').select('*').eq('order_id', orderId).order('changed_at', { ascending: true }),
    base.customerId ? supabase.from('profiles').select('*').eq('id', base.customerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsResult.error) throw asDbError(itemsResult.error, 'Unable to load order items.');
  if (historyResult.error) throw asDbError(historyResult.error, 'Unable to load status history.');
  if (customerResult.error) throw asDbError(customerResult.error, 'Unable to load customer profile.');

  const items = (Array.isArray(itemsResult.data) ? itemsResult.data : []).map(mapOrderItemRow);
  const statusTimeline = (Array.isArray(historyResult.data) ? historyResult.data : []).map(mapOrderStatusHistoryRow);
  const customer = customerResult.data ? mapCustomerProfileRow(customerResult.data) : null;

  return hydrateOrder(base, items, customer, statusTimeline);
};

const ensureMutableOrder = async (orderId: string) => {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.from('orders').select('id,status,payment_status').eq('id', orderId).maybeSingle();
  if (error) throw asDbError(error, 'Unable to load order.');
  if (!data) {
    throw new AppError({
      category: 'permission',
      message: 'Order not found or you do not have permission to update it.',
    });
  }
  return data as { id: string; status: OrderStatus; payment_status: Order['paymentStatus'] };
};

export const orderService = {
  async getOrders(filters?: OrderFilters): Promise<Order[]> {
    const supabase = requireSupabaseClient();
    const range = filters?.range ?? '30d';
    const status = filters?.status ?? 'all';
    const paymentMethod = filters?.paymentMethod ?? 'all';
    const queryText = filters?.query?.trim() ?? '';
    const limit = Number.isFinite(filters?.limit) ? Math.max(1, Math.min(1000, Math.floor(Number(filters?.limit)))) : null;

    let query = supabase.from('orders').select('*').order('created_at', { ascending: false });

    if (status !== 'all') query = query.eq('status', status);
    if (paymentMethod !== 'all') query = query.eq('payment_method', paymentMethod);
    if (queryText) query = query.ilike('code', `%${queryText}%`);
    if (limit != null) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw asDbError(error, 'Unable to load orders.');

    const mapped = (Array.isArray(data) ? data : []).map(mapOrderRow);
    const rangeFiltered = mapped.filter((order) => isWithinRange(order, range));
    return attachOrderRelations(rangeFiltered);
  },

  async getOrderById(orderId: string): Promise<Order> {
    return fetchOrderById(orderId);
  },

  async confirmPayment(orderId: string): Promise<Order> {
    const supabase = requireSupabaseClient();
    await ensureMutableOrder(orderId);

    const { data, error } = await supabase
      .from('orders')
      .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select('id')
      .maybeSingle();

    if (error) throw asDbError(error, 'Unable to confirm payment.');
    if (!data?.id) {
      throw new AppError({
        category: 'permission',
        message: 'Payment update did not apply. Refresh and try again.',
      });
    }
    return fetchOrderById(orderId);
  },

  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string | null): Promise<Order> {
    const supabase = requireSupabaseClient();
    const userId = await requireUserId();
    const current = await ensureMutableOrder(orderId);
    const changedAt = new Date().toISOString();
    const trimmedNote = typeof note === 'string' ? note.trim() : '';

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({ status, updated_at: changedAt })
      .eq('id', orderId)
      .select('id,status')
      .maybeSingle();

    if (updateError) throw asDbError(updateError, 'Unable to update order status.');
    if (!updatedOrder?.id) {
      throw new AppError({
        category: 'permission',
        message: 'Order status update did not apply. Refresh and try again.',
      });
    }

    const { error: historyError } = await supabase.from('order_status_history').insert({
      order_id: orderId,
      status,
      changed_by: userId,
      note: trimmedNote || null,
      changed_at: changedAt,
    });

    if (historyError) {
      // Best-effort rollback to avoid persisting a status change without timeline history.
      try {
        await supabase.from('orders').update({ status: current.status, updated_at: new Date().toISOString() }).eq('id', orderId);
      } catch {}
      throw asDbError(historyError, 'Unable to write status history.');
    }

    return fetchOrderById(orderId);
  },
};
