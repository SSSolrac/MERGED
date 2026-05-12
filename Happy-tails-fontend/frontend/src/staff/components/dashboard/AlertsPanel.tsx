const toneClasses = {
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-rose-200 bg-rose-50 text-rose-800',
};

export const AlertsPanel = ({ alerts }: { alerts: Array<{ id: string; tone: 'info' | 'warning' | 'danger'; title: string; message: string }> }) => (
  <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
    <h3 className="font-medium">Alerts & Status</h3>
    <div className="space-y-2">
      {alerts.map((alert) => (
        <article key={alert.id} className={`border rounded p-3 ${toneClasses[alert.tone]}`}>
          <p className="font-medium text-sm">{alert.title}</p>
          <p className="text-sm">{alert.message}</p>
        </article>
      ))}
    </div>
  </section>
);
