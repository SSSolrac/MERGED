import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '@/types/dashboard';

export const SalesTrendChart = ({ data }: { data: TrendPoint[] }) => (
  <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
    <h3 className="font-medium">Sales Trend</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
          <Line type="monotone" dataKey="sales" stroke="#4f46e5" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </section>
);
