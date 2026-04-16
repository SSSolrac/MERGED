import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export const TopItemsChart = ({ title, data }: { title: string; data: Array<{ label: string; value: number }> }) => (
  <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
    <h3 className="font-medium">{title}</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
          <XAxis type="number" />
          <YAxis type="category" dataKey="label" width={130} />
          <Tooltip />
          <Bar dataKey="value" fill="#FF8FA3" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </section>
);
