import { StatusChip } from '@/components/ui';
import { useActivityLog } from '@/hooks/useActivityLog';

const toneForType = (type: string) => {
  if (type === 'order') return 'warning' as const;
  if (type === 'import' || type === 'settings') return 'neutral' as const;
  if (type === 'loyalty') return 'success' as const;
  if (type === 'inventory' || type === 'menu') return 'info' as const;
  if (type === 'system') return 'neutral' as const;
  return 'success' as const;
};

const labelForType = (type: string) => {
  if (type === 'order') return 'Order Action';
  if (type === 'import') return 'Import Action';
  if (type === 'inventory') return 'Inventory Action';
  if (type === 'menu') return 'Menu Action';
  if (type === 'settings') return 'Settings Action';
  if (type === 'loyalty') return 'Loyalty Action';
  if (type === 'system') return 'System Action';
  return 'Login Action';
};

export const ActivityLogPage = () => {
  const { rows, filters, setFilters, stats, totalPages, loading, error } = useActivityLog();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Activity Log</h2>

      <section className="grid md:grid-cols-6 gap-3">
        <div className="border rounded p-3">Activities today: {stats.totalToday}</div>
        <div className="border rounded p-3">Login events: {stats.loginEvents}</div>
        <div className="border rounded p-3">Order actions: {stats.orderEvents}</div>
        <div className="border rounded p-3">Loyalty actions: {stats.loyaltyEvents}</div>
        <div className="border rounded p-3">Import actions: {stats.importEvents}</div>
        <div className="border rounded p-3">Update actions: {stats.updateEvents}</div>
      </section>

      <section className="grid md:grid-cols-5 gap-2">
        <input
          className="border rounded px-2 py-1"
          placeholder="Search actor/action/item"
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value, page: 1 })}
        />
        <select className="border rounded px-2 py-1" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value, page: 1 })}>
          <option value="all">All roles</option>
          <option value="owner">Owner</option>
          <option value="staff">Staff</option>
          <option value="system">System</option>
          <option value="unknown">Unknown</option>
        </select>
        <select
          className="border rounded px-2 py-1"
          value={filters.type}
          onChange={(event) => setFilters({ ...filters, type: event.target.value as typeof filters.type, page: 1 })}
        >
          <option value="all">All activity types</option>
          <option value="login">Login activity</option>
          <option value="order">Order activity</option>
          <option value="import">Import activity</option>
          <option value="inventory">Inventory activity</option>
          <option value="menu">Menu activity</option>
          <option value="settings">Settings activity</option>
          <option value="loyalty">Loyalty activity</option>
          <option value="system">System activity</option>
        </select>
        <input className="border rounded px-2 py-1" type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value, page: 1 })} />
      </section>

      {loading ? <p className="text-sm text-[#6B7280]">Loading activity log...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="overflow-auto border rounded">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="text-left">
              <th className="p-2 border-b">Time</th>
              <th className="p-2 border-b">Actor</th>
              <th className="p-2 border-b">Role</th>
              <th className="p-2 border-b">Type</th>
              <th className="p-2 border-b">Action</th>
              <th className="p-2 border-b">Target</th>
              <th className="p-2 border-b">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b" key={row.id}>
                <td className="p-2">{new Date(row.occurredAt).toLocaleString()}</td>
                <td className="p-2">{row.actorName}</td>
                <td className="p-2">{row.actorRole}</td>
                <td className="p-2">
                  <StatusChip label={labelForType(row.type)} tone={toneForType(row.type)} />
                </td>
                <td className="p-2">{row.action}</td>
                <td className="p-2">{row.entityLabel}</td>
                <td className="p-2">{row.details}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td className="p-3 text-[#6B7280]" colSpan={7}>
                  No activity entries found for the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 items-center">
        <button className="border rounded px-2 py-1" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>
          Previous
        </button>
        <span>
          Page {filters.page} of {totalPages}
        </span>
        <button className="border rounded px-2 py-1" disabled={filters.page >= totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>
          Next
        </button>
      </div>
    </div>
  );
};
