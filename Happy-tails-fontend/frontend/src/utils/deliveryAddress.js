export const DEFAULT_DELIVERY_CITY = "Lucena City";
export const DEFAULT_DELIVERY_PROVINCE = "Quezon";
export const DEFAULT_DELIVERY_COUNTRY = "Philippines";

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === "") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function firstText(record, keys) {
  const safe = asObject(record);
  if (!safe) return "";
  for (const key of keys) {
    const text = asText(safe[key]);
    if (text) return text;
  }
  return "";
}

function uniqueParts(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    const text = asText(part);
    if (!text) return false;
    const key = text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getPurokCoordinates(purok) {
  const lat = asNumber(purok?.lat ?? purok?.latitude);
  const lng = asNumber(purok?.lng ?? purok?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function computeDeliveryDistanceKm(fromPoint, toPoint) {
  const fromLat = asNumber(fromPoint?.lat ?? fromPoint?.latitude);
  const fromLng = asNumber(fromPoint?.lng ?? fromPoint?.longitude);
  const toLat = asNumber(toPoint?.lat ?? toPoint?.latitude);
  const toLng = asNumber(toPoint?.lng ?? toPoint?.longitude);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) return NaN;

  const earthRadiusKm = 6371;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const clamped = Math.min(1, Math.max(0, haversine));
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
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

export function formatDeliveryAddress(address, fallback = "No delivery address provided") {
  if (typeof address === "string") {
    return asText(address) || fallback;
  }

  const record = asObject(address);
  if (!record) return fallback;

  const preformatted = firstText(record, [
    "normalizedAddress",
    "normalized_address",
    "formattedAddress",
    "formatted_address",
    "fullAddress",
    "full_address",
    "address",
  ]);
  if (preformatted) return preformatted;

  const blockLotHouseUnit = uniqueParts([
    firstText(record, ["blockLot", "block_lot", "block", "lot", "lotBlock", "lot_block"]),
    firstText(record, ["houseDetails", "house_details", "house", "houseNo", "house_no", "unit", "unitNo", "unit_no"]),
  ]).join(" ");

  const streetPurok = uniqueParts([
    firstText(record, ["street", "streetName", "street_name"]),
    firstText(record, ["selectedPurokName", "selected_purok_name", "purokName", "purok_name", "purok"]),
  ]).join(", ");

  const cleanParts = uniqueParts([
    blockLotHouseUnit,
    streetPurok,
    firstText(record, ["fixedBarangayName", "fixed_barangay_name", "barangay", "barangayName", "barangay_name"]),
    firstText(record, ["city", "municipality"]),
    firstText(record, ["province", "state"]),
    firstText(record, ["country"]),
  ]);

  return cleanParts.length ? cleanParts.join(", ") : fallback;
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

  const safeHouseDetails = asText(houseDetails);
  const safePurokId = asText(selectedPurokId);
  const selectedPurok = puroks.find((item) => asText(item.id) === safePurokId && item.isActive !== false);
  const purokCoordinates = getPurokCoordinates(selectedPurok);
  const latFromPayload = asNumber(latitude);
  const lngFromPayload = asNumber(longitude);
  const safeLat = Number.isFinite(latFromPayload) ? latFromPayload : purokCoordinates?.lat ?? NaN;
  const safeLng = Number.isFinite(lngFromPayload) ? lngFromPayload : purokCoordinates?.lng ?? NaN;
  const centerLat = asNumber(safeConfig.centerLat ?? safeConfig.center_lat);
  const centerLng = asNumber(safeConfig.centerLng ?? safeConfig.center_lng);
  const maxDistanceKm = asNumber(safeConfig.maxDistanceKm ?? safeConfig.max_distance_km);
  const distanceKm = computeDeliveryDistanceKm({ lat: centerLat, lng: centerLng }, { lat: safeLat, lng: safeLng });

  if (!safeConfig || safeConfig.isActive === false || String(safeConfig.deliveryStatus || "").toLowerCase() === "inactive") {
    errors.address = "Delivery is currently unavailable for this area.";
  }

  if (!safeHouseDetails) {
    errors.houseDetails = "House/Unit/Street/Landmark is required for delivery.";
  }

  if (!selectedPurok) {
    errors.purok = "Please select an active purok.";
  }

  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || !Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0) {
    errors.mapPin = "Delivery distance coverage is not configured.";
  } else if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) {
    errors.mapPin = "Search for your address or place a delivery pin on the map.";
  } else if (!Number.isFinite(distanceKm) || distanceKm > maxDistanceKm) {
    const distanceText = Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : "outside";
    errors.mapPin = `Selected pin is ${distanceText} from the cafe, outside the ${maxDistanceKm.toFixed(1)} km delivery coverage.`;
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
    distanceKm,
    maxDistanceKm,
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
