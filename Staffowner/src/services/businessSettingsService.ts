import { normalizeError } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';

export type BusinessSettings = {
  cafeName: string;
  businessHours: string;
  contactNumber: string;
  businessEmail: string;
  cafeAddress: string;
  facebookHandle: string;
  instagramHandle: string;
  logoUrl: string;
  enableQrph: boolean;
  enableGcash: boolean;
  enableMariBank: boolean;
  enableBdo: boolean;
  enableCash: boolean;
  enableDineIn: boolean;
  enablePickup: boolean;
  enableTakeout: boolean;
  enableDelivery: boolean;
  deliveryRadiusKm: number;
  serviceFeePct: number;
  taxPct: number;
  kitchenCutoff: string;
  updatedAt: string;
};

type BusinessSettingsInput = Omit<BusinessSettings, 'updatedAt'>;

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const asBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
};

const asNumber = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mapBusinessSettingsRow = (row: unknown): BusinessSettings => {
  const record = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    cafeName: asText(record.cafe_name),
    businessHours: asText(record.business_hours),
    contactNumber: asText(record.contact_number),
    businessEmail: asText(record.business_email),
    cafeAddress: asText(record.cafe_address),
    facebookHandle: asText(record.facebook_handle),
    instagramHandle: asText(record.instagram_handle),
    logoUrl: asText(record.logo_url),
    enableQrph: asBoolean(record.enable_qrph, true),
    enableGcash: asBoolean(record.enable_gcash, true),
    enableMariBank: asBoolean(record.enable_maribank, true),
    enableBdo: asBoolean(record.enable_bdo, true),
    enableCash: asBoolean(record.enable_cash, true),
    enableDineIn: asBoolean(record.enable_dine_in, true),
    enablePickup: asBoolean(record.enable_pickup, true),
    enableTakeout: asBoolean(record.enable_takeout, true),
    enableDelivery: asBoolean(record.enable_delivery, false),
    deliveryRadiusKm: asNumber(record.delivery_radius_km, 4),
    serviceFeePct: asNumber(record.service_fee_pct, 5),
    taxPct: asNumber(record.tax_pct, 12),
    kitchenCutoff: asText(record.kitchen_cutoff),
    updatedAt: asText(record.updated_at),
  };
};

export const businessSettingsService = {
  async getBusinessSettings(): Promise<BusinessSettings> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.from('business_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load business settings.' });
    if (!data) {
      throw new Error('Business settings row (id=1) is missing. Apply the latest unified_schema.sql to seed backend settings.');
    }
    return mapBusinessSettingsRow(data);
  },

  async saveBusinessSettings(settings: BusinessSettingsInput): Promise<BusinessSettings> {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();

    const payload = {
      id: 1,
      cafe_name: asText(settings.cafeName),
      business_hours: asText(settings.businessHours),
      contact_number: asText(settings.contactNumber),
      business_email: asText(settings.businessEmail),
      cafe_address: asText(settings.cafeAddress),
      facebook_handle: asText(settings.facebookHandle),
      instagram_handle: asText(settings.instagramHandle),
      logo_url: asText(settings.logoUrl) || null,
      enable_qrph: settings.enableQrph,
      enable_gcash: settings.enableGcash,
      enable_maribank: settings.enableMariBank,
      enable_bdo: settings.enableBdo,
      enable_cash: settings.enableCash,
      enable_dine_in: settings.enableDineIn,
      enable_pickup: settings.enablePickup,
      enable_takeout: settings.enableTakeout,
      enable_delivery: settings.enableDelivery,
      delivery_radius_km: Number.isFinite(settings.deliveryRadiusKm) ? settings.deliveryRadiusKm : 0,
      service_fee_pct: Number.isFinite(settings.serviceFeePct) ? settings.serviceFeePct : 0,
      tax_pct: Number.isFinite(settings.taxPct) ? settings.taxPct : 0,
      kitchen_cutoff: asText(settings.kitchenCutoff) || '20:30',
      updated_by: authData?.user?.id || null,
    };

    const { data, error } = await supabase.from('business_settings').upsert(payload, { onConflict: 'id' }).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save business settings.' });
    return mapBusinessSettingsRow(data);
  },
};
