import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";

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

function mapBusinessSettingsRow(row) {
  const safe = row && typeof row === "object" ? row : {};
  return {
    cafeName: asText(safe.cafe_name),
    businessHours: asText(safe.business_hours),
    contactNumber: asText(safe.contact_number),
    businessEmail: asText(safe.business_email),
    cafeAddress: asText(safe.cafe_address),
    facebookHandle: asText(safe.facebook_handle),
    instagramHandle: asText(safe.instagram_handle),
    logoUrl: asText(safe.logo_url),
  };
}

export async function getPublicBusinessSettings() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.from("business_settings").select("*").eq("id", 1).maybeSingle();

  if (error) {
    throw asDbError(error, "Unable to load cafe business settings.", { table: "business_settings", operation: "select" });
  }

  if (!data) {
    throw asDbError(
      null,
      "Business settings row (id=1) is missing. Apply the latest unified_schema.sql to seed backend settings.",
      { table: "business_settings", operation: "select" }
    );
  }
  return mapBusinessSettingsRow(data);
}
