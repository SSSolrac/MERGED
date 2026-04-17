import { requireSupabaseClient } from "../../lib/supabase";

const OPEN_LOGIN_ID_KEY = "happyTailsOpenStaffLoginHistoryId";

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getUserAgent() {
  try {
    return typeof navigator !== "undefined" ? navigator.userAgent : "";
  } catch {
    return "";
  }
}

function getDevice() {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    return asText(nav?.platform) || getUserAgent();
  } catch {
    return getUserAgent();
  }
}

function persistOpenLoginId(id) {
  try {
    if (id) localStorage.setItem(OPEN_LOGIN_ID_KEY, id);
    else localStorage.removeItem(OPEN_LOGIN_ID_KEY);
  } catch {
    // best effort only
  }
}

function loadOpenLoginId() {
  try {
    return asText(localStorage.getItem(OPEN_LOGIN_ID_KEY)) || null;
  } catch {
    return null;
  }
}

export async function recordStaffOwnerLogin(profile) {
  const role = asText(profile?.role);
  if (role !== "owner" && role !== "staff") return;

  try {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from("login_history")
      .insert({
        profile_id: profile.id,
        email: profile.email,
        role,
        success: true,
        device: getDevice() || null,
        user_agent: getUserAgent() || null,
        logged_in_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw error;
    const id = asText(data?.id);
    if (id) persistOpenLoginId(id);
  } catch (error) {
    console.warn("Unable to record staff/owner login history", error);
  }
}

export async function recordStaffOwnerLogout(profile) {
  const role = asText(profile?.role);
  if (role !== "owner" && role !== "staff") return;

  try {
    const supabase = requireSupabaseClient();
    let targetId = loadOpenLoginId();

    if (!targetId) {
      const lookup = await supabase
        .from("login_history")
        .select("id")
        .eq("profile_id", profile.id)
        .is("logged_out_at", null)
        .order("logged_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lookup.error) targetId = asText(lookup.data?.id) || null;
    }

    if (!targetId) return;

    const { error } = await supabase
      .from("login_history")
      .update({ logged_out_at: new Date().toISOString() })
      .eq("id", targetId)
      .eq("profile_id", profile.id);

    if (error) throw error;
    persistOpenLoginId(null);
  } catch (error) {
    console.warn("Unable to record staff/owner logout time", error);
  }
}
