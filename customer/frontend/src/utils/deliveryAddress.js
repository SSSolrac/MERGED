export const DEFAULT_DELIVERY_CITY = "Lucena City";
export const DEFAULT_DELIVERY_PROVINCE = "Quezon";
export const DEFAULT_DELIVERY_COUNTRY = "Philippines";

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizePolygonPoint(point) {
  const safe = point && typeof point === "object" ? point : {};
  const lat = asNumber(safe.lat ?? safe.latitude);
  const lng = asNumber(safe.lng ?? safe.longitude);
  return {
    lat,
    lng,
    pointOrder: Number.isFinite(Number(safe.pointOrder ?? safe.point_order)) ? Number(safe.pointOrder ?? safe.point_order) : 0,
  };
}

function normalizePolygon(polygon) {
  return (Array.isArray(polygon) ? polygon : [])
    .map(normalizePolygonPoint)
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .sort((left, right) => left.pointOrder - right.pointOrder);
}

function fallbackPointInPolygon(lat, lng, polygon) {
  const points = normalizePolygon(polygon);
  if (points.length < 3 || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const yi = points[i].lat;
    const xi = points[i].lng;
    const yj = points[j].lat;
    const xj = points[j].lng;

    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPointInsidePolygon(lat, lng, polygon) {
  const safeLat = asNumber(lat);
  const safeLng = asNumber(lng);
  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) return false;

  const safePolygon = normalizePolygon(polygon);
  if (safePolygon.length < 3) return false;

  return fallbackPointInPolygon(safeLat, safeLng, safePolygon);
}

export function buildDeliveryAddress({
  houseDetails,
  purokName,
  fixedBarangayName,
  city = DEFAULT_DELIVERY_CITY,
  province = DEFAULT_DELIVERY_PROVINCE,
  country = DEFAULT_DELIVERY_COUNTRY,
}) {
  const safeHouse = asText(houseDetails);
  const safePurok = asText(purokName);
  const safeBarangay = asText(fixedBarangayName);
  const safeCity = asText(city) || DEFAULT_DELIVERY_CITY;
  const safeProvince = asText(province) || DEFAULT_DELIVERY_PROVINCE;
  const safeCountry = asText(country) || DEFAULT_DELIVERY_COUNTRY;

  if (!safeHouse || !safePurok || !safeBarangay) return "";
  return `${safeHouse}, ${safePurok}, ${safeBarangay}, ${safeCity}, ${safeProvince}, ${safeCountry}`;
}

export function validateDeliveryAddress({
  houseDetails,
  selectedPurokId,
  latitude,
  longitude,
  config,
}) {
  const errors = {};
  const safeConfig = config && typeof config === "object" ? config : {};
  const puroks = Array.isArray(safeConfig.puroks) ? safeConfig.puroks : [];
  const polygon = Array.isArray(safeConfig.polygon) ? safeConfig.polygon : [];

  const safeHouseDetails = asText(houseDetails);
  const safePurokId = asText(selectedPurokId);
  const safeLat = asNumber(latitude);
  const safeLng = asNumber(longitude);

  const selectedPurok = puroks.find((item) => asText(item.id) === safePurokId && item.isActive !== false);

  if (!safeConfig || safeConfig.isActive === false || String(safeConfig.deliveryStatus || "").toLowerCase() === "inactive") {
    errors.address = "Delivery is currently unavailable for this area.";
  }

  if (!safeHouseDetails) {
    errors.houseDetails = "House/Unit/Street/Landmark is required for delivery.";
  }

  if (!selectedPurok) {
    errors.purok = "Please select an active purok.";
  }

  if (polygon.length < 3) {
    errors.mapPin = "Delivery polygon is not configured.";
  } else if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) {
    errors.mapPin = "Please place the delivery pin on the map.";
  } else if (!isPointInsidePolygon(safeLat, safeLng, polygon)) {
    errors.mapPin = "Selected pin is outside the delivery area.";
  }

  const normalizedAddress = buildDeliveryAddress({
    houseDetails: safeHouseDetails,
    purokName: selectedPurok?.purokName || "",
    fixedBarangayName: safeConfig.fixedBarangayName,
    city: safeConfig.city,
    province: safeConfig.province,
    country: safeConfig.country,
  });

  if (!normalizedAddress) {
    errors.address = "Complete your delivery address details.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalizedAddress,
    selectedPurok: selectedPurok || null,
    latitude: safeLat,
    longitude: safeLng,
  };
}

export function parseDeliveryAddress(address, config) {
  const rawAddress = asText(address);
  if (!rawAddress) {
    return { houseDetails: "", selectedPurokId: "" };
  }

  const puroks = Array.isArray(config?.puroks) ? config.puroks : [];
  const lowerAddress = rawAddress.toLowerCase();

  const matchedPurok = puroks.find((item) => {
    const name = asText(item?.purokName).toLowerCase();
    return Boolean(name && lowerAddress.includes(name));
  });

  let houseDetails = asText(rawAddress.split(",")[0]);
  if (!houseDetails) houseDetails = rawAddress;

  return {
    houseDetails,
    selectedPurokId: matchedPurok ? asText(matchedPurok.id) : "",
  };
}
