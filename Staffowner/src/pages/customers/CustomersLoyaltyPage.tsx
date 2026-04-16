import { useMemo, useState } from 'react';
import { KPICard } from '@/components/dashboard';
import { useCustomers } from '@/hooks/useCustomers';
import { LOYALTY_TOTAL_STAMPS } from '@/types/loyalty';
import type { Customer } from '@/types/customer';

type RewardFilter = 'All' | 'Ready to redeem' | 'Building progress' | 'New card';
const rewardFilters: RewardFilter[] = ['All', 'Ready to redeem', 'Building progress', 'New card'];

const rewardReadiness = (customer: Customer): RewardFilter => {
  if (customer.loyalty.availableRewards.length > 0) return 'Ready to redeem';
  if (customer.loyalty.stampCount > 0) return 'Building progress';
  return 'New card';
};

const rewardLabels = (labels: Customer['loyalty']['availableRewards']) => labels.map((reward) => reward.label).join(', ');

export const CustomersLoyaltyPage = () => {
  const { customers, loading, error } = useCustomers();
  const [query, setQuery] = useState('');
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>('All');
  const [selected, setSelected] = useState<Customer | null>(null);

  const filtered = useMemo(() => customers.filter((customer) => {
    const byQuery = customer.name.toLowerCase().includes(query.toLowerCase()) || customer.email.toLowerCase().includes(query.toLowerCase());
    const byReward = rewardFilter === 'All' || rewardReadiness(customer) === rewardFilter;
    return byQuery && byReward;
  }), [customers, query, rewardFilter]);

  const loyaltySummary = useMemo(() => ({
    readyToRedeem: customers.filter((customer) => customer.loyalty.availableRewards.length > 0).length,
    buildingProgress: customers.filter((customer) => customer.loyalty.stampCount > 0 && customer.loyalty.availableRewards.length === 0).length,
    newCard: customers.filter((customer) => customer.loyalty.stampCount === 0).length,
    totalStampsIssued: customers.reduce((sum, customer) => sum + customer.loyalty.stampCount, 0),
  }), [customers]);

  if (loading) return <p>Loading customers...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Customer Loyalty</h2>
        <p className="text-sm text-[#6B7280]">Stamp-only loyalty account with available and redeemed rewards.</p>
        <div className="flex flex-wrap gap-2">
          <input className="border rounded px-2 py-1 w-full md:w-80" placeholder="Search customer name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="border rounded px-2 py-1" value={rewardFilter} onChange={(e) => setRewardFilter(e.target.value as RewardFilter)}>
            {rewardFilters.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </section>

      <section className="grid md:grid-cols-4 gap-3">
        <KPICard title="Ready to redeem" value={String(loyaltySummary.readyToRedeem)} subtitle="With available rewards" />
        <KPICard title="Building progress" value={String(loyaltySummary.buildingProgress)} subtitle="Actively collecting stamps" />
        <KPICard title="New card" value={String(loyaltySummary.newCard)} subtitle="No stamp activity yet" />
        <KPICard title="Total stamps" value={String(loyaltySummary.totalStampsIssued)} subtitle="Aggregate stamp count" />
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border bg-white dark:bg-slate-800 p-4 overflow-auto">
          <table className="w-full text-sm min-w-[880px]"><thead><tr className="text-left"><th>Name</th><th>Email</th><th>Stamps</th><th>Available Rewards</th><th>Redeemed</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {filtered.map((customer) => <tr key={customer.id} className="border-t"><td>{customer.name}</td><td>{customer.email}</td><td>{customer.loyalty.stampCount}/{LOYALTY_TOTAL_STAMPS}</td><td>{rewardLabels(customer.loyalty.availableRewards) || 'None'}</td><td>{rewardLabels(customer.loyalty.redeemedRewards) || 'None'}</td><td>{rewardReadiness(customer)}</td><td><button className="border rounded px-2 py-1" onClick={() => setSelected(customer)}>Details</button></td></tr>)}
          </tbody></table>
        </div>
        <aside className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3"><h3 className="font-medium">Customer Loyalty Snapshot</h3></aside>
      </section>

      {selected && <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20"><div className="w-full max-w-xl rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">{selected.name}</h3><button className="border rounded px-2 py-1" onClick={() => setSelected(null)}>Close</button></div><p>Stamp count: {selected.loyalty.stampCount}</p><p>Available rewards: {rewardLabels(selected.loyalty.availableRewards) || 'None'}</p></div></div>}
    </div>
  );
};
