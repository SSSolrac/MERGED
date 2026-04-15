import { normalizeError } from '@/lib/errors';
import { mapLoyaltyAccountRow, mapRewardRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import type { LoyaltyAccount } from '@/types/loyalty';
import type { Reward } from '@/types/loyalty';

const listActiveRewards = async (): Promise<Reward[]> => {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('loyalty_rewards')
    .select('*')
    .eq('is_active', true)
    .order('required_stamps', { ascending: true });

  if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load loyalty rewards.' });
  return (Array.isArray(data) ? data : []).map(mapRewardRow);
};

export const loyaltyService = {
  async getCustomerLoyalty(customerId: string): Promise<LoyaltyAccount> {
    const supabase = requireSupabaseClient();
    const now = new Date().toISOString();
    const [rewards, accountResult, redemptionsResult] = await Promise.all([
      listActiveRewards(),
      supabase.from('loyalty_accounts').select('*').eq('customer_id', customerId).maybeSingle(),
      supabase.from('loyalty_redemptions').select('*').eq('customer_id', customerId).order('redeemed_at', { ascending: false }),
    ]);

    if (accountResult.error) throw normalizeError(accountResult.error, { fallbackMessage: 'Unable to load loyalty account.' });
    if (redemptionsResult.error) throw normalizeError(redemptionsResult.error, { fallbackMessage: 'Unable to load loyalty redemptions.' });

    const stampCount = mapLoyaltyAccountRow(accountResult.data).stampCount ?? 0;
    const availableRewards = rewards.filter((reward) => reward.requiredStamps <= stampCount);

    const redeemedRewardIds = new Set(
      (Array.isArray(redemptionsResult.data) ? redemptionsResult.data : [])
        .map((row) => String((row as { reward_id?: unknown }).reward_id ?? ''))
        .filter(Boolean),
    );

    const redeemedRewards = rewards.filter((reward) => redeemedRewardIds.has(String(reward.id)));

    return {
      customerId,
      stampCount,
      availableRewards,
      redeemedRewards,
      updatedAt: mapLoyaltyAccountRow(accountResult.data).updatedAt ?? now,
    };
  },

  async getCustomersLoyalty(customerIds: string[]): Promise<Record<string, LoyaltyAccount>> {
    const supabase = requireSupabaseClient();
    const now = new Date().toISOString();
    const ids = Array.from(new Set(customerIds)).filter(Boolean);
    if (!ids.length) return {};

    const [rewards, accountsResult, redemptionsResult] = await Promise.all([
      listActiveRewards(),
      supabase.from('loyalty_accounts').select('*').in('customer_id', ids),
      supabase.from('loyalty_redemptions').select('*').in('customer_id', ids),
    ]);

    if (accountsResult.error) throw normalizeError(accountsResult.error, { fallbackMessage: 'Unable to load loyalty accounts.' });
    if (redemptionsResult.error) throw normalizeError(redemptionsResult.error, { fallbackMessage: 'Unable to load loyalty redemptions.' });

    const accountByCustomerId = new Map(
      (Array.isArray(accountsResult.data) ? accountsResult.data : []).map((row) => {
        const mapped = mapLoyaltyAccountRow(row);
        return [mapped.customerId, mapped] as const;
      }),
    );

    const redeemedIdsByCustomerId = (Array.isArray(redemptionsResult.data) ? redemptionsResult.data : []).reduce(
      (acc, row) => {
        const r = row as { customer_id?: unknown; reward_id?: unknown };
        const customerId = String(r.customer_id ?? '');
        const rewardId = String(r.reward_id ?? '');
        if (!customerId || !rewardId) return acc;
        if (!acc[customerId]) acc[customerId] = new Set<string>();
        acc[customerId].add(rewardId);
        return acc;
      },
      {} as Record<string, Set<string>>,
    );

    return ids.reduce<Record<string, LoyaltyAccount>>((acc, customerId) => {
      const account = accountByCustomerId.get(customerId);
      const stampCount = account?.stampCount ?? 0;
      const redeemedRewardIds = redeemedIdsByCustomerId[customerId] ?? new Set<string>();

      acc[customerId] = {
        customerId,
        stampCount,
        availableRewards: rewards.filter((reward) => reward.requiredStamps <= stampCount),
        redeemedRewards: rewards.filter((reward) => redeemedRewardIds.has(String(reward.id))),
        updatedAt: account?.updatedAt ?? now,
      };

      return acc;
    }, {});
  },
};
