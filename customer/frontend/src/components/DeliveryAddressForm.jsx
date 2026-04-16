import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from "react-leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import "./DeliveryAddressForm.css";

const DEFAULT_DELIVERY_MAP_CENTER = { lat: 13.9416, lng: 121.6224 };
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getFirstPolygonPoint(polygon) {
  const points = Array.isArray(polygon) ? polygon : [];
  for (const point of points) {
    const lat = asNumber(point?.lat);
    const lng = asNumber(point?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function normalizePolygon(points) {
  return (Array.isArray(points) ? points : [])
    .map((point) => ({
      lat: asNumber(point?.lat),
      lng: asNumber(point?.lng),
      pointOrder: Number.isFinite(Number(point?.pointOrder)) ? Number(point.pointOrder) : 0,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .sort((left, right) => left.pointOrder - right.pointOrder);
}

let hasConfiguredLeafletIcon = false;
function ensureLeafletMarkerIcon() {
  if (hasConfiguredLeafletIcon) return;
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });
  hasConfiguredLeafletIcon = true;
}

function MapClickCapture({ onSelectPoint }) {
  useMapEvents({
    click(event) {
      const lat = asNumber(event?.latlng?.lat);
      const lng = asNumber(event?.latlng?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      onSelectPoint(lat, lng);
    },
  });
  return null;
}

function SyncMapView({ center, markerPosition, polygon, hasPinnedPoint, watchKey }) {
  const map = useMap();

  useEffect(() => {
    const hasWindow = typeof window !== "undefined";
    const hasDocument = typeof document !== "undefined";

    const syncView = () => {
      map.invalidateSize({ pan: false });

      if (Array.isArray(polygon) && polygon.length >= 3 && !hasPinnedPoint) {
        const bounds = L.latLngBounds(polygon);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [28, 28] });
          return;
        }
      }

      const fallbackTarget = Array.isArray(center) ? center : [DEFAULT_DELIVERY_MAP_CENTER.lat, DEFAULT_DELIVERY_MAP_CENTER.lng];
      const target = hasPinnedPoint ? markerPosition : fallbackTarget;
      const lat = asNumber(target?.[0]);
      const lng = asNumber(target?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      map.setView([lat, lng], Math.max(map.getZoom() || 0, 16), { animate: false });
    };

    let firstFrame = 0;
    let secondFrame = 0;
    let timeoutId = 0;

    const queueSync = () => {
      if (!hasWindow) {
        syncView();
        return;
      }

      firstFrame = window.requestAnimationFrame(() => {
        syncView();
        secondFrame = window.requestAnimationFrame(syncView);
      });
      timeoutId = window.setTimeout(syncView, 180);
    };

    queueSync();

    const container = typeof map.getContainer === "function" ? map.getContainer() : null;
    let resizeObserver = null;
    if (hasWindow && typeof window.ResizeObserver === "function" && container) {
      resizeObserver = new window.ResizeObserver(() => {
        queueSync();
      });
      resizeObserver.observe(container);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") queueSync();
    };
    if (hasDocument) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      if (hasWindow) {
        window.clearTimeout(timeoutId);
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
      }
      if (hasDocument) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      resizeObserver?.disconnect?.();
    };
  }, [center, hasPinnedPoint, map, markerPosition, polygon, watchKey]);

  return null;
}

export default function DeliveryAddressForm({
  config,
  value,
  onChange,
  validationErrors,
}) {
  ensureLeafletMarkerIcon();

  const polygon = useMemo(() => normalizePolygon(config?.polygon), [config?.polygon]);
  const center = useMemo(() => getFirstPolygonPoint(polygon) || DEFAULT_DELIVERY_MAP_CENTER, [polygon]);
  const centerPosition = useMemo(() => [center.lat, center.lng], [center.lat, center.lng]);

  const selectedPurokId = asText(value?.selectedPurokId);
  const houseDetails = asText(value?.houseDetails);
  const latitude = asNumber(value?.latitude);
  const longitude = asNumber(value?.longitude);
  const puroks = Array.isArray(config?.puroks) ? config.puroks : [];
  const markerPosition = useMemo(
    () => (Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : [center.lat, center.lng]),
    [center.lat, center.lng, latitude, longitude]
  );
  const polygonPositions = useMemo(
    () => polygon.map((point) => [point.lat, point.lng]),
    [polygon]
  );
  const hasPinnedPoint = Number.isFinite(latitude) && Number.isFinite(longitude);
  const polygonSignature = useMemo(
    () => polygon.map((point) => `${point.pointOrder}:${point.lat}:${point.lng}`).join("|"),
    [polygon]
  );
  const markerSignature = Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude}:${longitude}` : "fallback-marker";
  const mapWatchKey = `${asText(config?.id) || "fallback-area"}:${selectedPurokId}:${markerSignature}:${polygonSignature}`;

  useEffect(() => {
    if (typeof console === "undefined" || typeof console.debug !== "function") return;
    console.debug("[DeliveryAddressForm] customer map inputs", {
      deliveryConfig: config,
      center: centerPosition,
      markerPosition,
      polygonPoints: polygon,
      polygonPositions,
    });
  }, [centerPosition, config, markerPosition, polygon, polygonPositions]);

  return (
    <div className="delivery-address-form">
      <label>
        House/Unit/Street/Landmark <span className="required-indicator">*</span>
      </label>
      <input
        value={houseDetails}
        onChange={(event) => onChange({ ...value, houseDetails: event.target.value })}
        placeholder="Example: Blk 4 Lot 8, Main Street"
        autoComplete="address-line1"
      />
      {validationErrors?.houseDetails ? <p className="field-error">{validationErrors.houseDetails}</p> : null}

      <label>
        Purok <span className="required-indicator">*</span>
      </label>
      <select
        value={selectedPurokId}
        onChange={(event) => onChange({ ...value, selectedPurokId: event.target.value })}
      >
        <option value="">Select a purok</option>
        {puroks.map((purok) => (
          <option key={purok.id} value={purok.id}>
            {purok.purokName}
          </option>
        ))}
      </select>
      {validationErrors?.purok ? <p className="field-error">{validationErrors.purok}</p> : null}

      <p className="field-hint">
        Drag the pin (or tap the map) to choose your delivery location. Delivery approval is based on selected purok + service polygon.
      </p>

      <div className="delivery-map-shell" aria-label="Delivery map">
        <MapContainer
          className="delivery-map"
          center={centerPosition}
          zoom={16}
          scrollWheelZoom
          whenReady={(event) => {
            event.target.invalidateSize({ pan: false });
          }}
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          {polygonPositions.length >= 3 ? (
            <Polygon
              positions={polygonPositions}
              pathOptions={{
                color: "#111827",
                weight: 2,
                opacity: 0.9,
                fillColor: "#fda4af",
                fillOpacity: 0.2,
              }}
            />
          ) : null}
          <Marker
            position={markerPosition}
            draggable
            eventHandlers={{
              dragend(event) {
                const point = event?.target?.getLatLng?.();
                const nextLat = asNumber(point?.lat);
                const nextLng = asNumber(point?.lng);
                if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;
                onChange({
                  ...value,
                  latitude: nextLat,
                  longitude: nextLng,
                });
              },
            }}
          />
          <MapClickCapture
            onSelectPoint={(nextLat, nextLng) =>
              onChange({
                ...value,
                latitude: nextLat,
                longitude: nextLng,
              })
            }
          />
          <SyncMapView
            center={centerPosition}
            markerPosition={markerPosition}
            polygon={polygonPositions}
            hasPinnedPoint={hasPinnedPoint}
            watchKey={mapWatchKey}
          />
        </MapContainer>
      </div>
      {validationErrors?.mapPin ? <p className="field-error">{validationErrors.mapPin}</p> : null}

      <div className="delivery-fixed-grid">
        <label>
          Barangay / Area
          <input readOnly value={asText(config?.fixedBarangayName)} />
        </label>
        <label>
          City
          <input readOnly value={asText(config?.city)} />
        </label>
        <label>
          Province
          <input readOnly value={asText(config?.province)} />
        </label>
        <label>
          Country
          <input readOnly value={asText(config?.country)} />
        </label>
      </div>
    </div>
  );
}
