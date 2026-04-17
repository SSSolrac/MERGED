import { normalizeError } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';

export type DeliveryArea = {
  id: string;
  name: string;
  fixedBarangayName: string;
  city: string;
  province: string;
  country: string;
  isActive: boolean;
  deliveryStatus: 'active' | 'inactive';
  updatedBy: string;
  updatedAt: string;
};

export type DeliveryPurok = {
  id: string;
  deliveryAreaId: string;
  purokName: string;
  lat: number;
  lng: number;
  isActive: boolean;
  deliveryStatus: 'active' | 'inactive';
  sortOrder: number;
  updatedBy: string;
  updatedAt: string;
};

export type DeliveryPolygonPoint = {
  id: string;
  deliveryAreaId: string;
  lat: number;
  lng: number;
  pointOrder: number;
};

export type DeliveryCoverageConfig = {
  area: DeliveryArea;
  puroks: DeliveryPurok[];
  polygon: DeliveryPolygonPoint[];
};

type DeliveryCoverageInput = {
  area: Omit<DeliveryArea, 'updatedBy' | 'updatedAt'>;
  puroks: Array<Omit<DeliveryPurok, 'updatedBy' | 'updatedAt' | 'deliveryAreaId'>>;
  polygon: Array<Omit<DeliveryPolygonPoint, 'deliveryAreaId'>>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FALLBACK_AREA: DeliveryArea = {
  id: '',
  name: 'Ilang-Ilang Delivery Zone',
  fixedBarangayName: 'Ilayang Iyam',
  city: 'Lucena City',
  province: 'Quezon',
  country: 'Philippines',
  isActive: true,
  deliveryStatus: 'active',
  updatedBy: '',
  updatedAt: '',
};

const FALLBACK_PUROKS: DeliveryPurok[] = [
  {
    id: '',
    deliveryAreaId: '',
    purokName: 'Purok Pinagbuklod',
    lat: 13.94345,
    lng: 121.61923,
    isActive: true,
    deliveryStatus: 'active',
    sortOrder: 1,
    updatedBy: '',
    updatedAt: '',
  },
  {
    id: '',
    deliveryAreaId: '',
    purokName: 'Purok Carmelita',
    lat: 13.9409,
    lng: 121.6278,
    isActive: true,
    deliveryStatus: 'active',
    sortOrder: 2,
    updatedBy: '',
    updatedAt: '',
  },
  {
    id: '',
    deliveryAreaId: '',
    purokName: 'Purok Sampaguita',
    lat: 13.9368,
    lng: 121.6262,
    isActive: true,
    deliveryStatus: 'active',
    sortOrder: 3,
    updatedBy: '',
    updatedAt: '',
  },
];

const FALLBACK_POLYGON: DeliveryPolygonPoint[] = [
  { id: '', deliveryAreaId: '', lat: 13.94345, lng: 121.61923, pointOrder: 0 },
  { id: '', deliveryAreaId: '', lat: 13.9442, lng: 121.6254, pointOrder: 1 },
  { id: '', deliveryAreaId: '', lat: 13.9409, lng: 121.6278, pointOrder: 2 },
  { id: '', deliveryAreaId: '', lat: 13.9368, lng: 121.6262, pointOrder: 3 },
  { id: '', deliveryAreaId: '', lat: 13.9359, lng: 121.6203, pointOrder: 4 },
  { id: '', deliveryAreaId: '', lat: 13.9398, lng: 121.6179, pointOrder: 5 },
];

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const asBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'active'].includes(key)) return true;
    if (['false', '0', 'no', 'off', 'inactive'].includes(key)) return false;
  }
  return fallback;
};

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asStatus = (value: unknown): 'active' | 'inactive' =>
  asText(value).toLowerCase() === 'inactive' ? 'inactive' : 'active';

const mapAreaRow = (row: unknown): DeliveryArea => {
  const safe = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: asText(safe.id),
    name: asText(safe.name) || FALLBACK_AREA.name,
    fixedBarangayName: asText(safe.fixed_barangay_name || safe.fixedBarangayName) || FALLBACK_AREA.fixedBarangayName,
    city: asText(safe.city) || FALLBACK_AREA.city,
    province: asText(safe.province) || FALLBACK_AREA.province,
    country: asText(safe.country) || FALLBACK_AREA.country,
    isActive: asBoolean(safe.is_active ?? safe.isActive, true),
    deliveryStatus: asStatus(safe.delivery_status || safe.deliveryStatus || 'active'),
    updatedBy: asText(safe.updated_by || safe.updatedBy),
    updatedAt: asText(safe.updated_at || safe.updatedAt),
  };
};

