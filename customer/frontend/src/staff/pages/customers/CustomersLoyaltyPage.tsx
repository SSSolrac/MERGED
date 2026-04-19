import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { KPICard } from '@/components/dashboard';
import { useCustomers } from '@/hooks/useCustomers';
import { loyaltyService, type PendingRewardItem, type SavedInStoreRewardBalance } from '@/services/loyaltyService';
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
const rewardCountLabels = (customer: Customer) => {
  const counts = customer.loyalty.rewardRedemptionCounts ?? [];
  if (!counts.length) return rewardLabels(customer.loyalty.redeemedRewards);
  return counts.map((reward) => `${reward.label} x ${reward.count}`).join(', ');
};

export const CustomersLoyaltyPage = () => {
  const { customers, loading, error, refresh } = useCustomers();
  const [query, setQuery] = useState('');
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>('All');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [awardStampCount, setAwardStampCount] = useState('1');
  const [awardReason, setAwardReason] = useState('');
  const [awardError, setAwardError] = useState('');
  const [isAwarding, setIsAwarding] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [pendingRewardItems, setPendingRewardItems] = useState<PendingRewardItem[]>([]);
  const [savedInStoreRewards, setSavedInStoreRewards] = useState<SavedInStoreRewardBalance[]>([]);
  const [isLoadingOutstandingRewards, setIsLoadingOutstandingRewards] = useState(false);
  const [rewardActionKey, setRewardActionKey] = useState('');

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

  const openCustomerDetails = (customer: Customer) => {
    setSelected(customer);
    setAwardStampCount('1');
    setAwardReason('');
    setAwardError('');
    setResetReason('');
    setResetError('');
    setPendingRewardItems([]);
    setSavedInStoreRewards([]);
    setRewardActionKey('');
  };

  useEffect(() => {
    let cancelled = false;

    const loadOutstandingRewards = async () => {
      if (!selected?.id) {
        setPendingRewardItems([]);
        setSavedInStoreRewards([]);
        return;
      }

      try {
        setIsLoadingOutstandingRewards(true);
        const [pendingItems, savedRewards] = await Promise.all([
          loyaltyService.listPendingRewardItems(selected.id),
          loyaltyService.listSavedInStoreRewards(selected.id),
        ]);
        if (cancelled) return;
        setPendingRewardItems(pendingItems);
        setSavedInStoreRewards(savedRewards);
      } catch (error) {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : 'Unable to load saved rewards.');
        setPendingRewardItems([]);
        setSavedInStoreRewards([]);
      } finally {
        if (!cancelled) setIsLoadingOutstandingRewards(false);
      }
    };

    void loadOutstandingRewards();
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  const refreshSelectedCustomer = async (customerId: string) => {
    const refreshedCustomers = await refresh();
    const updatedCustomer = refreshedCustomers.find((customer) => customer.id === customerId) || null;
    if (updatedCustomer) setSelected(updatedCustomer);
    return updatedCustomer;
  };

  const handleAwardStamps = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;

    const stampCount = Math.floor(Number(awardStampCount));
    if (!Number.isFinite(stampCount) || stampCount < 1 || stampCount > 50) {
      setAwardError('Enter a stamp count from 1 to 50.');
      return;
    }

    setIsAwarding(true);
    setAwardError('');
    try {
      const result = await loyaltyService.awardManualStamps(selected.id, stampCount, awardReason);
      const refreshedCustomers = await refresh();
      const updatedCustomer = refreshedCustomers.find((customer) => customer.id === selected.id);
      setSelected(updatedCustomer ?? {
        ...selected,
        loyalty: {
          ...selected.loyalty,
          stampCount: result.newStampCount,
          updatedAt: result.awardedAt,
        },
      });
      setAwardStampCount('1');
      setAwardReason('');
      toast.success(`Awarded ${result.stampDelta} stamp${result.stampDelta === 1 ? '' : 's'} to ${result.customerLabel}.`);
    } catch (awardError) {
      const message = awardError instanceof Error ? awardError.message : 'Unable to award stamps right now.';
      setAwardError(message);
      toast.error(message);
    } finally {
      setIsAwarding(false);
    }
  };

  const handleResetCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;

    const confirmed = window.confirm(`Reset ${selected.name || selected.email || 'this customer'}'s loyalty card to 0 stamps?`);
    if (!confirmed) return;

    setIsResetting(true);
    setResetError('');
    try {
      const result = await loyaltyService.resetCustomerCard(selected.id, resetReason);
      const refreshedCustomers = await refresh();
      const updatedCustomer = refreshedCustomers.find((customer) => customer.id === selected.id);
      setSelected(updatedCustomer ?? {
        ...selected,
        loyalty: {
          ...selected.loyalty,
          stampCount: result.newStampCount,
          availableRewards: selected.loyalty.availableRewards.filter((reward) => reward.requiredStamps <= result.newStampCount),
          updatedAt: result.resetAt,
        },
      });
      setResetReason('');
      toast.success(`Reset ${result.customerLabel}'s loyalty card.`);
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : 'Unable to reset loyalty card right now.';
      setResetError(message);
      toast.error(message);
    } finally {
      setIsResetting(false);
    }
  };

  const handleClaimPendingRewardInStore = async (rewardItem: PendingRewardItem) => {
    if (!selected?.id) return;

    try {
      setRewardActionKey(`pending:${rewardItem.id}`);
      const result = await loyaltyService.claimPendingRewardItemInStore(rewardItem.id);
      await refreshSelectedCustomer(selected.id);
      const [nextPendingItems, nextSavedRewards] = await Promise.all([
        loyaltyService.listPendingRewardItems(selected.id),
        loyaltyService.listSavedInStoreRewards(selected.id),
      ]);
      setPendingRewardItems(nextPendingItems);
      setSavedInStoreRewards(nextSavedRewards);
      toast.success(`${result.itemName || result.rewardLabel} cleared from the customer profile.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to clear this reward item right now.';
      toast.error(message);
    } finally {
      setRewardActionKey('');
    }
  };

  const handleClaimSavedRewardInStore = async (reward: SavedInStoreRewardBalance) => {
    if (!selected?.id) return;

    try {
      setRewardActionKey(`saved:${reward.rewardId}`);
      const result = await loyaltyService.claimSavedRewardInStore(selected.id, reward.rewardId);
      await refreshSelectedCustomer(selected.id);
      const [nextPendingItems, nextSavedRewards] = await Promise.all([
        loyaltyService.listPendingRewardItems(selected.id),
        loyaltyService.listSavedInStoreRewards(selected.id),
      ]);
      setPendingRewardItems(nextPendingItems);
      setSavedInStoreRewards(nextSavedRewards);
      toast.success(`${result.rewardLabel} marked as claimed in store.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to clear this saved reward right now.';
      toast.error(message);
    } finally {
      setRewardActionKey('');
    }
  };

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
          <table className="w-full text-sm min-w-[920px]"><thead><tr className="text-left"><th>Name</th><th>Email</th><th>Stamps</th><th>Available Rewards</th><th>Redeemed</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {filtered.map((customer) => <tr key={customer.id} className="border-t"><td>{customer.name}</td><td>{customer.email}</td><td>{customer.loyalty.stampCount}/{LOYALTY_TOTAL_STAMPS}</td><td>{rewardLabels(customer.loyalty.availableRewards) || 'None'}</td><td>{rewardCountLabels(customer) || 'None'}</td><td>{rewardReadiness(customer)}</td><td><button className="border rounded px-2 py-1" onClick={() => openCustomerDetails(customer)}>Details / Award</button></td></tr>)}
          </tbody></table>
        </div>
        <aside className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3"><h3 className="font-medium">Customer Loyalty Snapshot</h3></aside>
      </section>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-4" role="dialog" aria-modal="true" aria-labelledby="loyalty-award-title">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold" id="loyalty-award-title">{selected.name || 'Customer'}</h3>
                <p className="text-sm text-[#6B7280]">{selected.email}</p>
              </div>
              <button className="border rounded px-2 py-1" onClick={() => setSelected(null)}>Close</button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <p>Stamp count: <strong>{selected.loyalty.stampCount}/{LOYALTY_TOTAL_STAMPS}</strong></p>
              <p>Status: <strong>{rewardReadiness(selected)}</strong></p>
              <p className="sm:col-span-2">Available rewards: {rewardLabels(selected.loyalty.availableRewards) || 'None'}</p>
              <p className="sm:col-span-2">Saved rewards: {rewardCountLabels(selected) || 'None'}</p>
            </div>

            <section className="border-t pt-4 space-y-3">
              <div>
                <h4 className="font-medium">Outstanding Reward Claims</h4>
                <p className="text-sm text-[#6B7280]">Use these buttons after a customer claims a latte or free groom in store so it disappears from their profile.</p>
              </div>

              {isLoadingOutstandingRewards ? <p className="text-sm text-[#6B7280]">Loading saved reward claims...</p> : null}

              {!isLoadingOutstandingRewards ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Pending latte reward items</p>
                    {!pendingRewardItems.length ? <p className="text-sm text-[#6B7280]">No saved latte reward items right now.</p> : null}
                    {pendingRewardItems.map((rewardItem) => (
                      <div key={rewardItem.id} className="rounded border p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                        <div>
                          <p className="font-medium">{rewardItem.itemName}</p>
                          <p className="text-[#6B7280]">
                            {rewardItem.rewardLabel}
                            {rewardItem.optionLabel ? ` - ${rewardItem.optionLabel}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="border rounded px-3 py-1"
                          onClick={() => handleClaimPendingRewardInStore(rewardItem)}
                          disabled={rewardActionKey === `pending:${rewardItem.id}`}
                        >
                          {rewardActionKey === `pending:${rewardItem.id}` ? 'Saving...' : 'Claimed in store'}
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Saved in-store rewards</p>
                    {!savedInStoreRewards.length ? <p className="text-sm text-[#6B7280]">No saved in-store rewards right now.</p> : null}
                    {savedInStoreRewards.map((reward) => (
                      <div key={reward.rewardId} className="rounded border p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                        <div>
                          <p className="font-medium">{reward.label} x {reward.count}</p>
                          {reward.latestRedeemedAt ? (
                            <p className="text-[#6B7280]">Latest saved {new Date(reward.latestRedeemedAt).toLocaleString()}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="border rounded px-3 py-1"
                          onClick={() => handleClaimSavedRewardInStore(reward)}
                          disabled={rewardActionKey === `saved:${reward.rewardId}`}
                        >
                          {rewardActionKey === `saved:${reward.rewardId}` ? 'Saving...' : 'Claimed in store'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <form className="border-t pt-4 space-y-3" onSubmit={handleAwardStamps}>
              <div>
                <h4 className="font-medium">Award Stamps Manually</h4>
                <p className="text-sm text-[#6B7280]">Adds stamps to the customer card, creates a customer notification, and records an activity log entry.</p>
              </div>
              <div className="grid sm:grid-cols-[140px_1fr] gap-2">
                <label className="text-sm">
                  Stamps
                  <input
                    className="block border rounded mt-1 px-2 py-1 w-full"
                    type="number"
                    min={1}
                    max={50}
                    value={awardStampCount}
                    onChange={(event) => setAwardStampCount(event.target.value)}
                    disabled={isAwarding}
                  />
                </label>
                <label className="text-sm">
                  Reason or note
                  <input
                    className="block border rounded mt-1 px-2 py-1 w-full"
                    placeholder="Example: Birthday bonus"
                    value={awardReason}
                    onChange={(event) => setAwardReason(event.target.value)}
                    disabled={isAwarding}
                  />
                </label>
              </div>
              {awardError ? <p className="text-sm text-red-600">{awardError}</p> : null}
              <button className="border rounded px-3 py-1" disabled={isAwarding} type="submit">
                {isAwarding ? 'Awarding...' : 'Award Stamps'}
              </button>
            </form>

            <form className="border-t pt-4 space-y-3" onSubmit={handleResetCard}>
              <div>
                <h4 className="font-medium">Reset Loyalty Card</h4>
                <p className="text-sm text-[#6B7280]">Sets this customer's stamp count back to 0 and records the reset in the activity log.</p>
              </div>
              <label className="text-sm block">
                Reason or note
                <input
                  className="block border rounded mt-1 px-2 py-1 w-full"
                  placeholder="Example: Card corrected in store"
                  value={resetReason}
                  onChange={(event) => setResetReason(event.target.value)}
                  disabled={isResetting}
                />
              </label>
              {resetError ? <p className="text-sm text-red-600">{resetError}</p> : null}
              <button className="border border-red-300 rounded px-3 py-1 text-red-700" disabled={isResetting} type="submit">
                {isResetting ? 'Resetting...' : 'Reset Loyalty Card'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
