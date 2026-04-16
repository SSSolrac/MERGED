import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError, isSupabaseNoRowsError } from "../lib/supabaseErrors";
import { getSession } from "./authService";

function asDbError(error, fallback, options) {
  return asSupabaseError(error, {
    fallbackMessage: fallback || "Database request failed.",
    ...options,
  });
}

function mapProfileRow(row) {
  if (!row) return null;

  return {
    id: String(row.id),
    customerCode: row.customer_code ?? null,
    name: row.name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    addresses: Array.isArray(row.addresses) ? row.addresses : [],
    preferences: row.preferences && typeof row.preferences === "object" ? row.preferences : {},
    isActive: row.is_active ?? true,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

async function getUserOrNull() {
  const session = await getSession();
  return session?.user || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProfileRow(user, { maxAttempts = 6, baseDelayMs = 150 } = {}) {
  const supabase = requireSupabaseClient();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

    if (error) throw asDbError(error, "Unable to load your profile.", { table: "profiles", operation: "select" });
    if (data) return data;

    // Race condition: the backend trigger may not be visible immediately after signup/login.
    // Wait briefly and retry (bounded).
    if (attempt < maxAttempts) {
      const jitter = Math.floor(Math.random() * 40);
      await sleep(baseDelayMs * attempt + jitter);
    }
  }

  throw asDbError(
    null,
    "Profile is still being created after several retries. If you just signed up, wait a few seconds and retry. Otherwise verify the `public.handle_new_user_profile()` trigger exists, authenticated users can select `public.profiles`, and check Supabase logs for trigger errors.",
    { table: "profiles", operation: "select" }
  );
}

export async function getCustomerProfile() {
  const user = await getUserOrNull();
  if (!user) return null;

  const row = await waitForProfileRow(user);
  return mapProfileRow(row);
}

export async function saveCustomerProfile(profile) {
  const supabase = requireSupabaseClient();
  const user = await getUserOrNull();
  if (!user) throw new Error("You must be signed in to update your profile.");

  await waitForProfileRow(user);

  const payload = {
    name: String(profile?.name || "").trim(),
    email: String(profile?.email || user.email || "").trim(),
    phone: String(profile?.phone || "").trim(),
    preferences: profile?.preferences && typeof profile.preferences === "object" ? profile.preferences : {},
    updated_at: new Date().toISOString(),
  };

  const hasAddresses = profile && Object.prototype.hasOwnProperty.call(profile, "addresses");
  if (hasAddresses) {
    payload.addresses = Array.isArray(profile.addresses) ? profile.addresses : [];
  }

  const { data, error } = await supabase.from("profiles").update(payload).eq("id", user.id).select("*").single();

  if (error && isSupabaseNoRowsError(error)) {
    await waitForProfileRow(user);
    const retry = await supabase.from("profiles").update(payload).eq("id", user.id).select("*").single();
    if (retry.error) throw asDbError(retry.error, "Unable to save your profile.", { table: "profiles", operation: "update" });
    return mapProfileRow(retry.data);
  }

  if (error) throw asDbError(error, "Unable to save your profile.", { table: "profiles", operation: "update" });
  return mapProfileRow(data);
}
