import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';

export const CommandBar = () => {
  const [query, setQuery] = useState('');
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const location = useLocation();
  const workspaceBasePath = location.pathname.startsWith('/owner') ? '/owner' : '/staff';

  const links = useMemo(() => [
    { label: 'Dashboard Overview', path: `${workspaceBasePath}/dashboard` },
    { label: 'View Orders', path: `${workspaceBasePath}/orders` },
    { label: 'Edit Daily Menu', path: `${workspaceBasePath}/daily-menu` },
    { label: 'Manage Menu Items', path: `${workspaceBasePath}/menu` },
    { label: 'Inventory', path: `${workspaceBasePath}/inventory` },
    { label: 'Customer Loyalty', path: `${workspaceBasePath}/customers` },
    ...(isOwner ? [{ label: 'Import Sales Data', path: `${workspaceBasePath}/imports` }] : []),
    ...(isOwner ? [{ label: 'Settings', path: `${workspaceBasePath}/settings` }] : []),
    ...(isOwner ? [{ label: 'Delivery Coverage', path: `${workspaceBasePath}/admin/delivery-coverage` }] : []),
    ...(isOwner ? [{ label: 'Activity Log', path: `${workspaceBasePath}/admin/activity-log` }] : []),
  ], [isOwner, workspaceBasePath]);

  const filtered = useMemo(() => links.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())), [query, links]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Quick search"
        className="rounded-lg border border-white/30 bg-white/20 px-3 py-1.5 text-sm w-56 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/40"
      />
      {query && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-[#F3D6DB] bg-white p-1 shadow-lg">
          {filtered.map((item) => (
            <Link key={item.path} to={item.path} className="block rounded-md px-2 py-1 text-sm text-[#1F2937] hover:bg-[#FFF3F5]">
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
