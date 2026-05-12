import { useMemo, useRef, useState, useEffect } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import "./DeliveryAddressForm.css";

const DEFAULT_DELIVERY_MAP_CENTER = { lat: 13.93949, lng: 121.60240234375 };
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getCoverageCenter(config) {
  const lat = asNumber(config?.centerLat ?? config?.center_lat);
  const lng = asNumber(config?.centerLng ?? config?.center_lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return DEFAULT_DELIVERY_MAP_CENTER;
}

function getPurokCoordinates(purok) {
  const lat = asNumber(purok?.lat ?? purok?.latitude);
  const lng = asNumber(purok?.lng ?? purok?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

function getShortAddressLabel(result) {
  const address = result?.address && typeof result.address === "object" ? result.address : {};
  const parts = [
    address.house_number && address.road ? `${address.house_number} ${address.road}` : address.road,
    address.neighbourhood || address.suburb || address.village || address.quarter,
    address.city || address.town || address.municipality,
  ]
    .map(asText)
    .filter(Boolean);
  return parts[0] || asText(result?.name) || asText(result?.display_name).split(",")[0] || "";
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

function SyncMapView({ markerPosition, selectedPurokPosition, selectedPurokSignature, watchKey }) {
  const map = useMap();
  const lastSelectedPurokSignatureRef = useRef("");

  useEffect(() => {
    const hasWindow = typeof window !== "undefined";
    const hasDocument = typeof document !== "undefined";

    const syncView = () => {
      map.invalidateSize({ pan: false });

      const hasSelectedPurokPosition =
        Array.isArray(selectedPurokPosition) &&
        Number.isFinite(asNumber(selectedPurokPosition?.[0])) &&
        Number.isFinite(asNumber(selectedPurokPosition?.[1]));
      const purokChanged =
        Boolean(selectedPurokSignature) && lastSelectedPurokSignatureRef.current !== selectedPurokSignature;

      lastSelectedPurokSignatureRef.current = selectedPurokSignature || "";

      const target = hasSelectedPurokPosition && purokChanged ? selectedPurokPosition : markerPosition;
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
  }, [map, markerPosition, selectedPurokPosition, selectedPurokSignature, watchKey]);

  return null;
}

export default function DeliveryAddressForm({
  config,
  value,
  onChange,
  validationErrors,
}) {
  ensureLeafletMarkerIcon();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const coverageCenter = useMemo(() => getCoverageCenter(config), [config]);
  const centerPosition = useMemo(() => [coverageCenter.lat, coverageCenter.lng], [coverageCenter.lat, coverageCenter.lng]);
  const maxDistanceKm = Math.max(0.1, asNumber(config?.maxDistanceKm ?? config?.max_distance_km) || 4);

  const selectedPurokId = asText(value?.selectedPurokId);
  const houseDetails = asText(value?.houseDetails);
  const latitude = asNumber(value?.latitude);
  const longitude = asNumber(value?.longitude);
  const configPuroks = config?.puroks;
  const puroks = useMemo(() => (Array.isArray(configPuroks) ? configPuroks : []), [configPuroks]);
  const selectedPurok = useMemo(
    () => puroks.find((purok) => asText(purok?.id) === selectedPurokId) || null,
    [puroks, selectedPurokId]
  );
  const selectedPurokPosition = useMemo(() => getPurokCoordinates(selectedPurok), [selectedPurok]);
  const markerPosition = useMemo(
    () =>
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [latitude, longitude]
        : selectedPurokPosition || centerPosition,
    [centerPosition, latitude, longitude, selectedPurokPosition]
  );
  const selectedPurokSignature = Array.isArray(selectedPurokPosition)
    ? `${selectedPurokId}:${selectedPurokPosition[0]}:${selectedPurokPosition[1]}`
    : `${selectedPurokId}:missing`;
  const markerSignature = Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude}:${longitude}` : "fallback-marker";
  const mapWatchKey = `${asText(config?.id) || "fallback-area"}:${selectedPurokSignature}:${markerSignature}:${centerPosition[0]}:${centerPosition[1]}:${maxDistanceKm}`;

  const runAddressSearch = async () => {
    const query = asText(searchQuery);
    if (query.length < 3) {
      setSearchError("Enter at least 3 characters to search.");
      setSearchResults([]);
      return;
    }

    const params = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "ph",
      limit: "5",
      q: `${query}, ${asText(config?.city) || "Lucena City"}, ${asText(config?.province) || "Quezon"}, Philippines`,
    });

    try {
      setIsSearching(true);
      setSearchError("");
      const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Address search is unavailable right now.");
      const data = await response.json();
      const results = (Array.isArray(data) ? data : [])
        .map((entry) => ({
          id: asText(entry.place_id || entry.osm_id || entry.display_name),
          label: asText(entry.display_name),
          shortLabel: getShortAddressLabel(entry),
          lat: asNumber(entry.lat),
          lng: asNumber(entry.lon),
        }))
        .filter((entry) => entry.label && Number.isFinite(entry.lat) && Number.isFinite(entry.lng));
      setSearchResults(results);
      if (!results.length) setSearchError("No matching addresses found. Try a nearby landmark or place the pin manually.");
    } catch (error) {
      setSearchResults([]);
      setSearchError(error?.message || "Address search is unavailable right now.");
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (result) => {
    const nextHouse = houseDetails || result.shortLabel || asText(result.label).split(",")[0] || "";
    onChange({
      ...value,
      houseDetails: nextHouse,
      latitude: result.lat,
      longitude: result.lng,
    });
    setSearchResults([]);
    setSearchQuery(result.shortLabel || result.label);
  };

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
        onChange={(event) => {
          const nextSelectedPurokId = event.target.value;
          const nextSelectedPurok = puroks.find((purok) => asText(purok?.id) === nextSelectedPurokId) || null;
          const nextCoordinates = getPurokCoordinates(nextSelectedPurok);
          onChange({
            ...value,
            selectedPurokId: nextSelectedPurokId,
            latitude: nextCoordinates ? nextCoordinates[0] : value?.latitude ?? null,
            longitude: nextCoordinates ? nextCoordinates[1] : value?.longitude ?? null,
          });
        }}
      >
        <option value="">Select a purok</option>
        {puroks.map((purok) => (
          <option key={purok.id} value={purok.id}>
            {purok.purokName}
          </option>
        ))}
      </select>
      {validationErrors?.purok ? <p className="field-error">{validationErrors.purok}</p> : null}

      <label>Find address or landmark</label>
      <div className="delivery-address-search">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search Lucena address or landmark"
          autoComplete="street-address"
        />
        <button type="button" onClick={runAddressSearch} disabled={isSearching}>
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>
      {searchError ? <p className="field-error">{searchError}</p> : null}
      {searchResults.length ? (
        <div className="delivery-search-results">
          {searchResults.map((result) => (
            <button key={result.id} type="button" onClick={() => selectSearchResult(result)}>
              {result.label}
            </button>
          ))}
        </div>
      ) : null}

      <p className="field-hint">
        Search an address, drag the pin, or tap the map. Delivery approval uses your selected purok and the cafe distance limit.
      </p>

      <div className="delivery-map-shell" aria-label="Delivery map">
        <MapContainer
          className="delivery-map"
          center={markerPosition}
          zoom={16}
          scrollWheelZoom
          whenReady={(event) => {
            event.target.invalidateSize({ pan: false });
          }}
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          <Circle
            center={centerPosition}
            radius={maxDistanceKm * 1000}
            pathOptions={{
              color: "#111827",
              weight: 2,
              opacity: 0.85,
              fillColor: "#fda4af",
              fillOpacity: 0.12,
            }}
          />
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
            markerPosition={markerPosition}
            selectedPurokPosition={selectedPurokPosition}
            selectedPurokSignature={selectedPurokSignature}
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
          Coverage
          <input readOnly value={`${maxDistanceKm.toFixed(1)} km from cafe`} />
        </label>
      </div>
    </div>
  );
}
