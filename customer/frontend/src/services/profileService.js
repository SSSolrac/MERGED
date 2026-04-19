import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError, isSupabaseNoRowsError } from "../lib/supabaseErrors";
import { getSession } from "./authService";
import { normalizeAppRole } from "./auth/getCurrentUserRole";

const PROFILE_IMAGE_BUCKET = "menu-images";
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

function asDbError(error, fallback, options) {
  return asSupabaseError(error, {
    fallbackMessage: fallback || "Database request failed.",
    ...options,
  });
}

function readProfilePreferences(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function readAvatarUrl(preferences) {
  const value = preferences?.avatarUrl ?? preferences?.profilePhotoUrl;
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function readJobTitle(preferences) {
  const value = preferences?.jobTitle ?? preferences?.title;
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeImageFileName(fileName) {
  const trimmed = String(fileName || "").trim().toLowerCase();
  if (!trimmed) return "profile-photo";
  return trimmed
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getImageExtension(fileName) {
  const parts = String(fileName || "").split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1]?.trim() : "";
  if (!ext) return "jpg";
  return ext.replace(/[^a-z0-9]/gi, "") || "jpg";
}

function mapProfileRow(row) {
  if (!row) return null;
  const preferences = readProfilePreferences(row.preferences);

  return {
    id: String(row.id),
    role: normalizeAppRole(row.role),
    customerCode: row.customer_code ?? null,
    name: row.name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    addresses: Array.isArray(row.addresses) ? row.addresses : [],
    preferences,
    jobTitle: readJobTitle(preferences),
    avatarUrl: readAvatarUrl(preferences),
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
  const currentPreferences = readProfilePreferences(profile?.preferences);
  const hasAvatarUrl = profile && Object.prototype.hasOwnProperty.call(profile, "avatarUrl");
  const hasJobTitle = profile && Object.prototype.hasOwnProperty.call(profile, "jobTitle");

  if (hasAvatarUrl) {
    const avatarUrl = String(profile?.avatarUrl || "").trim();
    if (avatarUrl) currentPreferences.avatarUrl = avatarUrl;
    else delete currentPreferences.avatarUrl;
    delete currentPreferences.profilePhotoUrl;
  }

  if (hasJobTitle) {
    const jobTitle = String(profile?.jobTitle || "").trim();
    if (jobTitle) currentPreferences.jobTitle = jobTitle;
    else delete currentPreferences.jobTitle;
    delete currentPreferences.title;
  }

  const payload = {
    name: String(profile?.name || "").trim(),
    email: String(profile?.email || user.email || "").trim(),
    phone: String(profile?.phone || "").trim(),
    preferences: currentPreferences,
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

export async function uploadCustomerProfileImage(file) {
  const supabase = requireSupabaseClient();
  const user = await getUserOrNull();
  if (!user) throw new Error("You must be signed in to upload a profile photo.");
  if (!file) throw new Error("Select an image file before uploading.");
  if (!file.type || !file.type.startsWith("image/")) throw new Error("Only image files can be uploaded.");
  if (file.size > MAX_PROFILE_IMAGE_BYTES) throw new Error("Image must be 5 MB or smaller.");

  const safeName = sanitizeImageFileName(file.name || "profile-photo");
  const extension = getImageExtension(safeName);
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const path = `profiles/${user.id}/${Date.now()}-${randomSuffix}.${extension}`;

  const { error } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("bucket") && message.includes("not found")) {
      throw new Error('Storage bucket "menu-images" is missing. Create it in Supabase before uploading profile photos.');
    }
    throw asDbError(error, "Unable to upload your profile photo.", {
      relation: PROFILE_IMAGE_BUCKET,
      operation: "storage_upload",
    });
  }

  const { data } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Profile photo uploaded, but public URL could not be generated.");
  return data.publicUrl;
}
