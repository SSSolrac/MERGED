import type { ReactNode } from 'react';

export type DashboardTabKey = 'overview' | 'orders' | 'menu' | 'customers' | 'imports';

const tabs: Array<{ key: DashboardTabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'orders', label: 'Orders' },
  { key: 'menu', label: 'Menu' },
  { key: 'customers', label: 'Customers' },
  { key: 'imports', label: 'Imports' },
];

export const DashboardTabs = ({
  value,
  onChange,
  children,
}: {
  value: DashboardTabKey;
  onChange: (key: DashboardTabKey) => void;
  children: ReactNode;
}) => (
  <div className="space-y-4">
    <div className="rounded-lg border bg-white dark:bg-slate-800 p-2 flex gap-2 overflow-auto">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`px-3 py-1.5 rounded text-sm whitespace-nowrap ${value === tab.key ? 'bg-[#FFB6C1] text-[#1F2937]' : 'bg-[#FFE4E8] dark:bg-slate-700'}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
    {children}
  </div>
);
