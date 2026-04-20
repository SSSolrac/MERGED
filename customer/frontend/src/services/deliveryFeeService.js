const PICKUP_POINT_PLUS_CODE = "7Q53WJQ2+QXV";

// Decoded from the cafe listing plus code for Happy Tails Pet Cafe in Lucena.
export const DELIVERY_PICKUP_POINT = {
  label: "AMCJ Commercial Building, Bonifacio Drive, Lucena, Philippines",
  plusCode: PICKUP_POINT_PLUS_CODE,
  lat: 13.93949,
  lng: 121.60240234375,
};

export const DELIVERY_BASE_FEE = 49;
export const DELIVERY_BASE_DISTANCE_KM = 2;
export const DELIVERY_ADDITIONAL_FEE_PER_KM = 12;
export const DELIVERY_DISTANCE_DISPLAY_STEP_KM = 0.1;

function asNumber(value, fallback = Number.NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ceilToStep(value, step) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  return Math.ceil(value / safeStep) * safeStep;
}

export function normalizeLatLngPoint(value) {
  const safe = value && typeof value === "object" ? value : {};
  const lat = asNumber(safe.lat ?? safe.latitude);
  const lng = asNumber(safe.lng ?? safe.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function computeHaversineDistanceKm(fromPoint, toPoint) {
  const from = normalizeLatLngPoint(fromPoint);
  const to = normalizeLatLngPoint(toPoint);
  if (!from || !to) return Number.NaN;

  const earthRadiusKm = 6371;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusKm * arc;
}

export function calculateDeliveryFeeQuote({
  latitude,
  longitude,
  dropoffLatLng,
  roadDistanceKm,
} = {}) {
  const dropoff =
    normalizeLatLngPoint(dropoffLatLng) ||
    normalizeLatLngPoint({ lat: latitude, lng: longitude });

  if (!dropoff) {
    throw new Error("Select a valid delivery pin to calculate the delivery fee.");
  }

  const routeDistanceKm = asNumber(roadDistanceKm);
  const rawDistanceKm = Number.isFinite(routeDistanceKm) && routeDistanceKm > 0
    ? routeDistanceKm
    : computeHaversineDistanceKm(DELIVERY_PICKUP_POINT, dropoff);

  if (!Number.isFinite(rawDistanceKm) || rawDistanceKm < 0) {
    throw new Error("Unable to calculate the delivery distance for this pin.");
  }

  const distanceKm = ceilToStep(rawDistanceKm, DELIVERY_DISTANCE_DISPLAY_STEP_KM);
  const billedDistanceKm = Math.max(DELIVERY_BASE_DISTANCE_KM, Math.ceil(rawDistanceKm));
  const additionalKm = Math.max(billedDistanceKm - DELIVERY_BASE_DISTANCE_KM, 0);
  const deliveryFee = DELIVERY_BASE_FEE + additionalKm * DELIVERY_ADDITIONAL_FEE_PER_KM;
  const distanceMethod = Number.isFinite(routeDistanceKm) && routeDistanceKm > 0 ? "road" : "haversine";
  const breakdown =
    additionalKm > 0
      ? `PHP ${DELIVERY_BASE_FEE.toFixed(2)} base fare covers the first ${DELIVERY_BASE_DISTANCE_KM} km. ${distanceKm.toFixed(1)} km is billed as ${billedDistanceKm} km, plus PHP ${DELIVERY_ADDITIONAL_FEE_PER_KM.toFixed(2)} x ${additionalKm} km.`
      : `PHP ${DELIVERY_BASE_FEE.toFixed(2)} base fare covers this ${distanceKm.toFixed(1)} km delivery.`;

  return {
    distanceKm,
    billedDistanceKm,
    additionalKm,
    deliveryFee,
    breakdown,
    distanceMethod,
    pickupLatLng: {
      lat: DELIVERY_PICKUP_POINT.lat,
      lng: DELIVERY_PICKUP_POINT.lng,
    },
    dropoffLatLng: dropoff,
  };
}
