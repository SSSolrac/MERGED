const DEFAULT_DELIVERY_CITY = "Lucena City";
const DEFAULT_DELIVERY_PROVINCE = "Quezon";
const DEFAULT_DELIVERY_COUNTRY = "Philippines";

export const DEFAULT_DELIVERY_AREA = {
  id: "",
  name: "Ilang-Ilang Delivery Zone",
  fixedBarangayName: "Ilayang Iyam",
  city: DEFAULT_DELIVERY_CITY,
  province: DEFAULT_DELIVERY_PROVINCE,
  country: DEFAULT_DELIVERY_COUNTRY,
  isActive: true,
  deliveryStatus: "active",
  updatedBy: "",
  updatedAt: "",
};

export const DEFAULT_DELIVERY_PUROKS = [
  {
    id: "",
    deliveryAreaId: "",
    purokName: "Purok Pinagbuklod",
    lat: 13.94345,
    lng: 121.61923,
    isActive: true,
    deliveryStatus: "active",
    sortOrder: 1,
    updatedBy: "",
    updatedAt: "",
  },
  {
    id: "",
    deliveryAreaId: "",
    purokName: "Purok Carmelita",
    lat: 13.9409,
    lng: 121.6278,
    isActive: true,
    deliveryStatus: "active",
    sortOrder: 2,
    updatedBy: "",
    updatedAt: "",
  },
  {
    id: "",
    deliveryAreaId: "",
    purokName: "Purok Sampaguita",
    lat: 13.9368,
    lng: 121.6262,
    isActive: true,
    deliveryStatus: "active",
    sortOrder: 3,
    updatedBy: "",
    updatedAt: "",
  },
];

export const DEFAULT_DELIVERY_POLYGON = [
  { id: "", deliveryAreaId: "", lat: 13.94345, lng: 121.61923, pointOrder: 0 },
  { id: "", deliveryAreaId: "", lat: 13.9442, lng: 121.6254, pointOrder: 1 },
  { id: "", deliveryAreaId: "", lat: 13.9409, lng: 121.6278, pointOrder: 2 },
  { id: "", deliveryAreaId: "", lat: 13.9368, lng: 121.6262, pointOrder: 3 },
  { id: "", deliveryAreaId: "", lat: 13.9359, lng: 121.6203, pointOrder: 4 },
  { id: "", deliveryAreaId: "", lat: 13.9398, lng: 121.6179, pointOrder: 5 },
];

export function asDeliveryText(value) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function asDeliveryNumber(value, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asDeliveryBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    if (["true", "1", "yes", "on", "active"].includes(key)) return true;
    if (["false", "0", "no", "off", "inactive"].includes(key)) return false;
  }
  return fallback;
}

export function asDeliveryStatus(value) {
  return asDeliveryText(value).toLowerCase() === "inactive" ? "inactive" : "active";
}

export function isDeliveryAreaEnabled(area) {
  return Boolean(area) && area.isActive !== false && asDeliveryStatus(area.deliveryStatus) === "active";
}

export function isDeliveryPurokEnabled(purok) {
  return Boolean(purok) && purok.isActive !== false && asDeliveryStatus(purok.deliveryStatus) === "active";
}

export function mapDeliveryAreaRecord(row) {
  const safe = row && typeof row === "object" ? row : {};
  return {
    id: asDeliveryText(safe.id),
    name: asDeliveryText(safe.name) || DEFAULT_DELIVERY_AREA.name,
    fixedBarangayName:
      asDeliveryText(safe.fixed_barangay_name || safe.fixedBarangayName) || DEFAULT_DELIVERY_AREA.fixedBarangayName,
    city: asDeliveryText(safe.city) || DEFAULT_DELIVERY_CITY,
    province: asDeliveryText(safe.province) || DEFAULT_DELIVERY_PROVINCE,
    country: asDeliveryText(safe.country) || DEFAULT_DELIVERY_COUNTRY,
    isActive: asDeliveryBoolean(safe.is_active ?? safe.isActive, true),
    deliveryStatus: asDeliveryStatus(safe.delivery_status || safe.deliveryStatus || "active"),
    updatedBy: asDeliveryText(safe.updated_by || safe.updatedBy),
    updatedAt: asDeliveryText(safe.updated_at || safe.updatedAt),
  };
}

