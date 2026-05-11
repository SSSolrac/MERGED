import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export const TopItemsChart = ({ title, data }: { title: string; data: Array<{ label: string; value: number }> }) => {
  const chartData = [...data].sort((left, right) => right.value - left.value).slice(0, 5);

  return (
    <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="text-sm text-[#6B7280]">Always showing the top 5 shop items by quantity sold.</p>
        </div>
        {chartData.length ? <span className="rounded-full bg-[#FFE4E8] px-3 py-1 text-sm text-[#1F2937]">Top 5 only</span> : null}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 16 }}>
            <XAxis type="number" />
            <YAxis type="category" dataKey="label" width={130} />
            <Tooltip />
            <Bar dataKey="value" fill="#FF8FA3" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
