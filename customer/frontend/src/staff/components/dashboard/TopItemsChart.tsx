import { useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/ui';
import { formatCurrency } from '@/utils/currency';

export type TopItemChartDatum = {
  label: string;
  quantity: number;
  revenue: number;
  estimatedProfit?: number | null;
  marginPct?: number | null;
};

type TopItemsMetric = 'quantity' | 'revenue' | 'estimatedProfit';

const metricOptions: Array<{ key: TopItemsMetric; label: string; barLabel: string }> = [
  { key: 'quantity', label: 'Qty', barLabel: 'quantity sold' },
  { key: 'revenue', label: 'Revenue', barLabel: 'revenue' },
  { key: 'estimatedProfit', label: 'Profit', barLabel: 'estimated profit' },
];

export const TopItemsChart = ({ title, data }: { title: string; data: TopItemChartDatum[] }) => {
  const [metric, setMetric] = useState<TopItemsMetric>('quantity');
  const activeMetric = metricOptions.find((option) => option.key === metric) ?? metricOptions[0];
  const chartData = useMemo(
    () => data.map((item) => ({ ...item, estimatedProfit: item.estimatedProfit ?? 0 })),
    [data],
  );

  return (
    <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="text-sm text-[#6B7280]">Switch between quantity, revenue, and estimated profit where cost data exists.</p>
        </div>
        {data.length ? (
          <div className="flex rounded-lg border bg-white p-1">
            {metricOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`rounded-md px-3 py-1 text-sm ${metric === option.key ? 'bg-[#FF8FA3] text-white' : 'text-[#4B5563] hover:bg-[#FFF3F5]'}`}
                onClick={() => setMetric(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {!data.length ? (
        <EmptyState title="Not enough data yet" message="Top-selling items will appear after completed orders or imported sales are available." />
      ) : (
        <>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 16 }}>
                <XAxis
                  type="number"
                  tickFormatter={(value: number) => (metric === 'quantity' ? value.toLocaleString() : formatCurrency(value).replace('.00', ''))}
                />
                <YAxis type="category" dataKey="label" width={150} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'revenue' || name === 'estimated profit') return formatCurrency(value);
                    return value;
                  }}
                />
                <Bar dataKey={metric} name={activeMetric.barLabel} fill="#2B7A87" radius={4} />
              </BarChart>
            </ResponsiveContainer>
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
                {data.map((item) => (
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
