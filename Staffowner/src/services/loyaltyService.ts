import { normalizeError } from '@/lib/errors';
import { mapLoyaltyAccountRow, mapRewardRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import type { LoyaltyAccount, LoyaltyResetResult, ManualStampAwardResult, Reward, RewardRedemptionCount } from '@/types/loyalty';

type LoyaltyRedemptionRow = {
  customer_id?: unknown;
  reward_id?: unknown;
  redeemed_at?: unknown;
};

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

const asText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : value == null ? fallback : String(value));
const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeManualStampAwardResult = (data: unknown): ManualStampAwardResult => {
  const row = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  return {
    eventId: asText(row.eventId),
    customerId: asText(row.customerId),
    customerLabel: asText(row.customerLabel, 'Customer'),
    stampDelta: asNumber(row.stampDelta, 0),
    newStampCount: asNumber(row.newStampCount, 0),
    reason: row.reason == null ? null : asText(row.reason),
    awardedAt: asText(row.awardedAt, new Date().toISOString()),
  };
};

const normalizeLoyaltyResetResult = (data: unknown): LoyaltyResetResult => {
  const row = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  return {
    customerId: asText(row.customerId),
    customerLabel: asText(row.customerLabel, 'Customer'),
    previousStampCount: asNumber(row.previousStampCount, 0),
    newStampCount: asNumber(row.newStampCount, 0),
    reason: row.reason == null ? null : asText(row.reason),
    resetAt: asText(row.resetAt, new Date().toISOString()),
  };
};

const buildRewardRedemptionCounts = (rows: LoyaltyRedemptionRow[], rewardsById: Map<string, Reward>): RewardRedemptionCount[] => {
  const counts = new Map<string, RewardRedemptionCount>();

  rows.forEach((row) => {
    const rewardId = asText(row.reward_id);
    if (!rewardId) return;

    const reward = rewardsById.get(rewardId);
    const label = reward?.label || 'Reward';
    const current = counts.get(rewardId) ?? {
      rewardId,
      label,
      count: 0,
      latestRedeemedAt: '',
    };
    const redeemedAt = asText(row.redeemed_at);
    const currentMs = Date.parse(current.latestRedeemedAt);
    const redeemedMs = Date.parse(redeemedAt);

    counts.set(rewardId, {
      ...current,
      count: current.count + 1,
      latestRedeemedAt: Number.isFinite(redeemedMs) && (!Number.isFinite(currentMs) || redeemedMs > currentMs) ? redeemedAt : current.latestRedeemedAt,
    });
  });

  return Array.from(counts.values()).sort((a, b) => a.label.localeCompare(b.label));
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
    const rewardsById = new Map(rewards.map((reward) => [String(reward.id), reward] as const));
    const redemptionRows = (Array.isArray(redemptionsResult.data) ? redemptionsResult.data : []) as LoyaltyRedemptionRow[];

    const redeemedRewardIds = new Set(
      redemptionRows
        .map((row) => String(row.reward_id ?? ''))
        .filter(Boolean),
    );

    const redeemedRewards = rewards.filter((reward) => redeemedRewardIds.has(String(reward.id)));

    return {
      customerId,
      stampCount,
      availableRewards,
      redeemedRewards,
      rewardRedemptionCounts: buildRewardRedemptionCounts(redemptionRows, rewardsById),
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

    const rewardsById = new Map(rewards.map((reward) => [String(reward.id), reward] as const));
    const redemptionRows = (Array.isArray(redemptionsResult.data) ? redemptionsResult.data : []) as LoyaltyRedemptionRow[];
    const redemptionsByCustomerId = redemptionRows.reduce<Record<string, LoyaltyRedemptionRow[]>>((acc, row) => {
      const customerId = String(row.customer_id ?? '');
      if (!customerId) return acc;
      if (!acc[customerId]) acc[customerId] = [];
      acc[customerId].push(row);
      return acc;
    }, {});

    const redeemedIdsByCustomerId = redemptionRows.reduce(
      (acc, row) => {
        const customerId = String(row.customer_id ?? '');
        const rewardId = String(row.reward_id ?? '');
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
        rewardRedemptionCounts: buildRewardRedemptionCounts(redemptionsByCustomerId[customerId] ?? [], rewardsById),
        updatedAt: account?.updatedAt ?? now,
      };

      return acc;
    }, {});
  },

  async awardManualStamps(customerId: string, stampCount: number, reason = ''): Promise<ManualStampAwardResult> {
    const supabase = requireSupabaseClient();
    const safeCustomerId = customerId.trim();
    const safeStampCount = Math.floor(Number(stampCount));
    const safeReason = reason.trim();

    if (!safeCustomerId) throw new Error('Choose a customer before awarding stamps.');
    if (!Number.isFinite(safeStampCount) || safeStampCount < 1 || safeStampCount > 50) {
      throw new Error('Stamp count must be between 1 and 50.');
    }

    const { data, error } = await supabase.rpc('award_manual_loyalty_stamps', {
      p_customer_id: safeCustomerId,
      p_stamp_count: safeStampCount,
      p_reason: safeReason || null,
    });

    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to award loyalty stamps.' });
    return normalizeManualStampAwardResult(data);
  },

  async resetCustomerCard(customerId: string, reason = ''): Promise<LoyaltyResetResult> {
    const supabase = requireSupabaseClient();
    const safeCustomerId = customerId.trim();
    const safeReason = reason.trim();

    if (!safeCustomerId) throw new Error('Choose a customer before resetting the card.');

    const { data, error } = await supabase.rpc('reset_customer_loyalty_card', {
      p_customer_id: safeCustomerId,
      p_reason: safeReason || null,
    });

    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to reset loyalty card.' });
    return normalizeLoyaltyResetResult(data);
  },
};
