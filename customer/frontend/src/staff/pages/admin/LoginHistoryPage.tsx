import { StatusChip } from '@/components/ui';
import { useLoginHistory } from '@/hooks/useLoginHistory';

export const LoginHistoryPage = () => {
  const { rows, filters, setFilters, totalPages, stats } = useLoginHistory();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Login History</h2>
      <section className="grid md:grid-cols-3 gap-3">
        <div className="border rounded p-3">Total logins today: {stats.totalToday}</div>
        <div className="border rounded p-3">Failed logins: {stats.failed}</div>
        <div className="border rounded p-3">Staff logins: {stats.staff}</div>
      </section>
      <section className="grid md:grid-cols-4 gap-2">
        <input className="border rounded px-2 py-1" placeholder="Search user" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value, page: 1 })} />
        <select className="border rounded px-2 py-1" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value as typeof filters.role, page: 1 })}><option value="all">All roles</option><option value="owner">Owner</option><option value="staff">Staff</option></select>
        <input className="border rounded px-2 py-1" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value, page: 1 })} />
        <select className="border rounded px-2 py-1" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as typeof filters.status, page: 1 })}><option value="all">All status</option><option value="success">Success</option><option value="failed">Failed</option></select>
      </section>
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th>User</th><th>Role</th><th>Login Time</th><th>Logout Time</th><th>IP Address</th><th>Device</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t" key={row.id}><td>{row.userName}</td><td>{row.role}</td><td>{new Date(row.loginTime).toLocaleString()}</td><td>{row.logoutTime ? new Date(row.logoutTime).toLocaleString() : '-'}</td><td>{row.ipAddress}</td><td>{row.device}</td><td><StatusChip label={row.loginStatus} tone={row.loginStatus === 'success' ? 'success' : 'danger'} /></td></tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2 items-center">
        <button className="border rounded px-2 py-1" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</button>
        <span>Page {filters.page} of {totalPages}</span>
        <button className="border rounded px-2 py-1" disabled={filters.page >= totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</button>
      </div>
    </div>
  );
};
