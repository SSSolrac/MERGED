import { useMemo } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/ui';
import { formatCurrency } from '@/utils/currency';

export type TopItemChartDatum = {
  label: string;
  quantity: number;
  revenue: number;
  estimatedProfit?: number | null;
  marginPct?: number | null;
};

export const TopItemsChart = ({ title, data }: { title: string; data: TopItemChartDatum[] }) => {
  const chartData = useMemo(
    () =>
      data
        .map((item) => ({ ...item, estimatedProfit: item.estimatedProfit ?? null }))
        .sort((left, right) => right.quantity - left.quantity)
        .slice(0, 5),
    [data],
  );
  const totalQuantity = chartData.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const totalRevenue = chartData.reduce((sum, item) => sum + Math.max(0, item.revenue), 0);
  const marginLeader = useMemo(
    () => [...chartData].filter((item) => item.marginPct != null).sort((left, right) => (right.marginPct ?? 0) - (left.marginPct ?? 0))[0] ?? null,
    [chartData],
  );
  const barColors = ['#FF8FA3', '#FFB6C1', '#F472B6', '#F59E0B', '#22C55E'];

  return (
    <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="text-sm text-[#6B7280]">Always showing the top 5 shop items by quantity sold.</p>
        </div>
        {chartData.length ? <span className="rounded-full bg-[#FFE4E8] px-3 py-1 text-sm text-[#1F2937]">Top 5 only</span> : null}
      </div>
      {!chartData.length ? (
        <EmptyState title="Not enough data yet" message="Top-selling items will appear after completed orders or imported sales are available." />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border p-3">
              <p className="text-xs text-[#6B7280]">Best seller</p>
              <p className="font-semibold">{chartData[0]?.label}</p>
              <p className="text-sm text-[#6B7280]">{chartData[0]?.quantity.toLocaleString()} sold</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs text-[#6B7280]">Top 5 revenue</p>
              <p className="font-semibold">{formatCurrency(totalRevenue)}</p>
              <p className="text-sm text-[#6B7280]">{totalQuantity.toLocaleString()} total sold</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs text-[#6B7280]">Best margin in top 5</p>
              <p className="font-semibold">{marginLeader?.label ?? 'Cost data needed'}</p>
              <p className="text-sm text-[#6B7280]">{marginLeader?.marginPct == null ? '-' : `${marginLeader.marginPct.toFixed(1)}%`}</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <XAxis type="number" tickFormatter={(value: number) => value.toLocaleString()} />
                  <YAxis type="category" dataKey="label" width={150} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === 'quantity sold') return `${value.toLocaleString()} sold`;
                      return value;
                    }}
                  />
                  <Bar dataKey="quantity" name="quantity sold" radius={4}>
                    {chartData.map((item, index) => (
                      <Cell key={item.label} fill={barColors[index % barColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {chartData.map((item, index) => {
                const share = totalQuantity > 0 ? (Math.max(0, item.quantity) / totalQuantity) * 100 : 0;
                return (
                  <div key={item.label} className="rounded border p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">#{index + 1} {item.label}</p>
                        <p className="text-xs text-[#6B7280]">
                          {item.quantity.toLocaleString()} sold - {formatCurrency(item.revenue)} revenue
                        </p>
                      </div>
                      <strong>{item.quantity.toLocaleString()}</strong>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#FFE4E8]">
                      <div className="h-full rounded-full bg-[#FF8FA3]" style={{ width: `${Math.min(100, share)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-2">Item</th>
                  <th className="p-2">Qty Sold</th>
                  <th className="p-2">Revenue</th>
                  <th className="p-2">Est. Profit</th>
                  <th className="p-2">Margin</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((item) => (
                  <tr key={item.label} className="border-t">
                    <td className="p-2 font-medium">{item.label}</td>
                    <td className="p-2">{item.quantity.toLocaleString()}</td>
                    <td className="p-2">{formatCurrency(item.revenue)}</td>
                    <td className="p-2">{item.estimatedProfit == null ? 'Not enough data yet.' : formatCurrency(item.estimatedProfit)}</td>
                    <td className="p-2">{item.marginPct == null ? 'Not enough data yet.' : `${item.marginPct.toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
