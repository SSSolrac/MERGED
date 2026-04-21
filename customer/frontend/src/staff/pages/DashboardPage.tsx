import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertsPanel, DateRangeFilter, RecentOrdersTable, TopItemsChart } from '@/components/dashboard';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/utils/currency';
import type { DateRangePreset } from '@/types/dashboard';
import type { Order } from '@/types/order';

type ChartPreset = 'area' | 'line' | 'bar';
type GroupPreset = 'days' | 'weeks' | 'months';

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

const normalizeStatusValue = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');

const deriveAccountingParts = (order: Order) => {
  const status = normalizeStatusValue(order.status);
  const paymentStatus = normalizeStatusValue(order.paymentStatus);
  const isCancelled = status === 'cancelled';
  const isRefunded = status === 'refunded' || paymentStatus === 'refunded';
  const subtotal = Number.isFinite(order.subtotal) ? Math.max(0, order.subtotal) : 0;
  const discountTotal = Number.isFinite(order.discountTotal) ? Math.max(0, order.discountTotal) : 0;
  const totalAmount = resolveOrderAmount(order);
  const grossSales = Math.max(totalAmount + discountTotal, subtotal, totalAmount);
  const refunded = isRefunded ? (totalAmount > 0 ? totalAmount : Math.max(grossSales - discountTotal, 0)) : 0;
  const netSales = isCancelled ? 0 : Math.max(grossSales - discountTotal - refunded, 0);

  return {
    grossSales: isCancelled ? 0 : grossSales,
    discountTotal: isCancelled ? 0 : discountTotal,
    refunded,
    netSales,
  };
};

export const DashboardPage = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const { data, loading, error, selectedRange, setSelectedRange } = useDashboardData();
  const [chartPreset, setChartPreset] = useState<ChartPreset>('area');
  const [groupBy, setGroupBy] = useState<GroupPreset>('days');

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

  const topItemsForView = useMemo(() => {
    const fromOrders = new Map<string, number>();
    filteredOrders.forEach((order) => {
      (order.items ?? []).forEach((item) => {
        const label = item.itemName?.trim() || 'Unknown item';
        fromOrders.set(label, (fromOrders.get(label) ?? 0) + (Number.isFinite(item.quantity) ? item.quantity : 0));
      });
    });

    if (!fromOrders.size) {
      return (data?.topItems ?? []).map((item) => ({ label: item.itemName, value: item.quantity }));
    }

    return Array.from(fromOrders.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value }));
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
  const netSales = Math.max(0, grossSales - refundsTotal - discountsTotal);
  const costOfGoodsTotal = filteredOrders.reduce((sum, order) => sum + (Number.isFinite(order.costOfGoods) ? Math.max(0, order.costOfGoods ?? 0) : 0), 0);
  const netProfitEstimate = netSales - costOfGoodsTotal;

  const SummaryCard = ({ title, value, subtitle }: { title: string; value: string; subtitle: string }) => (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-slate-500">{subtitle}</p>
      <div className="mt-3 h-0.5 w-full bg-[#FF8FA3] opacity-70" />
    </div>
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
            <SummaryCard title="Gross sales" value={formatCurrency(grossSales)} subtitle={rangeLabel(selectedRange)} />
            <SummaryCard title="Refunds" value={formatCurrency(refundsTotal)} subtitle={rangeLabel(selectedRange)} />
            <SummaryCard title="Discounts" value={formatCurrency(discountsTotal)} subtitle={`${filteredOrders.length} filtered orders`} />
            <SummaryCard title="Net sales" value={formatCurrency(netSales)} subtitle={rangeLabel(selectedRange)} />
            <SummaryCard title="Net profit" value={formatCurrency(netProfitEstimate)} subtitle={`After menu item costs (${rangeLabel(selectedRange)})`} />
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
          <TopItemsChart title="Top Selling Items (Qty)" data={topItemsForView} />
        </div>
        <AlertsPanel alerts={data.alerts} />
      </div>

      <RecentOrdersTable title="Recent orders" rows={recentRows} />
    </div>
  );
};
