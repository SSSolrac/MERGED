import { EmptyState, PaginationControls, SectionCard, StatusChip } from '@/components/ui';
import { useLoginHistory } from '@/hooks/useLoginHistory';

export const LoginHistoryPage = () => {
  const { rows, filters, setFilters, total, totalPages, stats, loading, error } = useLoginHistory();

  return (
    <div className="space-y-4">
      <SectionCard title="Login History" subtitle="Login records are paginated at 10 rows by default.">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border rounded p-3">Total logins today: {stats.totalToday}</div>
          <div className="border rounded p-3">Failed logins: {stats.failed}</div>
          <div className="border rounded p-3">Staff logins: {stats.staff}</div>
        </div>
      </SectionCard>

      <SectionCard title="Filters" contentClassName="grid gap-2 md:grid-cols-4">
        <input className="border rounded px-2 py-2" placeholder="Search user" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value, page: 1 })} />
        <select className="border rounded px-2 py-2" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value as typeof filters.role, page: 1 })}>
          <option value="all">All roles</option>
          <option value="owner">Owner</option>
          <option value="staff">Staff</option>
        </select>
        <input className="border rounded px-2 py-2" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value, page: 1 })} />
        <select className="border rounded px-2 py-2" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as typeof filters.status, page: 1 })}>
          <option value="all">All status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
      </SectionCard>

      <SectionCard title="Login Records">
        {loading ? <p className="text-sm text-[#6B7280]">Loading login history...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!loading && !rows.length ? (
          <EmptyState title="No login records found" message="Try changing the filters or date." />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr className="text-left">
                  <th className="p-2">User</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Login Time</th>
                  <th className="p-2">Logout Time</th>
                  <th className="p-2">IP Address</th>
                  <th className="p-2">Device</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-t" key={row.id}>
                    <td className="p-2">{row.userName || 'Unknown'}</td>
                    <td className="p-2">{row.role || 'unknown'}</td>
                    <td className="p-2">{row.loginTime ? new Date(row.loginTime).toLocaleString() : '-'}</td>
                    <td className="p-2">{row.logoutTime ? new Date(row.logoutTime).toLocaleString() : '-'}</td>
                    <td className="p-2">{row.ipAddress || '-'}</td>
                    <td className="p-2">{row.device || '-'}</td>
                    <td className="p-2">
                      <StatusChip label={row.loginStatus} tone={row.loginStatus === 'success' ? 'success' : 'danger'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls
          page={filters.page}
          totalPages={totalPages}
          totalItems={total}
          pageSize={filters.pageSize}
          onPageChange={(page) => setFilters({ ...filters, page })}
          itemLabel="records"
        />
      </SectionCard>
    </div>
  );
};
