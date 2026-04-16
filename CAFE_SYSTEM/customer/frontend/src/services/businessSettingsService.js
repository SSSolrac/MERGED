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

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DEFAULT_PUBLIC_BUSINESS_SETTINGS = {
  cafeName: "",
  businessHours: "",
  contactNumber: "",
  businessEmail: "",
  cafeAddress: "",
  facebookHandle: "",
  instagramHandle: "",
  logoUrl: "",
  enableQrph: true,
  enableGcash: true,
  enableMariBank: true,
  enableBdo: true,
  enableCash: true,
  enableDineIn: true,
  enablePickup: true,
  enableTakeout: true,
  enableDelivery: false,
  deliveryRadiusKm: 4,
  serviceFeePct: 5,
  taxPct: 12,
  kitchenCutoff: "20:30",
};

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
    enableQrph: asBoolean(safe.enable_qrph, DEFAULT_PUBLIC_BUSINESS_SETTINGS.enableQrph),
    enableGcash: asBoolean(safe.enable_gcash, DEFAULT_PUBLIC_BUSINESS_SETTINGS.enableGcash),
    enableMariBank: asBoolean(safe.enable_maribank, DEFAULT_PUBLIC_BUSINESS_SETTINGS.enableMariBank),
    enableBdo: asBoolean(safe.enable_bdo, DEFAULT_PUBLIC_BUSINESS_SETTINGS.enableBdo),
    enableCash: asBoolean(safe.enable_cash, DEFAULT_PUBLIC_BUSINESS_SETTINGS.enableCash),
    enableDineIn: asBoolean(safe.enable_dine_in, DEFAULT_PUBLIC_BUSINESS_SETTINGS.enableDineIn),
    enablePickup: asBoolean(safe.enable_pickup, DEFAULT_PUBLIC_BUSINESS_SETTINGS.enablePickup),
    enableTakeout: asBoolean(safe.enable_takeout, DEFAULT_PUBLIC_BUSINESS_SETTINGS.enableTakeout),
    enableDelivery: asBoolean(safe.enable_delivery, DEFAULT_PUBLIC_BUSINESS_SETTINGS.enableDelivery),
    deliveryRadiusKm: asNumber(safe.delivery_radius_km, DEFAULT_PUBLIC_BUSINESS_SETTINGS.deliveryRadiusKm),
    serviceFeePct: asNumber(safe.service_fee_pct, DEFAULT_PUBLIC_BUSINESS_SETTINGS.serviceFeePct),
    taxPct: asNumber(safe.tax_pct, DEFAULT_PUBLIC_BUSINESS_SETTINGS.taxPct),
    kitchenCutoff: asText(safe.kitchen_cutoff) || DEFAULT_PUBLIC_BUSINESS_SETTINGS.kitchenCutoff,
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
