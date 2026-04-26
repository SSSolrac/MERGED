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

export const TopItemsChart = ({ title, data }: { title: string; data: TopItemChartDatum[] }) => (
  <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
    <div>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-[#6B7280]">Quantity sold, revenue, and estimated profit where cost data exists.</p>
    </div>
    {!data.length ? (
      <EmptyState title="Not enough data yet" message="Top-selling items will appear after completed orders or imported sales are available." />
    ) : (
      <>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
              <XAxis type="number" />
              <YAxis type="category" dataKey="label" width={150} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'revenue' || name === 'estimatedProfit') return formatCurrency(value);
                  return value;
                }}
              />
              <Bar dataKey="quantity" name="quantity sold" fill="#2B7A87" radius={4} />
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
