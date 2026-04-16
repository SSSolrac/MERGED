import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";
import {
  DEFAULT_DELIVERY_CITY,
  DEFAULT_DELIVERY_COUNTRY,
  DEFAULT_DELIVERY_PROVINCE,
} from "../utils/deliveryAddress";

const DEFAULT_DELIVERY_CONFIG = {
  id: "",
  source: "fallback",
  name: "Ilang-Ilang Delivery Zone",
  fixedBarangayName: "Ilayang Iyam",
  city: DEFAULT_DELIVERY_CITY,
  province: DEFAULT_DELIVERY_PROVINCE,
  country: DEFAULT_DELIVERY_COUNTRY,
  isActive: false,
  deliveryStatus: "inactive",
  puroks: [
    {
      id: "fallback-purok-1",
      purokName: "Purok Pinagbuklod",
      isActive: true,
      deliveryStatus: "active",
      sortOrder: 1,
    },
    {
      id: "fallback-purok-2",
      purokName: "Purok Carmelita",
      isActive: true,
      deliveryStatus: "active",
      sortOrder: 2,
    },
    {
      id: "fallback-purok-3",
      purokName: "Purok Sampaguita",
      isActive: true,
      deliveryStatus: "active",
      sortOrder: 3,
    },
  ],
  polygon: [
    { id: "fallback-point-1", lat: 13.94345, lng: 121.61923, pointOrder: 0 },
    { id: "fallback-point-2", lat: 13.9442, lng: 121.6254, pointOrder: 1 },
    { id: "fallback-point-3", lat: 13.9409, lng: 121.6278, pointOrder: 2 },
    { id: "fallback-point-4", lat: 13.9368, lng: 121.6262, pointOrder: 3 },
    { id: "fallback-point-5", lat: 13.9359, lng: 121.6203, pointOrder: 4 },
    { id: "fallback-point-6", lat: 13.9398, lng: 121.6179, pointOrder: 5 },
  ],
};

const CACHE_TTL_MS = 45000;
let activeDeliveryConfigCache = {
  ts: 0,
  value: DEFAULT_DELIVERY_CONFIG,
};

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    if (["true", "1", "yes", "on", "active"].includes(key)) return true;
    if (["false", "0", "no", "off", "inactive"].includes(key)) return false;
  }
  return fallback;
}

function mapDeliveryAreaRow(row) {
  const safe = row && typeof row === "object" ? row : {};
  return {
    id: asText(safe.id),
    source: "database",
    name: asText(safe.name) || DEFAULT_DELIVERY_CONFIG.name,
    fixedBarangayName: asText(safe.fixed_barangay_name || safe.fixedBarangayName) || DEFAULT_DELIVERY_CONFIG.fixedBarangayName,
    city: asText(safe.city) || DEFAULT_DELIVERY_CITY,
    province: asText(safe.province) || DEFAULT_DELIVERY_PROVINCE,
    country: asText(safe.country) || DEFAULT_DELIVERY_COUNTRY,
    isActive: asBoolean(safe.is_active ?? safe.isActive, true),
    deliveryStatus: asText(safe.delivery_status || safe.deliveryStatus || "active").toLowerCase(),
  };
}

function mapPurokRow(row, index = 0) {
  const safe = row && typeof row === "object" ? row : {};
  return {
    id: asText(safe.id || `purok-${index + 1}`),
    purokName: asText(safe.purok_name || safe.purokName),
    isActive: asBoolean(safe.is_active ?? safe.isActive, true),
    deliveryStatus: asText(safe.delivery_status || safe.deliveryStatus || "active").toLowerCase(),
    sortOrder: asNumber(safe.sort_order ?? safe.sortOrder, index + 1),
  };
}

function mapPolygonRow(row, index = 0) {
  const safe = row && typeof row === "object" ? row : {};
  return {
    id: asText(safe.id || `point-${index + 1}`),
    lat: asNumber(safe.lat, NaN),
    lng: asNumber(safe.lng, NaN),
    pointOrder: asNumber(safe.point_order ?? safe.pointOrder, index),
  };
}

function cloneDefaultConfig() {
  return {
    ...DEFAULT_DELIVERY_CONFIG,
    puroks: DEFAULT_DELIVERY_CONFIG.puroks.map((item) => ({ ...item })),
    polygon: DEFAULT_DELIVERY_CONFIG.polygon.map((item) => ({ ...item })),
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function logDeliveryDebug(label, payload) {
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  console.debug(`[deliveryAreaService] ${label}`, payload);
}

async function fetchLatestArea() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("delivery_areas")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw asSupabaseError(error, {
      fallbackMessage: "Unable to load active delivery area.",
      table: "delivery_areas",
      operation: "select",
    });
  }

  if (!data) return null;
  return mapDeliveryAreaRow(data);
}

