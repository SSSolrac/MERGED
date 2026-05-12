import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const palette = ['#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#2563eb', '#14b8a6', '#f97316', '#a855f7'];

export const OrderStatusChart = ({ data }: { data: Array<{ status: string; total: number }> }) => (
  <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
    <h3 className="font-medium">Orders by Status</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="total" nameKey="status" outerRadius={90}>
            {data.map((entry, index) => <Cell key={entry.status} fill={palette[index % palette.length]} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  </section>
);
