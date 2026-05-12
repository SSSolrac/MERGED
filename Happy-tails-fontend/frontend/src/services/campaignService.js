import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";

const CAMPAIGN_SOURCE_TTL_MS = 30000;
const FALLBACK_ANNOUNCEMENTS = [];
let campaignSourceCache = { ts: 0, data: [] };

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    if (["true", "1", "yes", "on", "active"].includes(key)) return true;
    if (["false", "0", "no", "off", "inactive"].includes(key)) return false;
  }
  return fallback;
}

function toDateMs(value) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function toAnnouncement(row, index = 0) {
  const safe = row && typeof row === "object" ? row : {};
  const id = asText(safe.id || safe.slug || `announcement-${index + 1}`);
  const title = asText(safe.title || safe.name);
  const message = asText(safe.message || safe.body || safe.description);
  const ctaText = asText(safe.cta_text || safe.ctaText || safe.action_text || safe.actionText);
  const ctaLink = asText(safe.cta_link || safe.ctaLink || safe.action_link || safe.actionLink);
  const startAt = asText(safe.start_at || safe.starts_at || safe.startAt || safe.startsAt);
  const endAt = asText(safe.end_at || safe.ends_at || safe.endAt || safe.endsAt);
  const createdAt = asText(safe.created_at || safe.createdAt || startAt || new Date().toISOString());
  const updatedAt = asText(safe.updated_at || safe.updatedAt || createdAt || startAt || new Date().toISOString());
  const isActiveRaw = safe.is_active ?? safe.active ?? safe.isActive;

  return {
    id,
    title,
    message,
    ctaText,
    ctaLink,
    startAt,
    endAt,
    createdAt,
    updatedAt,
    isActive: asBoolean(isActiveRaw, true),
  };
}

function cloneAnnouncements(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
}

function isCurrentAnnouncement(announcement, nowMs) {
  if (!announcement || !announcement.isActive) return false;
  if (!announcement.message) return false;

  const startsMs = toDateMs(announcement.startAt);
  const endsMs = toDateMs(announcement.endAt);
  if (startsMs && startsMs > nowMs) return false;
  if (endsMs && endsMs < nowMs) return false;

  return true;
}

function sortAnnouncements(items) {
  return [...items].sort((left, right) => {
    const leftStart = toDateMs(left.startAt) || toDateMs(left.updatedAt) || toDateMs(left.createdAt);
    const rightStart = toDateMs(right.startAt) || toDateMs(right.updatedAt) || toDateMs(right.createdAt);
    return rightStart - leftStart;
  });
}

function newestAnnouncementMs(items) {
  return (Array.isArray(items) ? items : []).reduce((latest, announcement) => {
    const ms = toDateMs(announcement.updatedAt) || toDateMs(announcement.startAt) || toDateMs(announcement.createdAt);
    return Math.max(latest, ms);
  }, 0);
}

async function fetchCampaignAnnouncementsTable() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("campaign_announcements")
    .select("id, title, message, cta_text, cta_link, is_active, start_at, end_at, created_at, updated_at")
    .order("start_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw asSupabaseError(error, {
      fallbackMessage: "Unable to load campaign announcements.",
      table: "campaign_announcements",
      operation: "select",
    });
  }

  return (Array.isArray(data) ? data : []).map((row, index) => toAnnouncement(row, index));
}

async function fetchBusinessSettingsAnnouncements() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.from("business_settings").select("*").eq("id", 1).maybeSingle();

  if (error) {
    throw asSupabaseError(error, {
      fallbackMessage: "Unable to load fallback campaign announcements.",
      table: "business_settings",
      operation: "select",
    });
  }

  if (!data || typeof data !== "object") return [];

  const campaign = Array.isArray(data.campaign_announcements) ? data.campaign_announcements : null;
  const homepage = Array.isArray(data.homepage_announcements) ? data.homepage_announcements : null;
  const legacy = Array.isArray(data.announcements) ? data.announcements : null;

  const preferred = [campaign, homepage, legacy].find((entry) => Array.isArray(entry) && entry.length) || campaign || homepage || legacy || [];
  return preferred.map((row, index) => toAnnouncement(row, index));
}

function getSafeFallbackAnnouncements() {
  return FALLBACK_ANNOUNCEMENTS.map((row, index) => toAnnouncement(row, index));
}

async function getCampaignSource() {
  let fromTable = [];
  let fromBusinessSettings = [];

  try {
    fromTable = await fetchCampaignAnnouncementsTable();
  } catch {
    // Non-breaking fallback.
  }

  try {
    fromBusinessSettings = await fetchBusinessSettingsAnnouncements();
  } catch {
    // Non-breaking fallback.
  }

  if (fromTable.length && fromBusinessSettings.length) {
    return newestAnnouncementMs(fromBusinessSettings) > newestAnnouncementMs(fromTable)
      ? fromBusinessSettings
      : fromTable;
  }

  if (fromTable.length) return fromTable;
  if (fromBusinessSettings.length) return fromBusinessSettings;
  return getSafeFallbackAnnouncements();
}

export async function getActiveCampaignAnnouncements({ force = false, now = new Date() } = {}) {
  const nowMs = toDateMs(now) || Date.now();
  if (!force && Date.now() - campaignSourceCache.ts < CAMPAIGN_SOURCE_TTL_MS) {
    return cloneAnnouncements(campaignSourceCache.data).filter((item) => isCurrentAnnouncement(item, nowMs));
  }

  const loaded = await getCampaignSource().catch(() => getSafeFallbackAnnouncements());
  const sorted = sortAnnouncements(loaded);
  campaignSourceCache = {
    ts: Date.now(),
    data: sorted,
  };

  return cloneAnnouncements(sorted).filter((item) => isCurrentAnnouncement(item, nowMs));
}
