import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";
import { getStoredGuestOrderIdentity } from "./guestIdentity";

const REVIEW_CHOICES_STORAGE_KEY = "happyTailsOrderReviewChoices_v1";
const REVIEWABLE_STATUSES = new Set(["completed", "delivered"]);

function clampRating(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(5, Math.max(1, parsed));
}

function asTrimmedText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function readReviewChoices() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(REVIEW_CHOICES_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeReviewChoices(choices) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REVIEW_CHOICES_STORAGE_KEY, JSON.stringify(choices));
}

function markReviewChoice(orderId, status) {
  const safeOrderId = asTrimmedText(orderId);
  if (!safeOrderId) return;

  const choices = readReviewChoices();
  choices[safeOrderId] = {
    status,
    updatedAt: new Date().toISOString(),
  };
  writeReviewChoices(choices);
}

function normalizeReviewRow(row, index = 0) {
  const safe = row && typeof row === "object" ? row : {};
  const reviewerName = asTrimmedText(safe.reviewer_name ?? safe.reviewerName) || "Happy Tails Customer";
  const serviceLabel = asTrimmedText(safe.service_label ?? safe.serviceLabel);

  return {
    id: String(safe.id || `review-${index + 1}`),
    orderId: safe.order_id ? String(safe.order_id) : null,
    reviewerName,
    serviceLabel,
    rating: clampRating(safe.rating ?? 5),
    comment: asTrimmedText(safe.comment),
    createdAt: safe.created_at ?? safe.createdAt ?? "",
  };
}

function isMissingReviewBackend(error) {
  const normalized = asSupabaseError(error, {
    fallbackMessage: "Unable to load reviews.",
    relation: "customer_order_reviews",
  });

  return (
    normalized.kind === "missing_relation" ||
    normalized.kind === "missing_rpc" ||
    /customer_order_reviews|submit_customer_order_review/i.test(String(error?.message || ""))
  );
}

function buildReviewStats(reviews, totalCount) {
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  if (!safeReviews.length) {
    return {
      averageRating: 0,
      customerCountLabel: "0",
      recommendationRate: 0,
    };
  }

  const totalRating = safeReviews.reduce((sum, review) => sum + clampRating(review.rating), 0);
  const averageRating = Number((totalRating / safeReviews.length).toFixed(1));
  const recommendedCount = safeReviews.filter((review) => clampRating(review.rating) >= 4).length;
  const recommendationRate = Math.round((recommendedCount / safeReviews.length) * 100);
  const customerCount = Math.max(Number(totalCount || 0), safeReviews.length);

  return {
    averageRating,
    customerCountLabel: customerCount >= 1000 ? `${Math.floor(customerCount / 100) / 10}k+` : `${customerCount}`,
    recommendationRate,
  };
}

export function getReviewerInitial(reviewerName) {
  return (asTrimmedText(reviewerName) || "H").charAt(0).toUpperCase();
}

export function formatReviewRating(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "0.0/5";
  return `${clampRating(parsed).toFixed(1)}/5`;
}

export function isReviewableOrder(order) {
  const status = String(order?.status || "").toLowerCase();
  return Boolean(order?.id && REVIEWABLE_STATUSES.has(status));
}

export function getReviewServiceLabel(order) {
  const orderType = String(order?.orderType || "").toLowerCase();
  if (orderType === "delivery") return "Delivery Order";
  if (orderType === "dine_in") return "Cafe Visit";
  if (orderType === "pickup" || orderType === "takeout") return "Shop Order";
  return asTrimmedText(order?.orderTypeLabel) || "Cafe Order";
}

export function getReviewCandidateOrder(orders) {
  return (Array.isArray(orders) ? orders : []).find((order) => isReviewableOrder(order) && !hasStoredReviewChoice(order.id)) || null;
}

export function hasStoredReviewChoice(orderId) {
  const safeOrderId = asTrimmedText(orderId);
  if (!safeOrderId) return false;
  return Boolean(readReviewChoices()[safeOrderId]);
}

export function markOrderReviewDismissed(orderId) {
  markReviewChoice(orderId, "dismissed");
}

export function markOrderReviewSubmitted(orderId) {
  markReviewChoice(orderId, "submitted");
}

export async function getCommunityReviewSnapshot() {
  try {
    const supabase = requireSupabaseClient();
    const { data, error, count } = await supabase
      .from("customer_order_reviews")
      .select("id, order_id, reviewer_name, service_label, rating, comment, created_at", { count: "exact" })
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const reviews = (Array.isArray(data) ? data : [])
      .map(normalizeReviewRow)
      .filter((review) => review.comment);
    return {
      reviews: reviews.slice(0, 3),
      stats: buildReviewStats(reviews, count),
      backendReady: true,
    };
  } catch (error) {
    return {
      reviews: [],
      stats: buildReviewStats([], 0),
      backendReady: !isMissingReviewBackend(error),
    };
  }
}

export async function getExistingOrderReview(orderId) {
  const safeOrderId = asTrimmedText(orderId);
  if (!safeOrderId) return null;

  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("customer_order_reviews")
    .select("id, order_id, reviewer_name, service_label, rating, comment, created_at")
    .eq("order_id", safeOrderId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeReviewRow(data) : null;
}

export async function shouldPromptForOrderReview(order) {
  if (!isReviewableOrder(order)) return false;
  if (hasStoredReviewChoice(order.id)) return false;

  try {
    const existingReview = await getExistingOrderReview(order.id);
    if (existingReview) {
      markOrderReviewSubmitted(order.id);
      return false;
    }
  } catch {
    return true;
  }

  return true;
}

export async function submitOrderReview({ order, rating, comment } = {}) {
  if (!isReviewableOrder(order)) {
    throw new Error("Reviews are available after an order is completed.");
  }

  const normalizedComment = asTrimmedText(comment);
  if (!normalizedComment) {
    throw new Error("Please add a short comment before submitting your review.");
  }

  const supabase = requireSupabaseClient();
  const guestIdentity = getStoredGuestOrderIdentity() || {};
  const { data, error } = await supabase.rpc("submit_customer_order_review", {
    p_order_id: order.id,
    p_rating: Math.round(clampRating(rating)),
    p_comment: normalizedComment,
    p_reviewer_name: asTrimmedText(order.customerName || order.deliveryAddress?.name) || null,
    p_service_label: getReviewServiceLabel(order),
    p_guest_phone_normalized: guestIdentity.phoneNormalized || null,
    p_guest_email: guestIdentity.emailNormalized || null,
  });

  if (error) {
    if (isMissingReviewBackend(error)) {
      throw new Error("Review saving needs the customer reviews schema applied in Supabase first.");
    }
    throw asSupabaseError(error, {
      fallbackMessage: "Unable to submit your review right now.",
      relation: "submit_customer_order_review",
      operation: "rpc",
    });
  }

  markOrderReviewSubmitted(order.id);
  return normalizeReviewRow(data || {});
}
