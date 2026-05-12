import { normalizeError } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';

const BRANDING_IMAGE_BUCKET = 'menu-images';
const MAX_BRANDING_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_BUSINESS_HOURS_TEXT = 'Monday - Friday: 8:00 AM - 7:30 PM\nSaturday - Sunday: 8:00 AM - 8:00 PM';
const DEFAULT_ORDER_WINDOW_STORAGE_VALUE = 'Weekdays 08:00-19:30; Weekends 08:00-20:00';

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

export type BusinessSettingsSaveInput = Omit<BusinessSettings, 'updatedAt'> & {
  updatedByUserId?: string | null;
};

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

const sanitizeAssetFileName = (fileName: string) => {
  const trimmed = fileName.trim().toLowerCase();
  if (!trimmed) return 'branding-asset';
  return trimmed
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const getAssetExtension = (fileName: string) => {
  const parts = fileName.split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1]?.trim() : '';
  if (!ext) return 'jpg';
  return ext.replace(/[^a-z0-9]/gi, '') || 'jpg';
};

const mapBusinessSettingsRow = (row: unknown): BusinessSettings => {
  const record = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    cafeName: asText(record.cafe_name),
    businessHours: asText(record.business_hours) || DEFAULT_BUSINESS_HOURS_TEXT,
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
    kitchenCutoff: asText(record.kitchen_cutoff) || DEFAULT_ORDER_WINDOW_STORAGE_VALUE,
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

  async saveBusinessSettings(settings: BusinessSettingsSaveInput): Promise<BusinessSettings> {
    const supabase = requireSupabaseClient();

    const payload = {
      id: 1,
      cafe_name: asText(settings.cafeName),
      business_hours: asText(settings.businessHours) || DEFAULT_BUSINESS_HOURS_TEXT,
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
      kitchen_cutoff: asText(settings.kitchenCutoff) || DEFAULT_ORDER_WINDOW_STORAGE_VALUE,
      updated_by: asText(settings.updatedByUserId) || null,
    };

    const { data, error } = await supabase.from('business_settings').upsert(payload, { onConflict: 'id' }).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save business settings.' });
    return mapBusinessSettingsRow(data);
  },

  async uploadBrandingAsset(file: File): Promise<string> {
    if (!file) throw new Error('Select an image file before uploading.');
    if (!file.type || !file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
    if (file.size > MAX_BRANDING_IMAGE_BYTES) throw new Error('Image must be 5 MB or smaller.');

    const supabase = requireSupabaseClient();
    const safeName = sanitizeAssetFileName(file.name || 'branding-asset');
    const extension = getAssetExtension(safeName);
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    const path = `branding/${Date.now()}-${randomSuffix}.${extension}`;

    const { error } = await supabase.storage.from(BRANDING_IMAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('bucket') && message.includes('not found')) {
        throw new Error('Storage bucket "menu-images" is missing. Create it in Supabase before uploading branding images.');
      }
      throw normalizeError(error, { fallbackMessage: 'Unable to upload branding image.' });
    }

    const { data } = supabase.storage.from(BRANDING_IMAGE_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('Image uploaded, but public URL could not be generated.');
    return data.publicUrl;
  },
};
