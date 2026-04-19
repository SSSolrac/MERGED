import { requireSupabaseClient } from "../lib/supabase";
import { asSupabaseError } from "../lib/supabaseErrors";
import {
  DEFAULT_DELIVERY_CITY,
  DEFAULT_DELIVERY_COUNTRY,
  DEFAULT_DELIVERY_PROVINCE,
} from "../utils/deliveryAddress";
import {
  isDeliveryAreaEnabled,
  selectPreferredDeliveryArea,
  toCustomerDeliveryConfig,
  asDeliveryText,
  asDeliveryNumber,
} from "../staff/services/deliveryCoverageShared";

const CACHE_TTL_MS = 45000;
let activeDeliveryConfigCache = {
  ts: 0,
  value: null,
};

function deepClone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function logDeliveryDebug(label, payload) {
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  console.debug(`[deliveryAreaService] ${label}`, payload);
}

function createDeliveryCoverageError(message) {
  const error = new Error(message);
  error.kind = "delivery_coverage_unavailable";
  return error;
}

async function fetchAreaRows() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("delivery_areas")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw asSupabaseError(error, {
      fallbackMessage: "Unable to load active delivery area.",
      table: "delivery_areas",
      operation: "select",
    });
  }

  return Array.isArray(data) ? data : [];
}

async function fetchPuroks(areaId) {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("delivery_puroks")
    .select("*")
    .eq("delivery_area_id", areaId)
    .order("sort_order", { ascending: true })
    .order("purok_name", { ascending: true });

  if (error) {
    throw asSupabaseError(error, {
      fallbackMessage: "Unable to load delivery puroks.",
      table: "delivery_puroks",
      operation: "select",
    });
  }

  return Array.isArray(data) ? data : [];
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

  return Array.isArray(data) ? data : [];
}

export async function getActiveDeliveryConfig({ force = false } = {}) {
  if (!force && Date.now() - activeDeliveryConfigCache.ts < CACHE_TTL_MS) {
    return deepClone(activeDeliveryConfigCache.value);
  }

  const areaRows = await fetchAreaRows();
  const area = selectPreferredDeliveryArea(areaRows);

  if (!area?.id) {
    throw createDeliveryCoverageError("Delivery coverage has not been configured yet.");
  }

  if (!isDeliveryAreaEnabled(area)) {
    throw createDeliveryCoverageError("Delivery coverage is currently disabled.");
  }

  const [puroks, polygon] = await Promise.all([fetchPuroks(area.id), fetchPolygon(area.id)]);
  const config = toCustomerDeliveryConfig(area, puroks, polygon);

  if (!config) {
    throw createDeliveryCoverageError("Delivery coverage is currently unavailable.");
  }

  logDeliveryDebug("Loaded live delivery config for customer checkout.", {
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
    activePurokCount: config.puroks.length,
    polygonPointCount: config.polygon.length,
  });

  activeDeliveryConfigCache = { ts: Date.now(), value: config };
  return deepClone(config);
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
    deliveryAreaId: asDeliveryText(safe.deliveryAreaId || safe.delivery_area_id),
    selectedPurokId: asDeliveryText(safe.selectedPurokId || safe.selected_purok_id),
    selectedPurokName: asDeliveryText(safe.selectedPurokName || safe.selected_purok_name),
    fixedBarangayName: asDeliveryText(safe.fixedBarangayName || safe.fixed_barangay_name),
    city: asDeliveryText(safe.city) || DEFAULT_DELIVERY_CITY,
    province: asDeliveryText(safe.province) || DEFAULT_DELIVERY_PROVINCE,
    country: asDeliveryText(safe.country) || DEFAULT_DELIVERY_COUNTRY,
    normalizedAddress: asDeliveryText(safe.normalizedAddress || safe.normalized_address),
    latitude: asDeliveryNumber(safe.latitude ?? safe.lat, Number.NaN),
    longitude: asDeliveryNumber(safe.longitude ?? safe.lng, Number.NaN),
  };
}
