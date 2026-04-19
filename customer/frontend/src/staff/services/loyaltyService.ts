import { normalizeError } from '@/lib/errors';
import { mapLoyaltyAccountRow, mapRewardRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import type { LoyaltyAccount, LoyaltyResetResult, ManualStampAwardResult, Reward, RewardRedemptionCount } from '@/types/loyalty';

const CLAIMED_IN_STORE_MARKER = '[claimed-in-store]';

type LoyaltyRedemptionRow = {
  id?: unknown;
  customer_id?: unknown;
  reward_id?: unknown;
  redeemed_at?: unknown;
  notes?: unknown;
};

type PendingRewardItemRow = {
  id?: unknown;
  redemption_id?: unknown;
  customer_id?: unknown;
  reward_id?: unknown;
  item_name?: unknown;
  option_label?: unknown;
  notes?: unknown;
  created_at?: unknown;
};

export type PendingRewardItem = {
  id: string;
  redemptionId: string;
  customerId: string;
  rewardId: string;
  rewardLabel: string;
  itemName: string;
  optionLabel: string | null;
  notes: string | null;
  createdAt: string;
};

export type SavedInStoreRewardBalance = {
  rewardId: string;
  label: string;
  count: number;
  latestRedeemedAt: string;
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
const hasClaimedInStoreMarker = (value: unknown) => asText(value).toLowerCase().includes(CLAIMED_IN_STORE_MARKER);
const stripClaimedInStoreMarker = (value: unknown) =>
  asText(value)
    .replace(/\s*\|\s*\[claimed-in-store\][^|]*$/i, '')
    .replace(/\[claimed-in-store\][^|]*$/i, '')
    .trim();
const appendClaimedInStoreNote = (value: unknown, note = '') => {
  const cleaned = stripClaimedInStoreMarker(value);
  const parts = [cleaned, note.trim(), CLAIMED_IN_STORE_MARKER].filter(Boolean);
  return parts.join(' | ');
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

const mapPendingRewardItemRow = (row: PendingRewardItemRow, rewardsById: Map<string, Reward>): PendingRewardItem => {
  const rewardId = asText(row.reward_id);
  const reward = rewardsById.get(rewardId);
  return {
    id: asText(row.id),
    redemptionId: asText(row.redemption_id),
    customerId: asText(row.customer_id),
    rewardId,
    rewardLabel: reward?.label || 'Reward',
    itemName: asText(row.item_name, 'Reward item'),
    optionLabel: asText(row.option_label) || null,
    notes: stripClaimedInStoreMarker(row.notes) || null,
    createdAt: asText(row.created_at),
  };
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

  async listPendingRewardItems(customerId: string): Promise<PendingRewardItem[]> {
    const supabase = requireSupabaseClient();
    const safeCustomerId = customerId.trim();
    if (!safeCustomerId) return [];

    const [rewards, rewardItemsResult] = await Promise.all([
      listActiveRewards(),
      supabase
        .from('loyalty_reward_items')
        .select('id, redemption_id, customer_id, reward_id, item_name, option_label, notes, created_at')
        .eq('customer_id', safeCustomerId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (rewardItemsResult.error) {
      throw normalizeError(rewardItemsResult.error, { fallbackMessage: 'Unable to load pending reward items.' });
    }

    const rewardsById = new Map(rewards.map((reward) => [String(reward.id), reward] as const));
    return (Array.isArray(rewardItemsResult.data) ? rewardItemsResult.data : []).map((row) =>
      mapPendingRewardItemRow(row as PendingRewardItemRow, rewardsById),
    );
  },

  async listSavedInStoreRewards(customerId: string): Promise<SavedInStoreRewardBalance[]> {
    const supabase = requireSupabaseClient();
    const safeCustomerId = customerId.trim();
    if (!safeCustomerId) return [];

    const [rewards, redemptionsResult] = await Promise.all([
      listActiveRewards(),
      supabase.from('loyalty_redemptions').select('*').eq('customer_id', safeCustomerId).order('redeemed_at', { ascending: false }),
    ]);

    if (redemptionsResult.error) {
      throw normalizeError(redemptionsResult.error, { fallbackMessage: 'Unable to load saved in-store rewards.' });
    }

    const rewardsById = new Map(rewards.map((reward) => [String(reward.id), reward] as const));
    const balances = new Map<string, SavedInStoreRewardBalance>();

    (Array.isArray(redemptionsResult.data) ? redemptionsResult.data : []).forEach((row) => {
      const rewardId = asText((row as LoyaltyRedemptionRow).reward_id);
      if (!rewardId || hasClaimedInStoreMarker((row as LoyaltyRedemptionRow).notes)) return;

      const reward = rewardsById.get(rewardId);
      const label = reward?.label || 'Reward';
      if (!/groom/i.test(label)) return;

      const current = balances.get(rewardId) ?? {
        rewardId,
        label,
        count: 0,
        latestRedeemedAt: '',
      };
      const redeemedAt = asText((row as LoyaltyRedemptionRow).redeemed_at);
      const currentMs = Date.parse(current.latestRedeemedAt);
      const redeemedMs = Date.parse(redeemedAt);

      balances.set(rewardId, {
        ...current,
        count: current.count + 1,
        latestRedeemedAt: Number.isFinite(redeemedMs) && (!Number.isFinite(currentMs) || redeemedMs > currentMs) ? redeemedAt : current.latestRedeemedAt,
      });
    });

    return Array.from(balances.values()).sort((a, b) => a.label.localeCompare(b.label));
  },

  async claimPendingRewardItemInStore(rewardItemId: string, note = ''): Promise<{ itemName: string; rewardLabel: string }> {
    const supabase = requireSupabaseClient();
    const safeRewardItemId = rewardItemId.trim();
    if (!safeRewardItemId) throw new Error('Choose a reward item first.');

    const { data: rewardItemRow, error: rewardItemError } = await supabase
      .from('loyalty_reward_items')
      .select('id, redemption_id, reward_id, item_name, option_label, notes')
      .eq('id', safeRewardItemId)
      .maybeSingle();

    if (rewardItemError) throw normalizeError(rewardItemError, { fallbackMessage: 'Unable to load the reward item.' });
    if (!rewardItemRow) throw new Error('Reward item not found.');

    const rewards = await listActiveRewards();
    const rewardsById = new Map(rewards.map((reward) => [String(reward.id), reward] as const));
    const rewardLabel = rewardsById.get(asText(rewardItemRow.reward_id))?.label || 'Reward';
    const itemName = asText(rewardItemRow.item_name, 'Reward item');

    const { error: updateRedemptionError } = await supabase
      .from('loyalty_redemptions')
      .update({ notes: appendClaimedInStoreNote(rewardItemRow.notes, note) })
      .eq('id', rewardItemRow.redemption_id);

    if (updateRedemptionError) {
      throw normalizeError(updateRedemptionError, { fallbackMessage: 'Unable to mark this reward as claimed in store.' });
    }

    const { error: deleteRewardItemError } = await supabase.from('loyalty_reward_items').delete().eq('id', safeRewardItemId);
    if (deleteRewardItemError) {
      throw normalizeError(deleteRewardItemError, { fallbackMessage: 'Unable to remove this reward from the customer profile.' });
    }

    return { itemName, rewardLabel };
  },

  async claimSavedRewardInStore(customerId: string, rewardId: string, note = ''): Promise<{ rewardLabel: string }> {
    const supabase = requireSupabaseClient();
    const safeCustomerId = customerId.trim();
    const safeRewardId = rewardId.trim();

    if (!safeCustomerId || !safeRewardId) throw new Error('Choose a saved reward first.');

    const [rewards, redemptionsResult] = await Promise.all([
      listActiveRewards(),
      supabase
        .from('loyalty_redemptions')
        .select('id, reward_id, notes, redeemed_at')
        .eq('customer_id', safeCustomerId)
        .eq('reward_id', safeRewardId)
        .order('redeemed_at', { ascending: false }),
    ]);

    if (redemptionsResult.error) {
      throw normalizeError(redemptionsResult.error, { fallbackMessage: 'Unable to load the saved reward.' });
    }

    const rewardLabel = rewards.find((reward) => String(reward.id) === safeRewardId)?.label || 'Reward';
    const targetRow = (Array.isArray(redemptionsResult.data) ? redemptionsResult.data : []).find(
      (row) => !hasClaimedInStoreMarker((row as LoyaltyRedemptionRow).notes),
    ) as LoyaltyRedemptionRow | undefined;

    if (!targetRow?.id) {
      throw new Error('No saved in-store reward was found to clear.');
    }

    const { error } = await supabase
      .from('loyalty_redemptions')
      .update({ notes: appendClaimedInStoreNote(targetRow.notes, note) })
      .eq('id', targetRow.id);

    if (error) {
      throw normalizeError(error, { fallbackMessage: 'Unable to remove this reward from the customer profile.' });
    }

    return { rewardLabel };
  },
};
