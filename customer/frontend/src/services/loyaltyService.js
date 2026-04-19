import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";
import { getSession } from "./authService";
import { resolveMenuItemImage } from "../utils/menuImages";

export const FREE_LATTE_CHOICES = ["Cafe Latte", "Matcha Latte", "Spanish Latte"];
const CLAIMED_IN_STORE_MARKER = "[claimed-in-store]";

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

function asNullableText(value) {
  const text = asText(value);
  return text || null;
}

function hasClaimedInStoreMarker(value) {
  return asText(value).toLowerCase().includes(CLAIMED_IN_STORE_MARKER);
}

function stripClaimedInStoreMarker(value) {
  return asText(value)
    .replace(/\s*\|\s*\[claimed-in-store\][^|]*$/i, "")
    .replace(/\[claimed-in-store\][^|]*$/i, "")
    .trim();
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loyaltyFreeLatteOptionFromItemName(value) {
  const name = asText(value).toLowerCase();
  if (name === "cafe latte") return "Cafe Latte";
  if (name === "matcha latte" || name === "iced matcha latte") return "Matcha Latte";
  if (name === "spanish latte") return "Spanish Latte";
  return null;
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
  const rewardLabel = asText(row?.reward_label ?? row?.rewardLabel) || reward?.label || "Reward";
  const notes = asNullableText(row?.notes);
  return {
    id: String(row?.id || ""),
    rewardId,
    rewardLabel,
    requiredStamps: reward?.requiredStamps ?? asNumber(row?.required_stamps ?? row?.requiredStamps ?? 0),
    redeemedAt: row?.redeemed_at ?? row?.redeemedAt ?? "",
    notes: stripClaimedInStoreMarker(notes) || null,
    isClaimedInStore: hasClaimedInStoreMarker(notes),
    isGroomReward: /groom/i.test(rewardLabel),
  };
}

function normalizeStampEvent(row) {
  return {
    id: String(row?.id || ""),
    orderId: row?.order_id ? String(row.order_id) : null,
    stampDelta: asNumber(row?.stamp_delta ?? row?.stampDelta ?? 1, 1),
    source: String(row?.source || "order_completion"),
    reason: asNullableText(row?.reason),
    earnedAt: row?.earned_at ?? row?.earnedAt ?? "",
  };
}

function normalizePendingRewardItem(row, rewardsById = new Map()) {
  const rewardId = asText(row?.reward_id ?? row?.rewardId);
  const reward = rewardsById.get(rewardId) || null;
  const itemName = asText(row?.item_name ?? row?.itemName);
  const categoryName = asNullableText(row?.category_name ?? row?.categoryName);
  const imageUrl = asNullableText(row?.image_url ?? row?.imageUrl);
  const price = asNumber(row?.price ?? row?.effective_price ?? row?.effectivePrice ?? row?.unit_price ?? row?.unitPrice ?? 0);

  return {
    id: asText(row?.id),
    redemptionId: asText(row?.redemption_id ?? row?.redemptionId),
    rewardId,
    rewardLabel: asText(row?.reward_label ?? row?.rewardLabel) || reward?.label || "Reward",
    menuItemId: asText(row?.menu_item_id ?? row?.menuItemId),
    menuItemCode: asText(row?.menu_item_code ?? row?.menuItemCode),
    itemName,
    optionLabel: asNullableText(row?.option_label ?? row?.optionLabel) || loyaltyFreeLatteOptionFromItemName(itemName),
    categoryName,
    imageUrl,
    price,
    status: asText(row?.status || "pending") || "pending",
    claimedOrderId: asNullableText(row?.claimed_order_id ?? row?.claimedOrderId),
    claimedAt: row?.claimed_at ?? row?.claimedAt ?? null,
    notes: row?.notes ?? null,
    createdAt: row?.created_at ?? row?.createdAt ?? "",
    updatedAt: row?.updated_at ?? row?.updatedAt ?? "",
  };
}

function normalizeLatteRewardOption(row) {
  const itemName = asText(row?.name || row?.item_name || row?.itemName);
  const optionLabel =
    asNullableText(row?.option_label ?? row?.optionLabel) ||
    loyaltyFreeLatteOptionFromItemName(itemName) ||
    itemName;

  return {
    menuItemId: asText(row?.id || row?.menu_item_id || row?.menuItemId),
    menuItemCode: asText(row?.code || row?.menu_item_code || row?.menuItemCode),
    itemName,
    optionLabel,
    categoryName: asNullableText(row?.category_name ?? row?.categoryName),
    imageUrl: asNullableText(row?.image_url ?? row?.imageUrl),
    price: asNumber(row?.effective_price ?? row?.effectivePrice ?? row?.price ?? 0),
    displayLabel: asText(row?.category_name ?? row?.categoryName)
      ? `${itemName} (${asText(row?.category_name ?? row?.categoryName)})`
      : itemName,
  };
}

function normalizeRedeemResult(data) {
  if (!data || typeof data !== "object") return data || null;

  const rewardLabel = asText(data.rewardLabel);
  const rewardItem = data.rewardItem
    ? normalizePendingRewardItem(
        {
          ...data.rewardItem,
          rewardLabel,
          rewardId: data.rewardId,
        },
        new Map()
      )
    : null;

  return {
    redemptionId: asText(data.redemptionId),
    customerId: asText(data.customerId),
    rewardId: asText(data.rewardId),
    rewardLabel,
    requiredStamps: asNumber(data.requiredStamps),
    remainingStamps: asNumber(data.remainingStamps),
    resetsCard: Boolean(data.resetsCard),
    redeemedAt: data.redeemedAt ?? "",
    rewardItem,
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

function buildRecentActivity(stampEvents, redemptions, orderReferencesById = new Map()) {
  const stampRows = (Array.isArray(stampEvents) ? stampEvents : []).map((event) => ({
    id: `stamp:${event.id}`,
    earnedAt: event.earnedAt,
    stampDelta: Math.max(1, asNumber(event.stampDelta, 1)),
    status: String(event.source || "").includes("manual") ? "Stamps awarded" : "Stamp earned",
    description: String(event.source || "").includes("manual")
      ? `Awarded by cafe staff${event.reason ? ` - ${event.reason}` : ""}`
      : event.orderId
        ? `Completed order ${orderReferencesById.get(event.orderId) || event.orderId}`
        : "Completed order",
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

function isIgnoredLoyaltyRewardRelationError(error) {
  const normalized = asDbError(error, "Unable to load loyalty reward items.", {
    table: "loyalty_reward_items",
    operation: "select",
  });
  return normalized.kind === "missing_relation" || normalized.kind === "missing_column";
}

function decorateRewards(allRewards, stampCount, redemptions, pendingRewardItems) {
  const lastGroomRedemptionAt = redemptions
    .filter((entry) => /groom/i.test(String(entry?.rewardLabel || "")))
    .reduce((latest, entry) => Math.max(latest, toMs(entry?.redeemedAt)), 0);

  return allRewards.map((reward) => {
    const pendingRewardItemCount = pendingRewardItems.filter(
      (item) => item.rewardId === reward.id && String(item.status || "").toLowerCase() === "pending"
    ).length;

    const isRedeemedThisCycle =
      reward.isLatteReward &&
      redemptions.some(
        (entry) =>
          entry.rewardId === reward.id &&
          (lastGroomRedemptionAt === 0 || toMs(entry.redeemedAt) > lastGroomRedemptionAt)
      );

    const isUnlocked = reward.requiredStamps <= stampCount;
    return {
      ...reward,
      isUnlocked,
      canRedeem: isUnlocked && !isRedeemedThisCycle,
      isRedeemedThisCycle,
      pendingRewardItemCount,
    };
  });
}

function buildInStoreRewardBalances(redemptions) {
  const balances = new Map();

  (Array.isArray(redemptions) ? redemptions : []).forEach((entry) => {
    if (entry?.isClaimedInStore) return;
    if (!entry?.isGroomReward && !/groom/i.test(String(entry?.rewardLabel || ""))) return;

    const rewardId = asText(entry.rewardId) || asText(entry.id);
    const label = asText(entry.rewardLabel) || "Free Groom";
    const key = rewardId || label.toLowerCase();
    const current = balances.get(key) || {
      rewardId,
      label,
      count: 0,
      latestRedeemedAt: "",
    };
    const redeemedAt = entry.redeemedAt || "";

    balances.set(key, {
      ...current,
      count: current.count + 1,
      latestRedeemedAt: toMs(redeemedAt) > toMs(current.latestRedeemedAt) ? redeemedAt : current.latestRedeemedAt,
    });
  });

  return Array.from(balances.values()).sort((a, b) => toMs(b.latestRedeemedAt) - toMs(a.latestRedeemedAt));
}

export function buildLoyaltyRewardCartItem(rewardItem) {
  const itemName = asText(rewardItem?.itemName) || asText(rewardItem?.optionLabel) || "Free Drink";
  const categoryName = asNullableText(rewardItem?.categoryName);
  const unitPrice = Math.max(0, asNumber(rewardItem?.price ?? rewardItem?.unitPrice ?? rewardItem?.effectivePrice ?? 0));

  return {
    id: `loyalty-reward-${asText(rewardItem?.id)}`,
    menuItemId: asText(rewardItem?.menuItemId),
    menuItemCode: asText(rewardItem?.menuItemCode),
    code: asText(rewardItem?.menuItemCode),
    name: itemName,
    displayName: `${itemName} (Free Reward)`,
    image:
      asNullableText(rewardItem?.imageUrl) ||
      resolveMenuItemImage(itemName, categoryName || asText(rewardItem?.optionLabel)) ||
      resolveMenuItemImage(itemName) ||
      "",
    price: 0,
    originalPrice: unitPrice,
    unitPrice,
    discountAmount: unitPrice,
    qty: 1,
    category: categoryName || "Loyalty Reward",
    isLoyaltyReward: true,
    loyaltyRewardItemId: asText(rewardItem?.id),
    loyaltyRewardLabel: asText(rewardItem?.rewardLabel) || "Reward",
    loyaltyRewardOptionLabel: asNullableText(rewardItem?.optionLabel),
  };
}

export async function getFreeLatteRewardOptions() {
  const supabase = requireSupabaseClient();
  const primary = await supabase
    .from("loyalty_free_latte_items")
    .select("*")
    .order("category_name", { ascending: true })
    .order("name", { ascending: true });

  if (!primary.error) {
    return (Array.isArray(primary.data) ? primary.data : []).map(normalizeLatteRewardOption);
  }

  const normalizedPrimaryError = asDbError(primary.error, "Unable to load free latte choices.", {
    table: "loyalty_free_latte_items",
    operation: "select",
  });

  if (!["missing_relation", "missing_column"].includes(normalizedPrimaryError.kind)) {
    throw normalizedPrimaryError;
  }

  const fallback = await supabase
    .from("menu_item_effective_availability")
    .select("id, code, name, category_name, effective_price, image_url, effective_is_available")
    .eq("effective_is_available", true)
    .order("category_name", { ascending: true })
    .order("name", { ascending: true });

  if (fallback.error) {
    throw asDbError(fallback.error, "Unable to load free latte choices.", {
      table: "menu_item_effective_availability",
      operation: "select",
    });
  }

  return (Array.isArray(fallback.data) ? fallback.data : [])
    .map(normalizeLatteRewardOption)
    .filter((option) => FREE_LATTE_CHOICES.includes(option.optionLabel));
}

export async function getCustomerLoyaltyData() {
  const supabase = requireSupabaseClient();
  const user = await getUserOrNull();
  if (!user) return null;

  const [accountResult, rewardsResult, redemptionsResult, stampEventsResult, pendingRewardItemsResult] = await Promise.all([
    supabase.from("loyalty_accounts").select("*").eq("customer_id", user.id).maybeSingle(),
    supabase.from("loyalty_rewards").select("*").eq("is_active", true).order("required_stamps", { ascending: true }),
    supabase.from("loyalty_redemptions").select("*").eq("customer_id", user.id).order("redeemed_at", { ascending: false }),
    supabase.from("loyalty_stamp_events").select("*").eq("customer_id", user.id).order("earned_at", { ascending: false }),
    supabase.from("loyalty_reward_items").select("*").eq("customer_id", user.id).eq("status", "pending").order("created_at", { ascending: false }),
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
  const rawRewards = Array.isArray(rewardsResult.data) ? rewardsResult.data : [];
  const allRewardsBase = rawRewards.map(normalizeReward);
  const rewardsById = new Map(allRewardsBase.map((reward) => [reward.id, reward]));
  const redemptions = (Array.isArray(redemptionsResult.data) ? redemptionsResult.data : []).map((row) => normalizeRedemption(row, rewardsById));
  const stampEvents = (Array.isArray(stampEventsResult.data) ? stampEventsResult.data : []).map(normalizeStampEvent);

  let pendingRewardItems = [];
  if (pendingRewardItemsResult.error) {
    if (!isIgnoredLoyaltyRewardRelationError(pendingRewardItemsResult.error)) {
      throw asDbError(pendingRewardItemsResult.error, "Unable to load pending loyalty rewards.", {
        table: "loyalty_reward_items",
        operation: "select",
      });
    }
  } else {
    pendingRewardItems = (Array.isArray(pendingRewardItemsResult.data) ? pendingRewardItemsResult.data : []).map((row) =>
      normalizePendingRewardItem(row, rewardsById)
    );
  }

  const allRewards = decorateRewards(allRewardsBase, stampCount, redemptions, pendingRewardItems);
  const availableRewards = allRewards.filter((reward) => reward.isUnlocked);
  const orderIds = [...new Set(stampEvents.map((event) => event.orderId).filter(Boolean))];
  const orderReferencesById = new Map();

  if (orderIds.length) {
    const { data: orderRows, error: ordersError } = await supabase
      .from("orders")
      .select("id, code")
      .eq("customer_id", user.id)
      .in("id", orderIds);

    if (ordersError) {
      throw asDbError(ordersError, "Unable to load loyalty order references.", { table: "orders", operation: "select" });
    }

    (Array.isArray(orderRows) ? orderRows : []).forEach((row) => {
      const orderId = String(row?.id || "").trim();
      if (!orderId) return;
      orderReferencesById.set(orderId, String(row?.code || row?.id || "").trim());
    });
  }

  const recentActivity = buildRecentActivity(stampEvents, redemptions, orderReferencesById);

  return {
    customerId: user.id,
    stampCount,
    allRewards,
    availableRewards,
    inStoreRewardBalances: buildInStoreRewardBalances(redemptions),
    pendingRewardItems,
    redeemedRewards: redemptions,
    recentActivity,
    updatedAt: String(accountResult.data?.updated_at || ""),
  };
}

export function isLatteReward(reward) {
  return Boolean(reward?.isLatteReward) || /latte/i.test(String(reward?.label || ""));
}

export async function redeemLoyaltyReward(rewardId, options = "") {
  const supabase = requireSupabaseClient();
  const user = await getUserOrNull();
  if (!user) throw new Error("You must be signed in to redeem rewards.");

  const trimmedRewardId = asText(rewardId);
  if (!trimmedRewardId) throw new Error("Reward ID is required.");

  const config =
    options && typeof options === "object" && !Array.isArray(options)
      ? options
      : { notes: options };

  const menuItemId = asText(config?.menuItemId || config?.menu_item_id);
  const notes = asText(config?.notes) || null;

  const { data, error } = await supabase.rpc("redeem_loyalty_reward", {
    p_reward_id: trimmedRewardId,
    p_notes: notes,
    p_menu_item_id: menuItemId || null,
  });

  if (error) {
    throw asDbError(error, "Unable to redeem this reward right now.", {
      relation: "redeem_loyalty_reward",
      operation: "rpc",
    });
  }

  return normalizeRedeemResult(data);
}