const mapPurokRow = (row: unknown, index = 0): DeliveryPurok => {
  const safe = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: asText(safe.id),
    deliveryAreaId: asText(safe.delivery_area_id || safe.deliveryAreaId),
    purokName: asText(safe.purok_name || safe.purokName),
    lat: asNumber(safe.lat, NaN),
    lng: asNumber(safe.lng, NaN),
    isActive: asBoolean(safe.is_active ?? safe.isActive, true),
    deliveryStatus: asStatus(safe.delivery_status || safe.deliveryStatus || 'active'),
    sortOrder: asNumber(safe.sort_order ?? safe.sortOrder, index + 1),
    updatedBy: asText(safe.updated_by || safe.updatedBy),
    updatedAt: asText(safe.updated_at || safe.updatedAt),
  };
};

const mapPolygonRow = (row: unknown, index = 0): DeliveryPolygonPoint => {
  const safe = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: asText(safe.id),
    deliveryAreaId: asText(safe.delivery_area_id || safe.deliveryAreaId),
    lat: asNumber(safe.lat, NaN),
    lng: asNumber(safe.lng, NaN),
    pointOrder: asNumber(safe.point_order ?? safe.pointOrder, index),
  };
};

const cloneFallback = (): DeliveryCoverageConfig => ({
  area: { ...FALLBACK_AREA },
  puroks: FALLBACK_PUROKS.map((item) => ({ ...item })),
  polygon: FALLBACK_POLYGON.map((item) => ({ ...item })),
});

const sanitizePuroks = (puroks: DeliveryCoverageInput['puroks']) =>
  (Array.isArray(puroks) ? puroks : [])
    .map((entry, index) => ({
      id: UUID_RE.test(asText(entry?.id)) ? asText(entry?.id) : crypto.randomUUID(),
      purokName: asText(entry?.purokName),
      lat: asNumber(entry?.lat, NaN),
      lng: asNumber(entry?.lng, NaN),
      isActive: asBoolean(entry?.isActive, true),
      deliveryStatus: asStatus(entry?.deliveryStatus),
      sortOrder: asNumber(entry?.sortOrder, index + 1),
    }))
    .filter((entry) => entry.purokName && Number.isFinite(entry.lat) && Number.isFinite(entry.lng))
    .sort((left, right) => left.sortOrder - right.sortOrder);

