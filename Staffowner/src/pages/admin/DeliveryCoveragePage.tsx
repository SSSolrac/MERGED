import { useEffect, useMemo, useState } from 'react';
import L, { type LatLngTuple } from 'leaflet';
import { MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/errors';
import {
  deliveryCoverageService,
  type DeliveryCoverageConfig,
  type DeliveryPolygonPoint,
  type DeliveryPurok,
} from '@/services/deliveryCoverageService';

type DeliveryCoverageFormState = {
  area: DeliveryCoverageConfig['area'];
  puroks: Array<Omit<DeliveryPurok, 'deliveryAreaId' | 'updatedBy' | 'updatedAt'>>;
  polygon: Array<Omit<DeliveryPolygonPoint, 'deliveryAreaId'>>;
};

const DEFAULT_CENTER: LatLngTuple = [13.9416, 121.6224];
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePolygon = (points: DeliveryCoverageFormState['polygon']) =>
  (Array.isArray(points) ? points : [])
    .map((point, index) => ({
      id: String(point?.id || crypto.randomUUID()),
      lat: asNumber(point?.lat, NaN),
      lng: asNumber(point?.lng, NaN),
      pointOrder: index,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

const normalizePuroks = (puroks: DeliveryCoverageFormState['puroks']) =>
  (Array.isArray(puroks) ? puroks : [])
    .map((entry, index) => ({
      id: String(entry?.id || crypto.randomUUID()),
      purokName: String(entry?.purokName || '').trim(),
      isActive: entry?.isActive !== false,
      deliveryStatus: entry?.deliveryStatus === 'inactive' ? 'inactive' : 'active',
      sortOrder: asNumber(entry?.sortOrder, index + 1),
    }))
    .filter((entry) => entry.purokName)
    .sort((left, right) => left.sortOrder - right.sortOrder);

const toFormState = (config: DeliveryCoverageConfig): DeliveryCoverageFormState => ({
  area: {
    ...config.area,
    deliveryStatus: config.area.deliveryStatus === 'inactive' ? 'inactive' : 'active',
    isActive: config.area.isActive !== false,
  },
  puroks: normalizePuroks(
    (Array.isArray(config.puroks) ? config.puroks : []).map((purok) => ({
      id: purok.id,
      purokName: purok.purokName,
      isActive: purok.isActive !== false,
      deliveryStatus: purok.deliveryStatus === 'inactive' ? 'inactive' : 'active',
      sortOrder: purok.sortOrder,
    })),
  ),
  polygon: normalizePolygon(
    (Array.isArray(config.polygon) ? config.polygon : []).map((point) => ({
      id: point.id,
      lat: point.lat,
      lng: point.lng,
      pointOrder: point.pointOrder,
    })),
  ),
});

const getMapCenter = (polygon: DeliveryCoverageFormState['polygon']): LatLngTuple => {
  const first = normalizePolygon(polygon)[0];
  return first ? [first.lat, first.lng] : DEFAULT_CENTER;
};

let hasConfiguredLeafletIcon = false;
const ensureLeafletMarkerIcon = () => {
  if (hasConfiguredLeafletIcon) return;
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });
  hasConfiguredLeafletIcon = true;
};

type PolygonClickCaptureProps = {
  onAddPoint: (lat: number, lng: number) => void;
};

const PolygonClickCapture = ({ onAddPoint }: PolygonClickCaptureProps) => {
  useMapEvents({
    click(event) {
      const lat = asNumber(event?.latlng?.lat, NaN);
      const lng = asNumber(event?.latlng?.lng, NaN);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      onAddPoint(lat, lng);
    },
  });
  return null;
};

type FitPolygonBoundsProps = {
  polygon: LatLngTuple[];
};

const FitPolygonBounds = ({ polygon }: FitPolygonBoundsProps) => {
  const map = useMap();

  useEffect(() => {
    if (!Array.isArray(polygon) || polygon.length < 3) return;
    const bounds = L.latLngBounds(polygon);
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { padding: [28, 28] });
  }, [map, polygon]);

  return null;
};

export const DeliveryCoveragePage = () => {
  ensureLeafletMarkerIcon();

  const [form, setForm] = useState<DeliveryCoverageFormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadCoverage = async () => {
      try {
        setIsLoading(true);
        const config = await deliveryCoverageService.getDeliveryCoverage();
        if (cancelled) return;
        setForm(toFormState(config));
      } catch (error) {
        if (cancelled) return;
        toast.error(getErrorMessage(error, 'Unable to load delivery coverage.'));
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    };

    void loadCoverage();
    return () => {
      cancelled = true;
    };
  }, []);

  const polygonCount = useMemo(() => normalizePolygon(form?.polygon || []).length, [form?.polygon]);
  const activePurokCount = useMemo(
    () => normalizePuroks(form?.puroks || []).filter((purok) => purok.isActive && purok.deliveryStatus === 'active').length,
    [form?.puroks],
  );

  const updateArea = <K extends keyof DeliveryCoverageFormState['area']>(key: K, value: DeliveryCoverageFormState['area'][K]) => {
    setForm((current) => (current ? { ...current, area: { ...current.area, [key]: value } } : current));
  };

  const updatePurok = <K extends keyof DeliveryCoverageFormState['puroks'][number]>(
    index: number,
    key: K,
    value: DeliveryCoverageFormState['puroks'][number][K],
  ) => {
    setForm((current) => {
      if (!current) return current;
      const next = [...current.puroks];
      if (!next[index]) return current;
      next[index] = { ...next[index], [key]: value };
      return { ...current, puroks: normalizePuroks(next) };
    });
  };

  const removePurok = (index: number) => {
    setForm((current) => {
      if (!current) return current;
      const next = current.puroks.filter((_, rowIndex) => rowIndex !== index);
      return { ...current, puroks: normalizePuroks(next) };
    });
  };

  const addPurok = () => {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        puroks: normalizePuroks([
          ...current.puroks,
          {
            id: crypto.randomUUID(),
            purokName: '',
            isActive: true,
            deliveryStatus: 'active',
            sortOrder: current.puroks.length + 1,
          },
        ]),
      };
    });
  };

  const removePolygonPoint = (index: number) => {
    setForm((current) => {
      if (!current) return current;
      const next = normalizePolygon(current.polygon).filter((_, pointIndex) => pointIndex !== index);
      return { ...current, polygon: normalizePolygon(next) };
    });
  };

  const updatePolygonPoint = (index: number, key: 'lat' | 'lng', value: number) => {
    setForm((current) => {
      if (!current) return current;
      const next = [...normalizePolygon(current.polygon)];
      if (!next[index]) return current;
      next[index] = { ...next[index], [key]: value };
      return { ...current, polygon: normalizePolygon(next) };
    });
  };

  const setPolygonPoint = (index: number, lat: number, lng: number) => {
    setForm((current) => {
      if (!current) return current;
      const next = [...normalizePolygon(current.polygon)];
      if (!next[index]) return current;
      next[index] = { ...next[index], lat, lng };
      return { ...current, polygon: normalizePolygon(next) };
    });
  };

  const addPolygonPoint = (lat: number, lng: number) => {
    setForm((current) => {
      if (!current) return current;
      const nextPolygon = normalizePolygon([
        ...current.polygon,
        { id: crypto.randomUUID(), lat, lng, pointOrder: current.polygon.length },
      ]);
      return { ...current, polygon: nextPolygon };
    });
  };

  const clearPolygon = () => {
    setForm((current) => (current ? { ...current, polygon: [] } : current));
  };

  const save = async () => {
    if (!form) return;
    if (normalizePolygon(form.polygon).length < 3) {
      toast.error('Delivery polygon must have at least 3 points.');
      return;
    }

    try {
      setIsSaving(true);
      const saved = await deliveryCoverageService.saveDeliveryCoverage({
        area: {
          ...form.area,
          deliveryStatus: form.area.deliveryStatus === 'inactive' ? 'inactive' : 'active',
          isActive: form.area.isActive !== false,
        },
        puroks: normalizePuroks(form.puroks),
        polygon: normalizePolygon(form.polygon),
      });
      setForm(toFormState(saved));
      toast.success('Delivery coverage saved.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to save delivery coverage.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !form) {
    return (
      <section className="rounded-lg border bg-white p-4 space-y-2">
        <h2 className="text-xl font-semibold">Delivery Coverage</h2>
        <p className="text-sm text-[#6B7280]">Loading delivery settings...</p>
      </section>
    );
  }

  const normalizedPolygon = normalizePolygon(form.polygon);
  const polygonPositions: LatLngTuple[] = normalizedPolygon.map((point) => [point.lat, point.lng]);

  return (
    <section className="rounded-lg border bg-white p-4 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Delivery Coverage</h2>
        <p className="text-sm text-[#6B7280]">
          Manage the service area polygon, fixed barangay label, and allowed puroks for customer delivery checkout.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-sm">
          Area Name
          <input
            className="block border rounded mt-1 px-2 py-1 w-full"
            value={form.area.name}
            onChange={(event) => updateArea('name', event.target.value)}
          />
        </label>
        <label className="text-sm">
          Fixed Barangay / Area Label
          <input
            className="block border rounded mt-1 px-2 py-1 w-full"
            value={form.area.fixedBarangayName}
            onChange={(event) => updateArea('fixedBarangayName', event.target.value)}
          />
        </label>
        <label className="text-sm">
          City
          <input
            className="block border rounded mt-1 px-2 py-1 w-full"
            value={form.area.city}
            onChange={(event) => updateArea('city', event.target.value)}
          />
        </label>
        <label className="text-sm">
          Province
          <input
            className="block border rounded mt-1 px-2 py-1 w-full"
            value={form.area.province}
            onChange={(event) => updateArea('province', event.target.value)}
          />
        </label>
        <label className="text-sm">
          Country
          <input
            className="block border rounded mt-1 px-2 py-1 w-full"
            value={form.area.country}
            onChange={(event) => updateArea('country', event.target.value)}
          />
        </label>
        <label className="text-sm">
          Area Status
          <select
            className="block border rounded mt-1 px-2 py-1 w-full"
            value={form.area.deliveryStatus}
            onChange={(event) => updateArea('deliveryStatus', event.target.value === 'inactive' ? 'inactive' : 'active')}
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.area.isActive}
          onChange={(event) => updateArea('isActive', event.target.checked)}
        />
        Area enabled for customer delivery
      </label>

      <article className="rounded border p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Service Polygon</h3>
          <div className="flex gap-2">
            <button type="button" className="rounded border px-3 py-1 text-sm" onClick={clearPolygon}>
              Clear polygon
            </button>
          </div>
        </div>
        <p className="text-xs text-[#6B7280]">
          Click on the map to add polygon points. Drag numbered points to adjust. Right-click a point to remove it.
        </p>
        <div className="relative min-h-[320px] rounded border overflow-hidden bg-[#F8FAFC]">
          <MapContainer className="h-[320px] w-full" center={getMapCenter(form.polygon)} zoom={16} scrollWheelZoom>
            <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
            {polygonPositions.length >= 3 ? (
              <Polygon
                positions={polygonPositions}
                pathOptions={{
                  color: '#111827',
                  opacity: 0.9,
                  weight: 2,
                  fillColor: '#fb7185',
                  fillOpacity: 0.18,
                }}
              />
            ) : null}
            {polygonPositions.map((position, index) => (
              <Marker
                key={normalizedPolygon[index]?.id || `vertex-${index + 1}`}
                position={position}
                draggable
                eventHandlers={{
                  dragend(event) {
                    const next = event.target.getLatLng();
                    setPolygonPoint(index, asNumber(next?.lat, position[0]), asNumber(next?.lng, position[1]));
                  },
                  contextmenu() {
                    removePolygonPoint(index);
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -18]} permanent>
                  #{index + 1}
                </Tooltip>
              </Marker>
            ))}
            <PolygonClickCapture onAddPoint={addPolygonPoint} />
            <FitPolygonBounds polygon={polygonPositions} />
          </MapContainer>
        </div>
        <p className="text-xs text-[#6B7280]">Current polygon points: {polygonCount}</p>
        <div className="space-y-2">
          {normalizedPolygon.map((point, index) => (
            <div key={point.id || `point-${index + 1}`} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
              <span className="text-xs text-[#6B7280]">#{index + 1}</span>
              <input
                type="number"
                step="0.000001"
                className="border rounded px-2 py-1 text-sm"
                value={point.lat}
                onChange={(event) => updatePolygonPoint(index, 'lat', Number(event.target.value))}
              />
              <input
                type="number"
                step="0.000001"
                className="border rounded px-2 py-1 text-sm"
                value={point.lng}
                onChange={(event) => updatePolygonPoint(index, 'lng', Number(event.target.value))}
              />
              <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => removePolygonPoint(index)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded border p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">Allowed Puroks</h3>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addPurok}>
            Add purok
          </button>
        </div>
        <p className="text-xs text-[#6B7280]">Active delivery puroks: {activePurokCount}</p>
        <div className="space-y-2">
          {form.puroks.map((purok, index) => (
            <article key={purok.id || `purok-${index + 1}`} className="rounded border p-2 space-y-2">
              <div className="grid md:grid-cols-[1.4fr_120px_120px_auto] gap-2 items-end">
                <label className="text-sm">
                  Purok Name
                  <input
                    className="block border rounded mt-1 px-2 py-1 w-full"
                    value={purok.purokName}
                    onChange={(event) => updatePurok(index, 'purokName', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Sort Order
                  <input
                    type="number"
                    min={0}
                    className="block border rounded mt-1 px-2 py-1 w-full"
                    value={purok.sortOrder}
                    onChange={(event) => updatePurok(index, 'sortOrder', Number(event.target.value))}
                  />
                </label>
                <label className="text-sm">
                  Status
                  <select
                    className="block border rounded mt-1 px-2 py-1 w-full"
                    value={purok.deliveryStatus}
                    onChange={(event) => updatePurok(index, 'deliveryStatus', event.target.value === 'inactive' ? 'inactive' : 'active')}
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </label>
                <button type="button" className="rounded border px-2 py-1 text-xs h-9" onClick={() => removePurok(index)}>
                  Remove
                </button>
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={purok.isActive}
                  onChange={(event) => updatePurok(index, 'isActive', event.target.checked)}
                />
                Enabled for delivery dropdown
              </label>
            </article>
          ))}
        </div>
      </article>

      <button
        type="button"
        className="rounded bg-[#FFB6C1] text-[#1F2937] px-4 py-2 font-medium disabled:opacity-60"
        onClick={save}
        disabled={isSaving}
      >
        {isSaving ? 'Saving delivery coverage...' : 'Save delivery coverage'}
      </button>
    </section>
  );
};

export default DeliveryCoveragePage;