async function fetchActivePuroks(areaId) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("delivery_puroks")
    .select("*")
    .eq("delivery_area_id", areaId)
    .eq("is_active", true)
    .eq("delivery_status", "active")
    .order("sort_order", { ascending: true })
    .order("purok_name", { ascending: true });

  if (error) {
    throw asSupabaseError(error, {
      fallbackMessage: "Unable to load active delivery puroks.",
      table: "delivery_puroks",
      operation: "select",
    });
  }

  return (Array.isArray(data) ? data : [])
    .map((row, index) => mapPurokRow(row, index))
    .filter((item) => item.purokName);
}

async function fetchPolygon(areaId) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("delivery_area_polygons")
    .select("*")
    .eq("delivery_area_id", areaId)
    .order("point_order", { ascending: true });

  if (error) {
    throw asSupabaseError(error, {
      fallbackMessage: "Unable to load delivery area polygon.",
      table: "delivery_area_polygons",
      operation: "select",
    });
  }

  return (Array.isArray(data) ? data : [])
    .map((row, index) => mapPolygonRow(row, index))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

export async function getActiveDeliveryConfig({ force = false } = {}) {
  if (!force && Date.now() - activeDeliveryConfigCache.ts < CACHE_TTL_MS) {
    return deepClone(activeDeliveryConfigCache.value);
  }

  try {
    const area = await fetchLatestArea();
    if (!area?.id) {
      const fallbackConfig = cloneDefaultConfig();
      logDeliveryDebug("Using fallback delivery config because no delivery area row was found.", fallbackConfig);
      activeDeliveryConfigCache = { ts: Date.now(), value: fallbackConfig };
      return deepClone(fallbackConfig);
    }

    const [puroks, polygon] = await Promise.all([fetchActivePuroks(area.id), fetchPolygon(area.id)]);
    const config = {
      ...cloneDefaultConfig(),
      ...area,
      source: "database",
      puroks: puroks.length ? puroks : cloneDefaultConfig().puroks,
      polygon: polygon.length ? polygon : cloneDefaultConfig().polygon,
    };

    logDeliveryDebug("Loaded delivery config for customer checkout.", {
      area: {
        id: config.id,
        name: config.name,
        fixedBarangayName: config.fixedBarangayName,
        city: config.city,
        province: config.province,
        country: config.country,
        isActive: config.isActive,
        deliveryStatus: config.deliveryStatus,
        source: config.source,
      },
      puroks: config.puroks,
      polygon: config.polygon,
    });

    activeDeliveryConfigCache = { ts: Date.now(), value: config };
    return deepClone(config);
  } catch (error) {
    const fallbackConfig = cloneDefaultConfig();
    logDeliveryDebug("Falling back to local delivery config after load failure.", {
      error,
      fallbackConfig,
    });
    activeDeliveryConfigCache = { ts: Date.now(), value: fallbackConfig };
    return deepClone(fallbackConfig);
  }
}

export async function validateDeliveryAddressOnServer(deliveryAddressPayload) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.rpc("validate_delivery_address", {
    p_delivery_address: deliveryAddressPayload,
  });

  if (error) {
    throw asSupabaseError(error, {
      fallbackMessage: "Unable to validate delivery address with the server.",
      relation: "validate_delivery_address",
      operation: "rpc",
    });
  }

  const safe = data && typeof data === "object" ? data : {};
  return {
    deliveryAreaId: asText(safe.deliveryAreaId || safe.delivery_area_id),
    selectedPurokId: asText(safe.selectedPurokId || safe.selected_purok_id),
    selectedPurokName: asText(safe.selectedPurokName || safe.selected_purok_name),
    fixedBarangayName: asText(safe.fixedBarangayName || safe.fixed_barangay_name),
    city: asText(safe.city) || DEFAULT_DELIVERY_CITY,
    province: asText(safe.province) || DEFAULT_DELIVERY_PROVINCE,
    country: asText(safe.country) || DEFAULT_DELIVERY_COUNTRY,
    normalizedAddress: asText(safe.normalizedAddress || safe.normalized_address),
    latitude: asNumber(safe.latitude ?? safe.lat, NaN),
    longitude: asNumber(safe.longitude ?? safe.lng, NaN),
  };
}
