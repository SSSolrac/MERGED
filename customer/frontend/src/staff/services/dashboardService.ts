import { normalizeError } from '@/lib/errors';
import { asRecord, mapOrderItemRow, mapOrderRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import type { DashboardData, DateRangePreset } from '@/types/dashboard';
import type { Order } from '@/types/order';

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const DASHBOARD_CACHE_TTL_MS = 10000;
const dashboardCache = new Map<string, { ts: number; data: DashboardData }>();

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
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

const rangeStartMs = (range: DateRangePreset) => {
  if (range === 'all') return null;
  if (range === 'today') return startOfToday();
  const days = rangeToDays[range];
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start.getTime();
};

const orderTimestampMs = (order: Pick<Order, 'placedAt' | 'createdAt'>) => {
  const placedAtMs = new Date(order.placedAt || order.createdAt).getTime();
  if (Number.isFinite(placedAtMs)) return placedAtMs;
  const createdAtMs = new Date(order.createdAt).getTime();
  return Number.isFinite(createdAtMs) ? createdAtMs : NaN;
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeStatusValue = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
const isCancelledStatus = (value: unknown) => normalizeStatusValue(value) === 'cancelled';
const isRefundedStatus = (status: unknown, paymentStatus: unknown) => {
  const normalizedStatus = normalizeStatusValue(status);
  const normalizedPaymentStatus = normalizeStatusValue(paymentStatus);
  return normalizedStatus === 'refunded' || normalizedPaymentStatus === 'refunded';
};

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const toIsoAtTime = (value: string, hours: number, minutes: number) => {
  const dayKey = toDayKey(value);
  if (!dayKey) return '';
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${dayKey}T${hh}:${mm}:00.000Z`;
};

const filterOrdersByRange = (orders: Order[], range: DateRangePreset) => {
  const startMs = rangeStartMs(range);
  if (!Number.isFinite(startMs)) return orders;
  return orders.filter((order) => {
    const placedAt = orderTimestampMs(order);
    return Number.isFinite(placedAt) && placedAt >= (startMs as number);
  });
};

const fetchLiveOrdersForDashboard = async (range: DateRangePreset): Promise<Order[] | null> => {
  const supabase = requireSupabaseClient();
  const pageSize = 1000;
  const collected: Array<Record<string, unknown>> = [];
  const startMs = rangeStartMs(range);
  const startIso = startMs != null && Number.isFinite(startMs) ? new Date(startMs).toISOString() : null;
  let from = 0;

  while (true) {
    let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).range(from, from + pageSize - 1);
    if (startIso) query = query.gte('placed_at', startIso);

    const { data, error } = await query;
    if (error) return null;

    const batch = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    collected.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const mapped = collected.map(mapOrderRow);
  return filterOrdersByRange(mapped, range);
};

const fetchImportedSalesAsOrders = async (range: DateRangePreset): Promise<Order[]> => {
  const supabase = requireSupabaseClient();
  const pageSize = 1000;
  const rows: Array<Record<string, unknown>> = [];
  const startMs = rangeStartMs(range);
  const startIso = startMs != null && Number.isFinite(startMs) ? new Date(startMs).toISOString() : null;
  let from = 0;

  while (true) {
    let query = supabase
      .from('imported_sales_rows')
      .select('id, date, created_at, status, payment_method, sales_total, gross_sales, refunds_total, discounts_total, net_sales')
      .order('date', { ascending: false })
      .range(from, from + pageSize - 1);

    if (startIso) query = query.gte('date', startIso);

    const { data, error } = await query;
    if (error) return [];

    const batch = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const importedOrders: Order[] = [];

  rows.forEach((row, rowIndex) => {
    const occurredAt = String(row.date ?? row.created_at ?? '');
    if (!occurredAt) return;
    if (startMs != null && Number.isFinite(startMs)) {
      const parsedMs = new Date(occurredAt).getTime();
      if (!Number.isFinite(parsedMs) || parsedMs < startMs) return;
    }

    const statusRaw = normalizeStatusValue(row.status);
    if (statusRaw === 'cancelled') return;

    const gross = Math.max(0, asNumber(row.gross_sales, Math.max(asNumber(row.sales_total), asNumber(row.net_sales))));
    const discounts = Math.max(0, asNumber(row.discounts_total));
    const refunds = Math.max(0, asNumber(row.refunds_total));
    const net = Math.max(0, asNumber(row.net_sales, asNumber(row.sales_total, Math.max(gross - discounts - refunds, 0))));

    const effectiveGross = gross > 0 ? gross : Math.max(net + discounts + refunds, net);
    const mainTotal = Math.max(effectiveGross - refunds, 0);

    const baseIso = toIsoAtTime(occurredAt, 10, 0) || occurredAt;
    const dateKey = toDayKey(baseIso) || toDayKey(occurredAt) || `imported-${rowIndex}`;
    const baseId = String(row.id ?? `row-${rowIndex}`);
    const paymentMethodRaw = normalizeStatusValue(row.payment_method);
    const paymentMethod =
      paymentMethodRaw === 'qrph' || paymentMethodRaw === 'gcash' || paymentMethodRaw === 'maribank' || paymentMethodRaw === 'bdo' || paymentMethodRaw === 'cash'
        ? paymentMethodRaw
        : null;

    if (mainTotal > 0 || discounts > 0) {
      importedOrders.push({
        id: `import-${baseId}`,
        code: `IMP-${dateKey}-${rowIndex + 1}`,
        customerId: null,
        customerName: null,
        orderType: 'takeout',
        status: 'completed',
        paymentMethod,
        paymentStatus: 'paid',
        subtotal: roundMoney(effectiveGross),
        discountTotal: roundMoney(discounts),
        totalAmount: roundMoney(mainTotal),
        receiptImageUrl: null,
        notes: null,
        deliveryAddress: { sourceType: 'imported_sales_summary' },
        placedAt: baseIso,
        createdAt: baseIso,
        updatedAt: baseIso,
        items: [],
      });
    }

    if (refunds > 0) {
      const refundIso = toIsoAtTime(occurredAt, 10, 5) || baseIso;
      importedOrders.push({
        id: `import-refund-${baseId}`,
        code: `IMP-REFUND-${dateKey}-${rowIndex + 1}`,
        customerId: null,
        customerName: null,
        orderType: 'takeout',
        status: 'refunded',
        paymentMethod,
        paymentStatus: 'refunded',
        subtotal: roundMoney(refunds),
        discountTotal: 0,
        totalAmount: roundMoney(refunds),
        receiptImageUrl: null,
        notes: null,
        deliveryAddress: { sourceType: 'imported_sales_summary_refund' },
        placedAt: refundIso,
        createdAt: refundIso,
        updatedAt: refundIso,
        items: [],
      });
    }
  });

  return importedOrders;
};

const toDayKey = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const mapSalesTrend = (value: unknown): DashboardData['salesTrend'] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const r = asRecord(item) ?? {};
      const date = String(r.date ?? r.day ?? r.dayKey ?? r.label ?? '');
      const sales = Number(r.sales ?? r.amount ?? 0);
      return { date, sales: Number.isFinite(sales) ? roundMoney(Math.max(0, sales)) : 0 };
    })
    .filter((item) => Boolean(item.date));
};

const mapOrders = (value: unknown): Order[] => (Array.isArray(value) ? (value as unknown[]).map(mapOrderRow) : []);

const asTrimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const isImportedOrder = (order: Pick<Order, 'code'>) => asTrimmed(order.code).toUpperCase().startsWith('IMP-');

const attachOrderEmployees = async (orders: Order[]): Promise<Order[]> => {
  if (!orders.length) return orders;

  const supabase = requireSupabaseClient();
  const orderIds = orders.map((order) => order.id).filter((id): id is string => Boolean(id) && isUuid(id));
  if (!orderIds.length) return orders;

  const { data: historyRows, error: historyError } = await supabase
    .from('order_status_history')
    .select('order_id, changed_by, changed_at')
    .in('order_id', orderIds)
    .not('changed_by', 'is', null)
    .order('changed_at', { ascending: false });

  if (historyError || !Array.isArray(historyRows)) return orders;

  const changedByIds = Array.from(new Set(historyRows.map((row) => String(row.changed_by ?? '')).filter(Boolean)));
  if (!changedByIds.length) return orders;

  const { data: profileRows, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, role')
    .in('id', changedByIds)
    .in('role', ['owner', 'staff']);

  if (profilesError || !Array.isArray(profileRows)) return orders;

  const employeeById = new Map<string, string>(
    profileRows.map((row) => {
      const id = String(row.id ?? '');
      const name = asTrimmed(row.name) || 'Staff';
      return [id, name];
    }),
  );

  const employeeIdByOrderId = new Map<string, string>();
  for (const row of historyRows) {
    const orderId = String(row.order_id ?? '');
    const changedBy = String(row.changed_by ?? '');
    if (!orderId || !changedBy) continue;
    if (!employeeById.has(changedBy)) continue;
    if (!employeeIdByOrderId.has(orderId)) {
      employeeIdByOrderId.set(orderId, changedBy);
    }
  }

  return orders.map((order) => {
    const employeeId = employeeIdByOrderId.get(order.id) ?? null;
    return {
      ...order,
      employeeId,
      employeeName: employeeId ? employeeById.get(employeeId) ?? null : null,
    };
  });
};

const attachOrderItems = async (orders: Order[]): Promise<Order[]> => {
  if (!orders.length) return orders;

  const supabase = requireSupabaseClient();
  const orderIds = orders.map((order) => order.id).filter((id): id is string => Boolean(id) && isUuid(id));
  if (!orderIds.length) return orders;

  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .in('order_id', orderIds)
    .order('created_at', { ascending: true });

  if (error || !Array.isArray(data)) return orders;

  const itemsByOrderId = new Map<string, Order['items']>();
  data.map(mapOrderItemRow).forEach((item) => {
    const list = itemsByOrderId.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrderId.set(item.orderId, list);
  });

  return orders.map((order) => ({
    ...order,
    items: itemsByOrderId.get(order.id) ?? order.items ?? [],
  }));
};

const attachOrderCosts = async (orders: Order[]): Promise<Order[]> => {
  if (!orders.length) return orders;

  const supabase = requireSupabaseClient();
  const orderIds = orders.map((order) => order.id).filter((id): id is string => Boolean(id) && isUuid(id));
  if (!orderIds.length) return orders;

  const { data: orderItemRows, error: orderItemsError } = await supabase
    .from('order_items')
    .select('order_id, menu_item_id, quantity')
    .in('order_id', orderIds);

  if (orderItemsError || !Array.isArray(orderItemRows)) return orders;

  const menuItemIds = Array.from(
    new Set(orderItemRows.map((row) => asTrimmed(row.menu_item_id)).filter((id) => Boolean(id) && isUuid(id))),
  );

  const { data: menuItemRows, error: menuItemsError } = menuItemIds.length
    ? await supabase.from('menu_items').select('id, cost').in('id', menuItemIds)
    : { data: [], error: null };

  if (menuItemsError) return orders;

  const costByMenuItemId = new Map<string, number>(
    (Array.isArray(menuItemRows) ? menuItemRows : []).map((row) => [asTrimmed(row.id), Math.max(0, asNumber(row.cost, 0))]),
  );

  const costByOrderId = orderItemRows.reduce<Map<string, number>>((acc, row) => {
    const orderId = asTrimmed(row.order_id);
    const menuItemId = asTrimmed(row.menu_item_id);
    const quantity = Math.max(1, asNumber(row.quantity, 1));
    if (!orderId || !menuItemId) return acc;
    const lineCost = (costByMenuItemId.get(menuItemId) ?? 0) * quantity;
    acc.set(orderId, roundMoney((acc.get(orderId) ?? 0) + lineCost));
    return acc;
  }, new Map<string, number>());

  return orders.map((order) => ({
    ...order,
    costOfGoods: isCancelledStatus(order.status) ? 0 : roundMoney(costByOrderId.get(order.id) ?? 0),
  }));
};

const buildTopItemsFromOrders = (orders: Order[]): DashboardData['topItems'] => {
  const totals = new Map<string, { quantity: number; revenue: number }>();

  orders.forEach((order) => {
    if (isCancelledStatus(order.status)) return;
    (order.items ?? []).forEach((item) => {
      const itemName = asTrimmed(item.itemName) || 'Unknown item';
      const quantity = Math.max(0, asNumber(item.quantity));
      if (quantity <= 0) return;
      const current = totals.get(itemName) ?? { quantity: 0, revenue: 0 };
      const lineTotal = Math.max(0, asNumber(item.lineTotal, Math.max(0, asNumber(item.unitPrice) - asNumber(item.discountAmount)) * quantity));
      current.quantity += quantity;
      current.revenue += lineTotal;
      totals.set(itemName, current);
    });
  });

  return Array.from(totals.entries())
    .sort(([, a], [, b]) => b.quantity - a.quantity)
    .slice(0, 10)
    .map(([itemName, item]) => ({ itemName, quantity: item.quantity, revenue: roundMoney(item.revenue) }));
};

const fetchInventoryAlerts = async (): Promise<DashboardData['alerts']> => {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, name, quantity_on_hand, reorder_level, inventory_categories(name)')
    .eq('is_active', true)
    .order('quantity_on_hand', { ascending: true })
    .limit(20);

  if (error || !Array.isArray(data)) return [];

  return data
    .filter((row) => asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level))
    .slice(0, 10)
    .map((row) => {
      const category = asRecord(row.inventory_categories);
      const categoryName = asTrimmed(category?.name) || 'Uncategorized';
      const itemName = asTrimmed(row.name) || 'Inventory item';
      return {
        id: asTrimmed(row.id) || itemName,
        type: 'warning',
        title: 'Low stock',
        message: `${itemName} (${categoryName}) is low on stock`,
      };
    });
};

const mapDashboardSummary = (payload: unknown): DashboardData => {
  const base = (Array.isArray(payload) ? payload[0] : payload) as unknown;
  const row = asRecord(base) ?? {};

  // Preferred: RPC already returns the canonical DashboardData shape (camelCase).
  const salesNested = asRecord(row.sales);
  const ordersNested = asRecord(row.orders);
  if (salesNested && ordersNested) {
    return {
      sales: {
        today: Number(salesNested.today ?? 0),
        rangeTotal: Number(salesNested.rangeTotal ?? 0),
        averageOrderValue: Number(salesNested.averageOrderValue ?? 0),
      },
      orders: {
        today: Number(ordersNested.today ?? 0),
        rangeTotal: Number(ordersNested.rangeTotal ?? 0),
        pending: Number(ordersNested.pending ?? 0),
        preparing: Number(ordersNested.preparing ?? 0),
        ready: Number(ordersNested.ready ?? 0),
        outForDelivery: Number(ordersNested.outForDelivery ?? 0),
        completed: Number(ordersNested.completed ?? 0),
        cancelled: Number(ordersNested.cancelled ?? 0),
      },
      topItems: Array.isArray(row.topItems)
        ? (row.topItems as unknown[]).map((item) => {
            const r = asRecord(item) ?? {};
            return { itemName: String(r.itemName ?? ''), quantity: Number(r.quantity ?? 0), revenue: Number(r.revenue ?? 0) };
          })
        : [],
      salesTrend: mapSalesTrend(row.salesTrend),
      rangeOrders: mapOrders(row.rangeOrders ?? row.range_orders ?? row.ordersList ?? row.orders_list),
      recentOrders: mapOrders(row.recentOrders),
      alerts: Array.isArray(row.alerts)
        ? (row.alerts as unknown[]).map((item) => {
            const r = asRecord(item) ?? {};
            return { id: String(r.id ?? ''), message: String(r.message ?? ''), type: (r.type as DashboardData['alerts'][number]['type']) ?? 'info' };
          })
        : [],
    };
  }

  // Fallback: RPC returns a flat, snake_case row.
  const topItemsRaw = (row.top_items ?? row.topItems) as unknown;
  const recentOrdersRaw = (row.recent_orders ?? row.recentOrders) as unknown;
  const alertsRaw = (row.alerts ?? row.alerts) as unknown;
  const salesTrendRaw = (row.sales_trend ?? row.salesTrend) as unknown;

  return {
    sales: {
      today: Number(row.sales_today ?? row.today_sales ?? 0),
      rangeTotal: Number(row.sales_range_total ?? row.range_sales ?? 0),
      averageOrderValue: Number(row.average_order_value ?? row.avg_order_value ?? 0),
    },
    orders: {
      today: Number(row.orders_today ?? 0),
      rangeTotal: Number(row.orders_range_total ?? row.orders_total ?? 0),
      pending: Number(row.orders_pending ?? 0),
      preparing: Number(row.orders_preparing ?? 0),
      ready: Number(row.orders_ready ?? 0),
      outForDelivery: Number(row.orders_out_for_delivery ?? row.orders_outForDelivery ?? 0),
      completed: Number(row.orders_completed ?? 0),
      cancelled: Number(row.orders_cancelled ?? 0),
    },
    topItems: Array.isArray(topItemsRaw)
      ? (topItemsRaw as unknown[]).map((item) => {
          const r = asRecord(item) ?? {};
          return {
            itemName: String(r.item_name ?? r.itemName ?? ''),
            quantity: Number(r.quantity ?? 0),
            revenue: Number(r.revenue ?? 0),
          };
        })
      : [],
    salesTrend: mapSalesTrend(salesTrendRaw),
    rangeOrders: mapOrders(row.range_orders ?? row.rangeOrders ?? row.orders_list ?? row.ordersList),
    recentOrders: mapOrders(recentOrdersRaw),
    alerts: Array.isArray(alertsRaw)
      ? (alertsRaw as unknown[]).map((item) => {
          const r = asRecord(item) ?? {};
          return { id: String(r.id ?? ''), message: String(r.message ?? ''), type: (r.type as DashboardData['alerts'][number]['type']) ?? 'info' };
        })
      : [],
  };
};

const summarizeOrders = (orders: Order[]) => {
  const todayStart = startOfToday();
  const dayTotals = new Map<string, number>();

  let salesToday = 0;
  let salesRange = 0;
  let ordersToday = 0;
  let pending = 0;
  let preparing = 0;
  let ready = 0;
  let outForDelivery = 0;
  let completed = 0;
  let cancelled = 0;

  for (const order of orders) {
    const subtotal = Number.isFinite(order.subtotal) ? Math.max(0, order.subtotal) : 0;
    const discountTotal = Number.isFinite(order.discountTotal) ? Math.max(0, order.discountTotal) : 0;
    const totalAmount = Number.isFinite(order.totalAmount) ? Math.max(0, order.totalAmount) : 0;
    const grossSales = subtotal > 0 ? subtotal : Math.max(totalAmount + discountTotal, totalAmount);
    const refunded = isRefundedStatus(order.status, order.paymentStatus);
    const refundedAmount = refunded ? (totalAmount > 0 ? totalAmount : Math.max(grossSales - discountTotal, 0)) : 0;
    const isCancelled = isCancelledStatus(order.status);
    const netSales = isCancelled ? 0 : Math.max(grossSales - discountTotal - refundedAmount, 0);
    const placedAt = new Date(order.placedAt || order.createdAt).getTime();
    const dayKey = toDayKey(order.placedAt || order.createdAt);

    salesRange += netSales;
    if (Number.isFinite(placedAt) && placedAt >= todayStart) {
      salesToday += netSales;
      ordersToday += 1;
    }

    if (dayKey) {
      dayTotals.set(dayKey, (dayTotals.get(dayKey) ?? 0) + netSales);
    }

    if (order.status === 'pending') pending += 1;
    else if (order.status === 'preparing') preparing += 1;
    else if (order.status === 'ready') ready += 1;
    else if (order.status === 'out_for_delivery') outForDelivery += 1;
    else if (order.status === 'completed' || order.status === 'delivered') completed += 1;
    else if (order.status === 'cancelled') cancelled += 1;
  }

  const rangeTotal = orders.length;
  const salesTrend = Array.from(dayTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sales]) => ({ date, sales: roundMoney(sales) }));

  return {
    sales: {
      today: roundMoney(salesToday),
      rangeTotal: roundMoney(salesRange),
      averageOrderValue: rangeTotal > 0 ? roundMoney(salesRange / rangeTotal) : 0,
    },
    orders: {
      today: ordersToday,
      rangeTotal,
      pending,
      preparing,
      ready,
      outForDelivery,
      completed,
      cancelled,
    },
    salesTrend,
    recentOrders: orders.slice(0, 10),
  };
};

const cloneDashboardData = (data: DashboardData): DashboardData => ({
  sales: { ...data.sales },
  orders: { ...data.orders },
  topItems: data.topItems.map((item) => ({ ...item })),
  salesTrend: data.salesTrend.map((item) => ({ ...item })),
  rangeOrders: data.rangeOrders.map((order) => ({ ...order })),
  recentOrders: data.recentOrders.map((order) => ({ ...order })),
  alerts: data.alerts.map((alert) => ({ ...alert })),
});

const emptyDashboardData = (): DashboardData => ({
  sales: { today: 0, rangeTotal: 0, averageOrderValue: 0 },
  orders: { today: 0, rangeTotal: 0, pending: 0, preparing: 0, ready: 0, outForDelivery: 0, completed: 0, cancelled: 0 },
  topItems: [],
  salesTrend: [],
  rangeOrders: [],
  recentOrders: [],
  alerts: [],
});

const dedupeOrdersById = (orders: Order[]) => {
  const seen = new Set<string>();
  return orders.filter((order) => {
    const fallbackKey = `${asTrimmed(order.code)}-${asTrimmed(order.placedAt || order.createdAt)}`;
    const key = asTrimmed(order.id) || fallbackKey;
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const dashboardService = {
  async getDashboardData(range: DateRangePreset, options: { includeFinancialSummary?: boolean } = {}): Promise<DashboardData> {
    const includeFinancialSummary = options.includeFinancialSummary !== false;
    const cacheKey = `${range}:${includeFinancialSummary ? 'financial' : 'operations'}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < DASHBOARD_CACHE_TTL_MS) {
      return cloneDashboardData(cached.data);
    }

    const supabase = requireSupabaseClient();

    const [rpcResult, liveOrdersFromTable, importedOrders, inventoryAlerts] = await Promise.all([
      includeFinancialSummary ? supabase.rpc('dashboard_summary', { range_key: range }) : Promise.resolve({ data: null, error: null }),
      fetchLiveOrdersForDashboard(range).catch(() => null),
      includeFinancialSummary ? fetchImportedSalesAsOrders(range).catch(() => []) : Promise.resolve([]),
      fetchInventoryAlerts().catch(() => []),
    ]);

    if (rpcResult.error) throw normalizeError(rpcResult.error, { fallbackMessage: 'Unable to load dashboard summary.' });

    const mapped = includeFinancialSummary ? mapDashboardSummary(rpcResult.data) : emptyDashboardData();
    const rpcDerivedOrders = mapped.rangeOrders.length ? mapped.rangeOrders : mapped.recentOrders;
    const rpcLiveOrders = rpcDerivedOrders.filter((order) => !isImportedOrder(order));
    const liveOrders = liveOrdersFromTable ?? (rpcLiveOrders.length ? rpcLiveOrders : null);
    if (!liveOrders && importedOrders.length === 0) {
      const fallback = {
        ...mapped,
        rangeOrders: mapped.rangeOrders.length ? mapped.rangeOrders : mapped.recentOrders,
      };
      fallback.alerts = fallback.alerts.length ? fallback.alerts : inventoryAlerts;
      dashboardCache.set(cacheKey, { ts: Date.now(), data: fallback });
      return cloneDashboardData(fallback);
    }

    const liveOrdersWithEmployee = liveOrders ? await attachOrderEmployees(liveOrders) : [];
    const liveOrdersWithItems = await attachOrderItems(liveOrdersWithEmployee);
    const liveOrdersWithRelations = await attachOrderCosts(liveOrdersWithItems);
    const sortedLiveOrders = [...liveOrdersWithRelations].sort((a, b) => orderTimestampMs(b) - orderTimestampMs(a));
    const combinedOrders = dedupeOrdersById([...sortedLiveOrders, ...importedOrders]).sort((a, b) => orderTimestampMs(b) - orderTimestampMs(a));

    const salesSummary = summarizeOrders(combinedOrders);
    const liveOrderSummary = summarizeOrders(sortedLiveOrders);
    const liveRecentOrders = sortedLiveOrders.slice(0, 10);
    const resolved = {
      ...mapped,
      sales: salesSummary.sales,
      orders: liveOrderSummary.orders,
      salesTrend: salesSummary.salesTrend,
      topItems: mapped.topItems.length ? mapped.topItems : buildTopItemsFromOrders(combinedOrders),
      rangeOrders: combinedOrders,
      recentOrders: liveRecentOrders.length ? liveRecentOrders : combinedOrders.slice(0, 10),
      alerts: mapped.alerts.length ? mapped.alerts : inventoryAlerts,
    };
    dashboardCache.set(cacheKey, { ts: Date.now(), data: resolved });
    return cloneDashboardData(resolved);
  },
};
