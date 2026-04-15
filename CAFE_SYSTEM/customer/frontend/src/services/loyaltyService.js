import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";
import { getSession } from "./authService";

export const FREE_LATTE_CHOICES = ["Cafe Latte", "Matcha Latte", "Spanish Latte"];

function asDbError(error, fallback, options) {
  return asSupabaseError(error, {
    fallbackMessage: fallback || "Database request failed.",
    ...options,
  });
}

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeReward(reward) {
  const label = String(reward?.label || "");
  return {
    id: String(reward?.id || ""),
    label,
    requiredStamps: asNumber(reward?.required_stamps ?? reward?.requiredStamps ?? 0),
    isLatteReward: /latte/i.test(label),
    isGroomReward: /groom/i.test(label),
  };
}

function normalizeRedemption(row, rewardsById) {
  const rewardId = String(row?.reward_id || row?.rewardId || "");
  const reward = rewardsById.get(rewardId) || null;
  return {
    id: String(row?.id || ""),
    rewardId,
    rewardLabel: reward?.label || "Reward",
    requiredStamps: reward?.requiredStamps ?? 0,
    redeemedAt: row?.redeemed_at ?? row?.redeemedAt ?? "",
    notes: row?.notes ?? null,
  };
}

function normalizeStampEvent(row) {
  return {
    id: String(row?.id || ""),
    orderId: row?.order_id ? String(row.order_id) : null,
    stampDelta: asNumber(row?.stamp_delta ?? row?.stampDelta ?? 1, 1),
    source: String(row?.source || "order_completion"),
    earnedAt: row?.earned_at ?? row?.earnedAt ?? "",
  };
}

function toMs(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function getUserOrNull() {
  const session = await getSession();
  return session?.user || null;
}

function buildRecentActivity(stampEvents, redemptions) {
  const stampRows = (Array.isArray(stampEvents) ? stampEvents : []).map((event) => ({
    id: `stamp:${event.id}`,
    earnedAt: event.earnedAt,
    stampDelta: Math.max(1, asNumber(event.stampDelta, 1)),
    status: "Stamp earned",
    description: event.orderId ? `Completed order ${event.orderId.slice(0, 8)}...` : "Completed order",
    type: "stamp",
  }));

  const redemptionRows = (Array.isArray(redemptions) ? redemptions : []).map((entry) => ({
    id: `redeem:${entry.id}`,
    earnedAt: entry.redeemedAt,
    stampDelta: 0,
    status: "Reward redeemed",
    description: entry.notes ? `${entry.rewardLabel} (${entry.notes})` : entry.rewardLabel,
    type: "redemption",
  }));

  return [...stampRows, ...redemptionRows]
    .sort((a, b) => toMs(b.earnedAt) - toMs(a.earnedAt))
    .slice(0, 15);
}

export async function getCustomerLoyaltyData() {
  const supabase = requireSupabaseClient();
  const user = await getUserOrNull();
  if (!user) return null;

  const [accountResult, rewardsResult, redemptionsResult, stampEventsResult] = await Promise.all([
    supabase.from("loyalty_accounts").select("*").eq("customer_id", user.id).maybeSingle(),
    supabase.from("loyalty_rewards").select("*").eq("is_active", true).order("required_stamps", { ascending: true }),
    supabase.from("loyalty_redemptions").select("*").eq("customer_id", user.id).order("redeemed_at", { ascending: false }),
    supabase.from("loyalty_stamp_events").select("*").eq("customer_id", user.id).order("earned_at", { ascending: false }),
  ]);

  if (accountResult.error) {
    throw asDbError(accountResult.error, "Unable to load loyalty account.", { table: "loyalty_accounts", operation: "select" });
  }
  if (rewardsResult.error) {
    throw asDbError(rewardsResult.error, "Unable to load loyalty rewards.", { table: "loyalty_rewards", operation: "select" });
  }
  if (redemptionsResult.error) {
    throw asDbError(redemptionsResult.error, "Unable to load loyalty redemptions.", { table: "loyalty_redemptions", operation: "select" });
  }
  if (stampEventsResult.error) {
    throw asDbError(stampEventsResult.error, "Unable to load loyalty stamp activity.", { table: "loyalty_stamp_events", operation: "select" });
  }

  const stampCount = Math.max(0, asNumber(accountResult.data?.stamp_count ?? 0));
  const allRewards = (Array.isArray(rewardsResult.data) ? rewardsResult.data : []).map(normalizeReward);
  const availableRewards = allRewards.filter((reward) => reward.requiredStamps <= stampCount);
  const rewardsById = new Map(allRewards.map((reward) => [reward.id, reward]));
  const redemptions = (Array.isArray(redemptionsResult.data) ? redemptionsResult.data : []).map((row) => normalizeRedemption(row, rewardsById));
  const stampEvents = (Array.isArray(stampEventsResult.data) ? stampEventsResult.data : []).map(normalizeStampEvent);
  const recentActivity = buildRecentActivity(stampEvents, redemptions);

  return {
    customerId: user.id,
    stampCount,
    allRewards,
    availableRewards,
    redeemedRewards: redemptions,
    recentActivity,
    updatedAt: String(accountResult.data?.updated_at || ""),
  };
}

export function isLatteReward(reward) {
  return Boolean(reward?.isLatteReward) || /latte/i.test(String(reward?.label || ""));
}

export async function redeemLoyaltyReward(rewardId, notes = "") {
  const supabase = requireSupabaseClient();
  const user = await getUserOrNull();
  if (!user) throw new Error("You must be signed in to redeem rewards.");

  const trimmedRewardId = String(rewardId || "").trim();
  if (!trimmedRewardId) throw new Error("Reward ID is required.");

  const { data, error } = await supabase.rpc("redeem_loyalty_reward", {
    p_reward_id: trimmedRewardId,
    p_notes: asText(notes) || null,
  });

  if (error) throw asDbError(error, "Unable to redeem this reward right now.", { relation: "redeem_loyalty_reward", operation: "rpc" });
  return data || null;
}
