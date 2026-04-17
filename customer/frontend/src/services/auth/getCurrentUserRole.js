import { requireSupabaseClient } from "../../lib/supabase";
import { asSupabaseError } from "../../lib/supabaseErrors";

export const APP_ROLES = Object.freeze(["owner", "staff", "customer"]);

export function normalizeAppRole(value, fallback = "customer") {
  const role = String(value || "").trim().toLowerCase();
  return APP_ROLES.includes(role) ? role : fallback;
}

export function isKnownAppRole(value) {
  return APP_ROLES.includes(String(value || "").trim().toLowerCase());
}

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function mapProfileRow(row, authUser = null) {
  if (!row) return null;

  return {
    id: String(row.id || authUser?.id || ""),
    role: normalizeAppRole(row.role, null),
    customerCode: row.customer_code ?? null,
    name: asText(row.name || authUser?.user_metadata?.name || authUser?.user_metadata?.full_name || ""),
    email: asText(row.email || authUser?.email || ""),
    phone: asText(row.phone),
    addresses: Array.isArray(row.addresses) ? row.addresses : [],
    preferences: row.preferences && typeof row.preferences === "object" ? row.preferences : {},
    isActive: row.is_active ?? true,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getProfileForUser(authUser, { maxAttempts = 6, baseDelayMs = 150 } = {}) {
  const userId = asText(authUser?.id);
  if (!userId) return null;

  const supabase = requireSupabaseClient();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, customer_code, name, email, phone, addresses, preferences, is_active, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw asSupabaseError(error, { fallbackMessage: "Unable to load your profile.", table: "profiles", operation: "select" });
    }

    if (data) return mapProfileRow(data, authUser);

    if (attempt < maxAttempts) {
      const jitter = Math.floor(Math.random() * 40);
      await sleep(baseDelayMs * attempt + jitter);
    }
  }

  throw asSupabaseError(null, {
    fallbackMessage: "Profile is still being created. Please wait a few seconds and try again.",
    table: "profiles",
    operation: "select",
  });
}

export async function getCurrentUserRole(userId) {
  const supabase = requireSupabaseClient();
  const resolvedUserId = asText(userId) || asText((await supabase.auth.getUser()).data?.user?.id);
  if (!resolvedUserId) return null;

  const { data, error } = await supabase.from("profiles").select("role").eq("id", resolvedUserId).maybeSingle();
  if (error) {
    throw asSupabaseError(error, { fallbackMessage: "Unable to resolve your account role.", table: "profiles", operation: "select" });
  }

  return normalizeAppRole(data?.role, null);
}

export function getDefaultRouteForRole(role) {
  const normalized = normalizeAppRole(role);
  if (normalized === "owner") return "/owner/dashboard";
  if (normalized === "staff") return "/staff/dashboard";
  return "/";
}