const sanitizePolygon = (polygon: DeliveryCoverageInput['polygon']) =>
  (Array.isArray(polygon) ? polygon : [])
    .map((point, index) => ({
      id: UUID_RE.test(asText(point?.id)) ? asText(point?.id) : crypto.randomUUID(),
      lat: asNumber(point?.lat, NaN),
      lng: asNumber(point?.lng, NaN),
      pointOrder: index,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

export const deliveryCoverageService = {
  async getDeliveryCoverage(): Promise<DeliveryCoverageConfig> {
    try {
      const supabase = requireSupabaseClient();
      const { data: areaRows, error: areaError } = await supabase
        .from('delivery_areas')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (areaError) throw normalizeError(areaError, { fallbackMessage: 'Unable to load delivery area.' });
      const firstArea = Array.isArray(areaRows) && areaRows.length ? mapAreaRow(areaRows[0]) : null;
      if (!firstArea?.id) return cloneFallback();

      const [purokResult, polygonResult] = await Promise.all([
        supabase.from('delivery_puroks').select('*').eq('delivery_area_id', firstArea.id).order('sort_order', { ascending: true }),
        supabase.from('delivery_area_polygons').select('*').eq('delivery_area_id', firstArea.id).order('point_order', { ascending: true }),
      ]);

      if (purokResult.error) throw normalizeError(purokResult.error, { fallbackMessage: 'Unable to load delivery puroks.' });
      if (polygonResult.error) throw normalizeError(polygonResult.error, { fallbackMessage: 'Unable to load delivery polygon.' });

      const puroks = (Array.isArray(purokResult.data) ? purokResult.data : [])
        .map((row, index) => mapPurokRow(row, index))
        .filter((item) => item.purokName);
      const polygon = (Array.isArray(polygonResult.data) ? polygonResult.data : [])
        .map((row, index) => mapPolygonRow(row, index))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
        .sort((left, right) => left.pointOrder - right.pointOrder);

      return {
        area: firstArea,
        puroks: puroks.length ? puroks : FALLBACK_PUROKS.map((item) => ({ ...item, deliveryAreaId: firstArea.id })),
        polygon: polygon.length ? polygon : FALLBACK_POLYGON.map((item) => ({ ...item, deliveryAreaId: firstArea.id })),
      };
    } catch {
      return cloneFallback();
    }
  },

  async saveDeliveryCoverage(input: DeliveryCoverageInput): Promise<DeliveryCoverageConfig> {
    const supabase = requireSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw normalizeError(authError, { fallbackMessage: 'Unable to verify owner session.' });
    const updatedBy = asText(authData?.user?.id);

    const areaInput = input?.area;
    const isExistingArea = UUID_RE.test(asText(areaInput?.id));
    const areaPayload = {
      ...(isExistingArea ? { id: asText(areaInput?.id) } : {}),
      name: asText(areaInput?.name) || FALLBACK_AREA.name,
      fixed_barangay_name: asText(areaInput?.fixedBarangayName) || FALLBACK_AREA.fixedBarangayName,
      city: asText(areaInput?.city) || FALLBACK_AREA.city,
      province: asText(areaInput?.province) || FALLBACK_AREA.province,
      country: asText(areaInput?.country) || FALLBACK_AREA.country,
      is_active: asBoolean(areaInput?.isActive, true),
      delivery_status: asStatus(areaInput?.deliveryStatus),
      updated_by: updatedBy || null,
    };

    const areaMutation = isExistingArea
      ? supabase.from('delivery_areas').update(areaPayload).eq('id', asText(areaInput?.id)).select('*').single()
      : supabase.from('delivery_areas').insert(areaPayload).select('*').single();

    const { data: savedAreaRow, error: areaSaveError } = await areaMutation;
    if (areaSaveError) throw normalizeError(areaSaveError, { fallbackMessage: 'Unable to save delivery area.' });
    const savedArea = mapAreaRow(savedAreaRow);

    const sanitizedPuroks = sanitizePuroks(input?.puroks).map((entry) => ({
      id: entry.id,
      delivery_area_id: savedArea.id,
      purok_name: entry.purokName,
      lat: entry.lat,
      lng: entry.lng,
      is_active: entry.isActive,
      delivery_status: entry.deliveryStatus,
      sort_order: entry.sortOrder,
      updated_by: updatedBy || null,
    }));

    const sanitizedPolygon = sanitizePolygon(input?.polygon).map((entry, index) => ({
      id: entry.id,
      delivery_area_id: savedArea.id,
      lat: entry.lat,
      lng: entry.lng,
      point_order: index,
    }));

    const { error: deletePuroksError } = await supabase.from('delivery_puroks').delete().eq('delivery_area_id', savedArea.id);
    if (deletePuroksError) throw normalizeError(deletePuroksError, { fallbackMessage: 'Unable to update puroks.' });

    const { error: deletePolygonError } = await supabase.from('delivery_area_polygons').delete().eq('delivery_area_id', savedArea.id);
    if (deletePolygonError) throw normalizeError(deletePolygonError, { fallbackMessage: 'Unable to update delivery polygon.' });

    if (sanitizedPuroks.length) {
      const { error: insertPuroksError } = await supabase.from('delivery_puroks').insert(sanitizedPuroks);
      if (insertPuroksError) throw normalizeError(insertPuroksError, { fallbackMessage: 'Unable to save puroks.' });
    }

    if (sanitizedPolygon.length >= 3) {
      const { error: insertPolygonError } = await supabase.from('delivery_area_polygons').insert(sanitizedPolygon);
      if (insertPolygonError) throw normalizeError(insertPolygonError, { fallbackMessage: 'Unable to save polygon points.' });
    } else {
      throw new Error('Delivery polygon must contain at least 3 points.');
    }

    // Optional history/audit snapshot.
    const snapshot = {
      area: areaPayload,
      puroks: sanitizedPuroks,
      polygon: sanitizedPolygon,
      savedAt: new Date().toISOString(),
    };
    await supabase.from('delivery_area_versions').insert({
      delivery_area_id: savedArea.id,
      snapshot,
      updated_by: updatedBy || null,
    });

    return this.getDeliveryCoverage();
  },
};
