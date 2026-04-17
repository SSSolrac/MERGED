import { getSupabaseClient, requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";
import { getProfileForUser } from "./auth/getCurrentUserRole";
import { recordStaffOwnerLogin } from "./auth/loginAuditService";

function asAuthError(error, fallback = "Authentication failed.") {
  return asSupabaseError(error, { fallbackMessage: fallback });
}

function asNonEmptyText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isNetworkFailure(error) {
  if (!error) return false;
  if (error instanceof TypeError && /fetch/i.test(String(error.message || ""))) return true;
  return /failed to fetch|networkerror|load failed|fetch failed|econnreset|enotfound|eai_again/i.test(String(error?.message || ""));
}

function isInvalidSessionError(error) {
  const statusRaw = error?.status ?? error?.statusCode ?? null;
  const status = typeof statusRaw === "number" ? statusRaw : Number.isFinite(Number(statusRaw)) ? Number(statusRaw) : null;
  if (status === 401 || status === 403) return true;

  const message = asNonEmptyText(error?.message).toLowerCase();
  return Boolean(
    message &&
      (
        message.includes("invalid jwt") ||
        message.includes("jwt expired") ||
        message.includes("invalid refresh token") ||
        message.includes("refresh token not found") ||
        message.includes("auth session missing") ||
        message.includes("session expired")
      )
  );
}

function isEmailAlreadyExistsError(error) {
  const message = asNonEmptyText(error?.message).toLowerCase();
  const code = asNonEmptyText(error?.code).toLowerCase();
  return Boolean(
    code === "user_already_exists" ||
      message.includes("user already registered") ||
      message.includes("already registered") ||
      message.includes("already exists") ||
      message.includes("duplicate key") ||
      message.includes("idx_profiles_email_lower_unique")
  );
}

async function checkCustomerEmailExists(supabase, email) {
  const normalizedEmail = asNonEmptyText(email).toLowerCase();
  if (!normalizedEmail) return false;

  const { data, error } = await supabase.rpc("customer_email_exists", {
    p_email: normalizedEmail,
  });

  if (error) {
    const normalized = asAuthError(error, "Unable to check whether this email already exists.");
    if (normalized.kind === "missing_rpc" || normalized.kind === "missing_relation" || normalized.kind === "permission_denied") {
      return false;
    }
    throw normalized;
  }

  return Boolean(data);
}

async function signOutLocal() {
  const supabase = requireSupabaseClient();
  try {
    // Prefer local-only signout to ensure stale sessions are cleared even when offline.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    try {
      await supabase.auth.signOut();
    } catch {
      // intentionally ignore: best-effort sign out when offline or client-side issues
    }
  }
}

export async function login({ email, password } = {}) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || "").trim(),
  });

  if (error) throw asAuthError(error, "Invalid email or password.");
  const user = data?.user || null;
  const profile = user ? await getProfileForUser(user) : null;
  if (profile) await recordStaffOwnerLogin(profile);

  return {
    user,
    session: data?.session || null,
    profile,
    role: profile?.role || "customer",
  };
}

export async function signup({ name, email, password } = {}) {
  const supabase = requireSupabaseClient();
  const trimmedName = String(name || "").trim();
  const trimmedEmail = String(email || "").trim();

  if (await checkCustomerEmailExists(supabase, trimmedEmail)) {
    throw new Error("Email already exists. Please log in or use a different email.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password: String(password || "").trim(),
    options: {
      data: {
        ...(trimmedName ? { name: trimmedName, full_name: trimmedName } : {}),
      },
    },
  });

  if (error) {
    if (isEmailAlreadyExistsError(error)) {
      throw new Error("Email already exists. Please log in or use a different email.");
    }
    throw asAuthError(error, "Unable to create account.");
  }

  if (Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
    throw new Error("Email already exists. Please log in or use a different email.");
  }

  return {
    user: data?.user || null,
    session: data?.session || null,
    needsEmailVerification: Boolean(data?.user && !data?.session),
  };
}

export async function requestPasswordReset({ email, redirectTo } = {}) {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(String(email || "").trim(), {
    redirectTo: asNonEmptyText(redirectTo) || undefined,
  });

  if (error) throw asAuthError(error, "Unable to send the password reset email.");
}

export async function updatePassword({ password } = {}) {
  const supabase = requireSupabaseClient();
  const nextPassword = String(password || "").trim();
  const { data, error } = await supabase.auth.updateUser({ password: nextPassword });

  if (error) throw asAuthError(error, "Unable to update your password.");
  return data?.user || null;
}

export async function logout() {
  const supabase = requireSupabaseClient();
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  } catch (error) {
    // Treat backend failures as non-fatal: local auth must still be cleared.
    await signOutLocal();
    if (!isNetworkFailure(error)) {
      throw asAuthError(error, "Unable to sign out.");
    }
  }
}

export async function getSession() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    const authErr = asAuthError(error, "Unable to restore session.");
    if (isNetworkFailure(error)) authErr.kind = "backend_unavailable";
    throw authErr;
  }

  const session = data?.session || null;
  if (!session) return null;

  // SECURITY: validate the session with the backend before treating the user as authenticated.
  const validated = await supabase.auth.getUser();
  if (validated.error) {
    if (isNetworkFailure(validated.error)) {
      const err = asAuthError(validated.error, "Unable to reach Supabase to validate your session.");
      err.kind = "backend_unavailable";
      err.session = session;
      throw err;
    }
    if (isInvalidSessionError(validated.error)) {
      await signOutLocal();
      return null;
    }
    throw asAuthError(validated.error, "Unable to validate your session.");
  }
  if (!validated.data?.user) {
    await signOutLocal();
    return null;
  }

  return session;
}

export function onAuthStateChange(callback) {
  const { client, error } = getSupabaseClient();
  if (error || !client) return null;
  const { data } = client.auth.onAuthStateChange(callback);
  return data?.subscription || null;
}

export async function requireUser() {
  const session = await getSession();
  const user = session?.user || null;
  if (!user) throw new Error("You must be signed in to continue.");
  return user;
}