export function mapDeliveryPurokRecord(row, index = 0) {
  const safe = row && typeof row === "object" ? row : {};
  return {
    id: asDeliveryText(safe.id || `purok-${index + 1}`),
    deliveryAreaId: asDeliveryText(safe.delivery_area_id || safe.deliveryAreaId),
    purokName: asDeliveryText(safe.purok_name || safe.purokName),
    lat: asDeliveryNumber(safe.lat, Number.NaN),
    lng: asDeliveryNumber(safe.lng, Number.NaN),
    isActive: asDeliveryBoolean(safe.is_active ?? safe.isActive, true),
    deliveryStatus: asDeliveryStatus(safe.delivery_status || safe.deliveryStatus || "active"),
    sortOrder: asDeliveryNumber(safe.sort_order ?? safe.sortOrder, index + 1),
    updatedBy: asDeliveryText(safe.updated_by || safe.updatedBy),
    updatedAt: asDeliveryText(safe.updated_at || safe.updatedAt),
  };
}

export function mapDeliveryPolygonRecord(row, index = 0) {
  const safe = row && typeof row === "object" ? row : {};
  return {
    id: asDeliveryText(safe.id || `point-${index + 1}`),
    deliveryAreaId: asDeliveryText(safe.delivery_area_id || safe.deliveryAreaId),
    lat: asDeliveryNumber(safe.lat, Number.NaN),
    lng: asDeliveryNumber(safe.lng, Number.NaN),
    pointOrder: asDeliveryNumber(safe.point_order ?? safe.pointOrder, index),
  };
}

export function normalizeDeliveryPuroks(rows, { activeOnly = false } = {}) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map((row, index) => mapDeliveryPurokRecord(row, index))
    .filter((item) => item.purokName)
    .filter((item) => (activeOnly ? isDeliveryPurokEnabled(item) : true))
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.purokName.localeCompare(right.purokName);
    });

  return normalized;
}

export function normalizeDeliveryPolygon(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => mapDeliveryPolygonRecord(row, index))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .sort((left, right) => left.pointOrder - right.pointOrder);
}

export function selectPreferredDeliveryArea(rows) {
  const normalized = (Array.isArray(rows) ? rows : []).map((row) => mapDeliveryAreaRecord(row));
  if (!normalized.length) return null;
  return normalized.find(isDeliveryAreaEnabled) || normalized[0] || null;
}

export function cloneFallbackDeliveryCoverage() {
  return {
    area: { ...DEFAULT_DELIVERY_AREA },
    puroks: DEFAULT_DELIVERY_PUROKS.map((item) => ({ ...item })),
    polygon: DEFAULT_DELIVERY_POLYGON.map((item) => ({ ...item })),
  };
}

export function toCustomerDeliveryConfig(area, puroks, polygon) {
  if (!area?.id) return null;
  const normalizedArea = mapDeliveryAreaRecord(area);
  return {
    id: normalizedArea.id,
    source: "database",
    name: normalizedArea.name,
    fixedBarangayName: normalizedArea.fixedBarangayName,
    city: normalizedArea.city,
    province: normalizedArea.province,
    country: normalizedArea.country,
    isActive: normalizedArea.isActive,
    deliveryStatus: normalizedArea.deliveryStatus,
    puroks: normalizeDeliveryPuroks(puroks, { activeOnly: true }),
    polygon: normalizeDeliveryPolygon(polygon),
  };
}

export function toStaffDeliveryCoverage(area, puroks, polygon) {
  if (!area?.id) return cloneFallbackDeliveryCoverage();
  return {
    area: mapDeliveryAreaRecord(area),
    puroks: normalizeDeliveryPuroks(puroks),
    polygon: normalizeDeliveryPolygon(polygon),
  };
}
