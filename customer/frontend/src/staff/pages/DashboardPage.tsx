import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertsPanel, DateRangeFilter, RecentOrdersTable, TopItemsChart, type TopItemChartDatum } from '@/components/dashboard';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/utils/currency';
import type { DateRangePreset } from '@/types/dashboard';
import type { Order } from '@/types/order';

type ChartPreset = 'area' | 'line' | 'bar';
type GroupPreset = 'days' | 'weeks' | 'months';
type FinancialCard = 'gross' | 'refunds' | 'discounts' | 'net' | 'profit';

const toSafeDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDayKey = (value: string) => {
  const date = toSafeDate(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toMonthKey = (value: string) => {
  const date = toSafeDate(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const toWeekKey = (value: string) => {
  const date = toSafeDate(value);
  if (!date) return '';
  const copy = new Date(date);
  const day = copy.getDay();
  const mondayOffset = (day + 6) % 7;
  copy.setDate(copy.getDate() - mondayOffset);
  return toDayKey(copy.toISOString());
};

const labelFromGroupKey = (groupBy: GroupPreset, key: string) => {
  if (groupBy === 'months') {
    const [year, month] = key.split('-').map((value) => Number(value));
    if (!Number.isFinite(year) || !Number.isFinite(month)) return key;
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  const [year, month, day] = key.split('-').map((value) => Number(value));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return key;
  const date = new Date(year, month - 1, day);
  const baseLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return groupBy === 'weeks' ? `Week of ${baseLabel}` : baseLabel;
};

const resolveOrderAmount = (order: Order) => {
  const safeTotal = Number.isFinite(order.totalAmount) ? Math.max(0, order.totalAmount) : 0;
  if (safeTotal > 0) return safeTotal;

  const itemTotal = (order.items ?? []).reduce((sum, item) => {
    const lineTotal = Number.isFinite(item.lineTotal) ? item.lineTotal : 0;
    if (lineTotal > 0) return sum + lineTotal;
    const unitPrice = Number.isFinite(item.unitPrice) ? Math.max(0, item.unitPrice) : 0;
    const discountAmount = Number.isFinite(item.discountAmount) ? Math.max(0, item.discountAmount) : 0;
    const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    return sum + Math.max(0, unitPrice - discountAmount) * quantity;
  }, 0);
  if (itemTotal > 0) return itemTotal;

  const subtotal = Number.isFinite(order.subtotal) ? Math.max(0, order.subtotal) : 0;
  const discount = Number.isFinite(order.discountTotal) ? Math.max(0, order.discountTotal) : 0;
  return Math.max(0, subtotal - discount);
};

const asMoney = (value: unknown) => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) / 100 : 0;
};
const roundCurrency = asMoney;

const deliveryFeeForOrder = (order: Order) => {
  if (order.orderType !== 'delivery') return 0;
  const address = order.deliveryAddress;
  if (address && typeof address === 'object' && !Array.isArray(address)) {
    const record = address as Record<string, unknown>;
    const savedFee = asMoney(record.deliveryFee ?? record.delivery_fee);
    if (savedFee > 0) return savedFee;
  }
  return Math.max(0, asMoney(order.totalAmount) - Math.max(0, asMoney(order.subtotal) - asMoney(order.discountTotal)));
};

const normalizeStatusValue = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');

const deriveAccountingParts = (order: Order) => {
  const status = normalizeStatusValue(order.status);
  const paymentStatus = normalizeStatusValue(order.paymentStatus);
  const isCancelled = status === 'cancelled';
  const isRefunded = status === 'refunded' || paymentStatus === 'refunded';
  const subtotal = Number.isFinite(order.subtotal) ? Math.max(0, order.subtotal) : 0;
  const discountTotal = Number.isFinite(order.discountTotal) ? Math.max(0, order.discountTotal) : 0;
  const totalAmount = resolveOrderAmount(order);
  const deliveryFee = deliveryFeeForOrder(order);
  const grossSales = Math.max(subtotal, totalAmount + discountTotal - deliveryFee, totalAmount - deliveryFee);
  const refunded = isRefunded ? (totalAmount > 0 ? totalAmount : Math.max(grossSales - discountTotal, 0)) : 0;
  const cancellations = isCancelled ? Math.max(grossSales - discountTotal + deliveryFee, 0) : 0;
  const netSales = isCancelled ? 0 : Math.max(grossSales - discountTotal + deliveryFee - refunded, 0);

  return {
    grossSales: isCancelled ? 0 : grossSales,
    discountTotal: isCancelled ? 0 : discountTotal,
    deliveryFee: isCancelled ? 0 : deliveryFee,
    refunded,
    cancellations,
    netSales,
  };
};

export const DashboardPage = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const { data, loading, error, selectedRange, setSelectedRange } = useDashboardData();
  const [chartPreset, setChartPreset] = useState<ChartPreset>('area');
  const [groupBy, setGroupBy] = useState<GroupPreset>('days');
  const [selectedFinancialCard, setSelectedFinancialCard] = useState<FinancialCard>('gross');

  const rangeLabel = (preset: DateRangePreset) => {
    const map: Record<DateRangePreset, string> = {
      today: 'Today',
      '7d': 'Last 7 days',
      '30d': 'Last 30 days',
      '90d': 'Last 90 days',
      '3m': 'Last 3 months',
      '6m': 'Last 6 months',
      '1y': 'Last 1 year',
      all: 'All time',
    };
    return map[preset];
  };

  const allOrders = useMemo(() => {
    if (!data) return [];
    return data.rangeOrders.length ? data.rangeOrders : data.recentOrders;
  }, [data]);

  const filteredOrders = useMemo(() => allOrders, [allOrders]);

  const salesSeries = useMemo(() => {
    const totals = new Map<string, number>();
    filteredOrders.forEach((order) => {
      const accounting = deriveAccountingParts(order);
      const source = order.placedAt || order.createdAt;
      const key = groupBy === 'months' ? toMonthKey(source) : groupBy === 'weeks' ? toWeekKey(source) : toDayKey(source);
      if (!key) return;
      totals.set(key, (totals.get(key) ?? 0) + accounting.grossSales);
    });

    return Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, sales]) => ({
        label: labelFromGroupKey(groupBy, key),
        sales,
      }));
  }, [filteredOrders, groupBy]);

  const topItemsForView = useMemo<TopItemChartDatum[]>(() => {
    const fromOrders = new Map<string, { quantity: number; revenue: number; estimatedCost: number; hasCostData: boolean }>();
    filteredOrders.forEach((order) => {
      const orderRevenue = (order.items ?? []).reduce((sum, item) => {
        const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
        const lineTotal = Number.isFinite(item.lineTotal) && item.lineTotal > 0 ? item.lineTotal : Math.max(0, item.unitPrice - item.discountAmount) * quantity;
        return sum + lineTotal;
      }, 0);
      const orderCost = Number.isFinite(order.costOfGoods) ? Math.max(0, order.costOfGoods ?? 0) : 0;
      (order.items ?? []).forEach((item) => {
        const label = item.itemName?.trim() || 'Unknown item';
        const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
        const revenue = Number.isFinite(item.lineTotal) && item.lineTotal > 0 ? item.lineTotal : Math.max(0, item.unitPrice - item.discountAmount) * quantity;
        const allocatedCost = orderCost > 0 && orderRevenue > 0 ? (orderCost * revenue) / orderRevenue : 0;
        const current = fromOrders.get(label) ?? { quantity: 0, revenue: 0, estimatedCost: 0, hasCostData: false };
        current.quantity += quantity;
        current.revenue += revenue;
        current.estimatedCost += allocatedCost;
        current.hasCostData = current.hasCostData || allocatedCost > 0;
        fromOrders.set(label, current);
      });
    });

    if (!fromOrders.size) {
      return (data?.topItems ?? []).map((item) => ({
        label: item.itemName,
        quantity: item.quantity,
        revenue: item.revenue,
        estimatedProfit: null,
        marginPct: null,
      }));
    }

    return Array.from(fromOrders.entries())
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, 10)
      .map(([label, item]) => {
        const estimatedProfit = item.hasCostData ? roundCurrency(item.revenue - item.estimatedCost) : null;
        return {
          label,
          quantity: item.quantity,
          revenue: roundCurrency(item.revenue),
          estimatedProfit,
          marginPct: estimatedProfit == null || item.revenue <= 0 ? null : (estimatedProfit / item.revenue) * 100,
        };
      });
  }, [data, filteredOrders]);

  const recentRows = useMemo(
    () =>
      [...(data?.recentOrders ?? [])]
        .sort((a, b) => new Date(b.placedAt || b.createdAt).getTime() - new Date(a.placedAt || a.createdAt).getTime())
        .slice(0, 10),
    [data?.recentOrders],
  );

  if (loading) return <p>Loading dashboard...</p>;
  if (error || !data) return <p className="text-red-600">{error || 'Error'}</p>;

  const grossSales = filteredOrders.reduce((sum, order) => sum + deriveAccountingParts(order).grossSales, 0);
  const refundsTotal = filteredOrders.reduce((sum, order) => sum + deriveAccountingParts(order).refunded, 0);
  const discountsTotal = filteredOrders.reduce((sum, order) => sum + deriveAccountingParts(order).discountTotal, 0);
  const deliveryFeesTotal = filteredOrders.reduce((sum, order) => sum + deriveAccountingParts(order).deliveryFee, 0);
  const cancellationsTotal = filteredOrders.reduce((sum, order) => sum + deriveAccountingParts(order).cancellations, 0);
  const netSales = filteredOrders.reduce((sum, order) => sum + deriveAccountingParts(order).netSales, 0);
  const costOfGoodsTotal = filteredOrders.reduce((sum, order) => sum + (Number.isFinite(order.costOfGoods) ? Math.max(0, order.costOfGoods ?? 0) : 0), 0);
  const netProfitEstimate = netSales - costOfGoodsTotal;
  const profitMarginPct = costOfGoodsTotal > 0 && netSales > 0 ? (netProfitEstimate / netSales) * 100 : null;
  const hasCostData = costOfGoodsTotal > 0;
  const midpoint = Math.ceil(salesSeries.length / 2);
  const earlierSales = salesSeries.slice(0, midpoint).reduce((sum, point) => sum + point.sales, 0);
  const laterSales = salesSeries.slice(midpoint).reduce((sum, point) => sum + point.sales, 0);
  const insightMessages = [
    filteredOrders.length >= 2 && laterSales < earlierSales ? 'Profit was lower because sales volume dropped.' : null,
    hasCostData && profitMarginPct != null && profitMarginPct < 20 && grossSales > 0 ? 'High sales but low profit may indicate high ingredient cost.' : null,
    'Not enough data yet to link waste changes to profit.',
  ].filter(Boolean) as string[];

  const SummaryCard = ({ title, value, subtitle, cardKey }: { title: string; value: string; subtitle: string; cardKey: FinancialCard }) => (
    <button
      type="button"
      className={`rounded-lg border bg-white p-4 text-left shadow-sm transition-colors hover:bg-[#FFF3F5] ${
        selectedFinancialCard === cardKey ? 'border-[#2B7A87] ring-2 ring-[#2B7A87]/20' : ''
      }`}
      onClick={() => setSelectedFinancialCard(cardKey)}
    >
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-slate-500">{subtitle}</p>
      <div className="mt-3 h-0.5 w-full bg-[#FF8FA3] opacity-70" />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Dashboard Overview</p>
            <p className="text-xs text-slate-500">
              {isOwner ? 'A quick performance overview using your Supabase dashboard summary.' : 'Operational overview for active orders and shop activity.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter value={selectedRange} onChange={setSelectedRange} variant="select" />
          </div>
        </div>
      </div>

      {isOwner ? (
        <>
          <div className="grid gap-3 lg:grid-cols-5">
            <SummaryCard cardKey="gross" title="Gross sales" value={formatCurrency(grossSales)} subtitle={rangeLabel(selectedRange)} />
            <SummaryCard cardKey="refunds" title="Refunds" value={formatCurrency(refundsTotal + cancellationsTotal)} subtitle="Refunds and cancellations" />
            <SummaryCard cardKey="discounts" title="Discounts" value={formatCurrency(discountsTotal)} subtitle={`${filteredOrders.length} filtered orders`} />
            <SummaryCard cardKey="net" title="Net sales" value={formatCurrency(netSales)} subtitle={rangeLabel(selectedRange)} />
            <SummaryCard
              cardKey="profit"
              title="Net profit"
              value={hasCostData ? formatCurrency(netProfitEstimate) : 'Not enough data yet.'}
              subtitle={hasCostData ? `After menu item costs (${rangeLabel(selectedRange)})` : 'Cost data unavailable'}
            />
          </div>

          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">Sales Breakdown</h3>
                <p className="text-sm text-[#6B7280]">Selected card: {selectedFinancialCard.replaceAll('_', ' ')}</p>
              </div>
              <p className="text-sm text-[#6B7280]">{filteredOrders.length} order{filteredOrders.length === 1 ? '' : 's'} in range</p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border p-3">
                <p className="text-xs text-[#6B7280]">Gross sales</p>
                <p className="font-semibold">{formatCurrency(grossSales)}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-[#6B7280]">Discounts</p>
                <p className="font-semibold">-{formatCurrency(discountsTotal)}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-[#6B7280]">Delivery fees</p>
                <p className="font-semibold">{formatCurrency(deliveryFeesTotal)}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-[#6B7280]">Refunds / cancellations</p>
                <p className="font-semibold">-{formatCurrency(refundsTotal + cancellationsTotal)}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-[#6B7280]">Net sales</p>
                <p className="font-semibold">{formatCurrency(netSales)}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-[#6B7280]">Cost estimate</p>
                <p className="font-semibold">{hasCostData ? formatCurrency(costOfGoodsTotal) : 'Not enough data yet.'}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-[#6B7280]">Profit estimate</p>
                <p className="font-semibold">{hasCostData ? formatCurrency(netProfitEstimate) : 'Not enough data yet.'}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-[#6B7280]">Margin</p>
                <p className="font-semibold">{profitMarginPct == null ? 'Not enough data yet.' : `${profitMarginPct.toFixed(1)}%`}</p>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Insights</p>
              <div className="mt-2 space-y-1 text-sm text-[#6B7280]">
                {insightMessages.length ? insightMessages.map((message) => <p key={message}>{message}</p>) : <p>Not enough data yet.</p>}
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">Gross sales</h3>
                <p className="text-xs text-slate-500">Filtered by date selection.</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-slate-600">
                  <span>Chart</span>
                  <select className="bg-transparent outline-none" value={chartPreset} onChange={(event) => setChartPreset(event.target.value as ChartPreset)}>
                    <option value="area">Area</option>
                    <option value="line">Line</option>
                    <option value="bar">Bar</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-slate-600">
                  <span>Group</span>
                  <select className="bg-transparent outline-none" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupPreset)}>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-4 h-72">
              {salesSeries.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-slate-500">No sales data available for this filter yet.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {chartPreset === 'line' ? (
                    <LineChart data={salesSeries} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(value: number) => formatCurrency(value).replace('.00', '')} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Line type="monotone" dataKey="sales" stroke="#FF8FA3" strokeWidth={2} dot={false} />
                    </LineChart>
                  ) : chartPreset === 'bar' ? (
                    <BarChart data={salesSeries} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(value: number) => formatCurrency(value).replace('.00', '')} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="sales" fill="#FF8FA3" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
                    <AreaChart data={salesSeries} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <defs>
                        <linearGradient id="grossSalesFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FF8FA3" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#FF8FA3" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(value: number) => formatCurrency(value).replace('.00', '')} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Area type="monotone" dataKey="sales" stroke="#FF8FA3" fill="url(#grossSalesFill)" strokeWidth={2} />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TopItemsChart title="Top Selling Items" data={topItemsForView} />
        </div>
        <AlertsPanel alerts={data.alerts} />
      </div>

      <RecentOrdersTable title="Recent orders" rows={recentRows} />
    </div>
  );
};
