import { useState } from 'react';
import { Button, DetailModal, EmptyState, PaginationControls, SectionCard, StatusChip } from '@/components/ui';
import { useActivityLog } from '@/hooks/useActivityLog';
import type { ActivityLogEntry } from '@/types/activityLog';

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

const metadataRows = (entry: ActivityLogEntry) => {
  if (!entry.metadata) return [];
  return Object.entries(entry.metadata).filter(([, value]) => value !== null && value !== undefined && value !== '');
};

export const ActivityLogPage = () => {
  const { rows, filters, setFilters, stats, total, totalPages, loading, error } = useActivityLog();
  const [selectedEntry, setSelectedEntry] = useState<ActivityLogEntry | null>(null);

  return (
    <div className="space-y-4">
      <SectionCard title="Activity Log" subtitle="Latest owner/staff activity is paginated at 10 records by default.">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="border rounded p-3">Activities today: {stats.totalToday}</div>
          <div className="border rounded p-3">Login events: {stats.loginEvents}</div>
          <div className="border rounded p-3">Order actions: {stats.orderEvents}</div>
          <div className="border rounded p-3">Loyalty actions: {stats.loyaltyEvents}</div>
          <div className="border rounded p-3">Import actions: {stats.importEvents}</div>
          <div className="border rounded p-3">Update actions: {stats.updateEvents}</div>
        </div>
      </SectionCard>

      <SectionCard title="Filters" contentClassName="grid gap-2 md:grid-cols-4">
        <input
          className="border rounded px-2 py-2"
          placeholder="Search actor/action/item"
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value, page: 1 })}
        />
        <select className="border rounded px-2 py-2" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value, page: 1 })}>
          <option value="all">All roles</option>
          <option value="owner">Owner</option>
          <option value="staff">Staff</option>
          <option value="system">System</option>
          <option value="unknown">Unknown</option>
        </select>
        <select
          className="border rounded px-2 py-2"
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
        <input className="border rounded px-2 py-2" type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value, page: 1 })} />
      </SectionCard>

      <SectionCard title="Activity Records" subtitle="Use View for timestamp, user/action, affected item, and metadata.">
        {loading ? <p className="text-sm text-[#6B7280]">Loading activity log...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && rows.length === 0 ? (
          <EmptyState title="No activity entries found" message="Try a different filter or date." />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-left">
                  <th className="p-2 border-b">Time</th>
                  <th className="p-2 border-b">Actor</th>
                  <th className="p-2 border-b">Type</th>
                  <th className="p-2 border-b">Action</th>
                  <th className="p-2 border-b">Affected Item</th>
                  <th className="p-2 border-b">Details</th>
                  <th className="p-2 border-b">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b" key={row.id}>
                    <td className="p-2">{new Date(row.occurredAt).toLocaleString()}</td>
                    <td className="p-2">
                      <p className="font-medium">{row.actorName || 'Unknown'}</p>
                      <p className="text-xs text-[#6B7280]">{row.actorRole || 'unknown'}</p>
                    </td>
                    <td className="p-2">
                      <StatusChip label={labelForType(row.type)} tone={toneForType(row.type)} />
                    </td>
                    <td className="p-2">{row.action || 'Recorded activity'}</td>
                    <td className="p-2">{row.entityLabel || '-'}</td>
                    <td className="p-2 max-w-[280px] truncate">{row.details || '-'}</td>
                    <td className="p-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedEntry(row)}>
                        View
                      </Button>
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

      {selectedEntry ? (
        <DetailModal title={`Activity Details: ${selectedEntry.action}`} onClose={() => setSelectedEntry(null)}>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded border p-3">
              <p className="text-xs font-semibold text-[#6B7280]">Timestamp</p>
              <p>{new Date(selectedEntry.occurredAt).toLocaleString()}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs font-semibold text-[#6B7280]">User / Action</p>
              <p>{selectedEntry.actorName || 'Unknown'} ({selectedEntry.actorRole || 'unknown'})</p>
              <p className="mt-1">{selectedEntry.action || 'Recorded activity'}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs font-semibold text-[#6B7280]">Affected Item</p>
              <p>{selectedEntry.entityLabel || '-'}</p>
              <p className="text-[#6B7280]">{selectedEntry.entityType || 'record'} {selectedEntry.entityId ? `#${selectedEntry.entityId}` : ''}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs font-semibold text-[#6B7280]">Details</p>
              <p>{selectedEntry.details || '-'}</p>
            </div>
          </div>
          <div className="mt-3 rounded border p-3 text-sm">
            <p className="mb-2 text-xs font-semibold text-[#6B7280]">Metadata</p>
            {metadataRows(selectedEntry).length ? (
              <dl className="grid gap-2 md:grid-cols-2">
                {metadataRows(selectedEntry).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-[#6B7280]">{key}</dt>
                    <dd className="break-words">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-[#6B7280]">No metadata available.</p>
            )}
          </div>
        </DetailModal>
      ) : null}
    </div>
  );
};
