import { useEffect, useMemo, useState } from 'react';
import L, { type LatLngTuple } from 'leaflet';
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui';
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
type MapEditMode = 'pan' | 'center' | 'purok';

const DEFAULT_CENTER: LatLngTuple = [13.93949, 121.60240234375];
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePuroks = (puroks: DeliveryCoverageFormState['puroks']) =>
  (Array.isArray(puroks) ? puroks : [])
    .map((entry, index) => ({
      id: String(entry?.id || crypto.randomUUID()),
      purokName: String(entry?.purokName || '').trim(),
      lat: asNumber(entry?.lat, Number.NaN),
      lng: asNumber(entry?.lng, Number.NaN),
      isActive: entry?.isActive !== false,
      deliveryStatus: entry?.deliveryStatus === 'inactive' ? 'inactive' : 'active',
      sortOrder: asNumber(entry?.sortOrder, index + 1),
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);

const toFormState = (config: DeliveryCoverageConfig): DeliveryCoverageFormState => ({
  area: {
    ...config.area,
    coverageMode: 'radius',
    centerLat: asNumber(config.area.centerLat, DEFAULT_CENTER[0]),
    centerLng: asNumber(config.area.centerLng, DEFAULT_CENTER[1]),
    maxDistanceKm: Math.max(0, asNumber(config.area.maxDistanceKm, 4)),
    deliveryStatus: config.area.deliveryStatus === 'inactive' ? 'inactive' : 'active',
    isActive: config.area.isActive !== false,
  },
  puroks: normalizePuroks(
    (Array.isArray(config.puroks) ? config.puroks : []).map((purok) => ({
      id: purok.id,
      purokName: purok.purokName,
      lat: purok.lat,
      lng: purok.lng,
      isActive: purok.isActive !== false,
      deliveryStatus: purok.deliveryStatus === 'inactive' ? 'inactive' : 'active',
      sortOrder: purok.sortOrder,
    })),
  ),
  polygon: [],
});

const getPurokPosition = (purok: DeliveryCoverageFormState['puroks'][number] | null | undefined): LatLngTuple | null => {
  const lat = asNumber(purok?.lat, Number.NaN);
  const lng = asNumber(purok?.lng, Number.NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
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

type MapClickCaptureProps = {
  mode: MapEditMode;
  onSetCenter: (lat: number, lng: number) => void;
  onSetPurok: (lat: number, lng: number) => void;
};

const MapClickCapture = ({ mode, onSetCenter, onSetPurok }: MapClickCaptureProps) => {
  useMapEvents({
    click(event) {
      const lat = asNumber(event?.latlng?.lat, Number.NaN);
      const lng = asNumber(event?.latlng?.lng, Number.NaN);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (mode === 'center') onSetCenter(lat, lng);
      if (mode === 'purok') onSetPurok(lat, lng);
    },
  });
  return null;
};

type SyncMapViewProps = {
  center: LatLngTuple;
  watchKey: string;
};

const SyncMapView = ({ center, watchKey }: SyncMapViewProps) => {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize({ pan: false });
    map.setView(center, Math.max(map.getZoom() || 0, 15), { animate: false });
  }, [center, map, watchKey]);

  return null;
};

export const DeliveryCoveragePage = () => {
  ensureLeafletMarkerIcon();

  const [form, setForm] = useState<DeliveryCoverageFormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPurokId, setSelectedPurokId] = useState('');
  const [mapEditMode, setMapEditMode] = useState<MapEditMode>('pan');

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
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadCoverage();
    return () => {
      cancelled = true;
    };
  }, []);

  const activePurokCount = useMemo(
    () =>
      normalizePuroks(form?.puroks || []).filter(
        (purok) => purok.isActive && purok.deliveryStatus === 'active' && String(purok.purokName || '').trim(),
      ).length,
    [form?.puroks],
  );
  const selectedPurokIndex = useMemo(
    () => (form ? form.puroks.findIndex((purok) => purok.id === selectedPurokId) : -1),
    [form, selectedPurokId],
  );
  const selectedPurok = selectedPurokIndex >= 0 && form ? form.puroks[selectedPurokIndex] : null;

  useEffect(() => {
    if (!form?.puroks?.length) {
      setSelectedPurokId('');
      return;
    }

    if (form.puroks.some((purok) => purok.id === selectedPurokId)) return;
    setSelectedPurokId(form.puroks[0]?.id || '');
  }, [form, selectedPurokId]);

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
      const nextId = crypto.randomUUID();
      return {
        ...current,
        puroks: normalizePuroks([
          ...current.puroks,
          {
            id: nextId,
            purokName: '',
            lat: Number.NaN,
            lng: Number.NaN,
            isActive: true,
            deliveryStatus: 'active',
            sortOrder: current.puroks.length + 1,
          },
        ]),
      };
    });
  };

  const setCenterPoint = (lat: number, lng: number) => {
    setForm((current) =>
      current
        ? {
            ...current,
            area: {
              ...current.area,
              centerLat: lat,
              centerLng: lng,
            },
          }
        : current,
    );
  };

  const setPurokPoint = (index: number, lat: number, lng: number) => {
    setForm((current) => {
      if (!current) return current;
      const next = [...current.puroks];
      if (!next[index]) return current;
      next[index] = { ...next[index], lat, lng };
      return { ...current, puroks: normalizePuroks(next) };
    });
  };

  const save = async () => {
    if (!form) return;

    const namedPuroks = normalizePuroks(form.puroks).filter((purok) => String(purok.purokName || '').trim());
    if (!namedPuroks.length) {
      toast.error('Add at least one delivery purok.');
      return;
    }
    if (!Number.isFinite(form.area.centerLat) || !Number.isFinite(form.area.centerLng)) {
      toast.error('Set a valid cafe pickup location.');
      return;
    }
    if (!Number.isFinite(form.area.maxDistanceKm) || form.area.maxDistanceKm <= 0) {
      toast.error('Maximum delivery distance must be greater than zero.');
      return;
    }

    try {
      setIsSaving(true);
      const saved = await deliveryCoverageService.saveDeliveryCoverage({
        area: {
          ...form.area,
          coverageMode: 'radius',
          maxDistanceKm: Math.max(0, form.area.maxDistanceKm),
          deliveryStatus: form.area.deliveryStatus === 'inactive' ? 'inactive' : 'active',
          isActive: form.area.isActive !== false,
        },
        puroks: namedPuroks,
        polygon: [],
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

  const centerPosition: LatLngTuple = [
    asNumber(form.area.centerLat, DEFAULT_CENTER[0]),
    asNumber(form.area.centerLng, DEFAULT_CENTER[1]),
  ];
  const selectedPurokPosition = getPurokPosition(selectedPurok) || centerPosition;
  const activeMapCenter = mapEditMode === 'purok' ? selectedPurokPosition : centerPosition;
  const mapWatchKey = `${mapEditMode}:${centerPosition[0]}:${centerPosition[1]}:${selectedPurokId}:${selectedPurokPosition[0]}:${selectedPurokPosition[1]}`;

  return (
    <section className="rounded-lg border bg-white p-4 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Delivery Coverage</h2>
        <p className="text-sm text-[#6B7280]">
          Set a pickup point, maximum delivery distance, and allowed puroks. Checkout uses free OpenStreetMap tools and distance checks.
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
          Maximum Delivery Distance (km)
          <input
            type="number"
            min={0.1}
            step={0.1}
            className="block border rounded mt-1 px-2 py-1 w-full"
            value={form.area.maxDistanceKm}
            onChange={(event) => updateArea('maxDistanceKm', Math.max(0, Number(event.target.value)))}
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
        <label className="inline-flex items-center gap-2 text-sm md:self-end">
          <input
            type="checkbox"
            checked={form.area.isActive}
            onChange={(event) => updateArea('isActive', event.target.checked)}
          />
          Area enabled for customer delivery
        </label>
      </div>

      <article className="rounded border p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-medium">Coverage Map</h3>
            <p className="text-xs text-[#6B7280]">
              The circle is the delivery limit from the cafe pickup point. Drag markers or tap the map while editing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded border px-3 py-1 text-sm ${mapEditMode === 'pan' ? 'bg-[#FF8FA3] text-white' : 'bg-white'}`}
              onClick={() => setMapEditMode('pan')}
            >
              Move map
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-1 text-sm ${mapEditMode === 'center' ? 'bg-[#FF8FA3] text-white' : 'bg-white'}`}
              onClick={() => setMapEditMode('center')}
            >
              Set pickup
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-1 text-sm ${mapEditMode === 'purok' ? 'bg-[#FF8FA3] text-white' : 'bg-white'}`}
              onClick={() => setMapEditMode('purok')}
            >
              Set purok
            </button>
          </div>
        </div>
        <div className="relative min-h-[360px] rounded border overflow-hidden bg-[#F8FAFC]">
          <MapContainer
            className="h-[360px] w-full"
            center={activeMapCenter}
            zoom={15}
            scrollWheelZoom={mapEditMode === 'pan'}
            dragging={mapEditMode === 'pan'}
            touchZoom={mapEditMode === 'pan'}
          >
            <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
            <Circle
              center={centerPosition}
              radius={Math.max(0.1, form.area.maxDistanceKm) * 1000}
              pathOptions={{
                color: '#111827',
                opacity: 0.8,
                weight: 2,
                fillColor: '#fb7185',
                fillOpacity: 0.12,
              }}
            />
            <Marker
              position={centerPosition}
              draggable
              eventHandlers={{
                dragend(event) {
                  const next = event.target.getLatLng();
                  setCenterPoint(asNumber(next?.lat, centerPosition[0]), asNumber(next?.lng, centerPosition[1]));
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -18]} permanent>
                Cafe pickup
              </Tooltip>
            </Marker>
            {selectedPurok ? (
              <Marker
                position={selectedPurokPosition}
                draggable
                eventHandlers={{
                  dragend(event) {
                    const next = event.target.getLatLng();
                    setPurokPoint(selectedPurokIndex, asNumber(next?.lat, selectedPurokPosition[0]), asNumber(next?.lng, selectedPurokPosition[1]));
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -18]} permanent>
                  {selectedPurok.purokName || 'Selected purok'}
                </Tooltip>
              </Marker>
            ) : null}
            <MapClickCapture
              mode={mapEditMode}
              onSetCenter={setCenterPoint}
              onSetPurok={(lat, lng) => {
                if (selectedPurokIndex >= 0) setPurokPoint(selectedPurokIndex, lat, lng);
              }}
            />
            <SyncMapView center={activeMapCenter} watchKey={mapWatchKey} />
          </MapContainer>
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-white/95 px-2 py-1 text-xs text-[#1F2937] shadow-sm">
            {mapEditMode === 'center' ? 'Tap to set pickup' : mapEditMode === 'purok' ? 'Tap to set selected purok' : 'Pan/zoom enabled'}
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-2 text-sm">
          <label>
            Pickup latitude
            <input
              type="number"
              step="0.000001"
              className="block border rounded mt-1 px-2 py-1 w-full"
              value={form.area.centerLat}
              onChange={(event) => updateArea('centerLat', Number(event.target.value))}
            />
          </label>
          <label>
            Pickup longitude
            <input
              type="number"
              step="0.000001"
              className="block border rounded mt-1 px-2 py-1 w-full"
              value={form.area.centerLng}
              onChange={(event) => updateArea('centerLng', Number(event.target.value))}
            />
          </label>
          <div className="flex items-end">
            <StatusChip label={`${activePurokCount} active purok${activePurokCount === 1 ? '' : 's'}`} tone="neutral" />
          </div>
        </div>
      </article>

      <article className="rounded border p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">Allowed Puroks</h3>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addPurok}>
            Add purok
          </button>
        </div>
        <div className="space-y-2">
          {form.puroks.map((purok, index) => (
            <article
              key={purok.id || `purok-${index + 1}`}
              className={`rounded border p-2 space-y-2 ${selectedPurokId === purok.id ? 'border-[#FF8FA3] ring-1 ring-[#FF8FA3]/40' : ''}`}
            >
              <div className="grid md:grid-cols-[1.2fr_110px_140px_140px_140px_auto] gap-2 items-end">
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
                <label className="text-sm">
                  Latitude
                  <input
                    type="number"
                    step="0.000001"
                    className="block border rounded mt-1 px-2 py-1 w-full"
                    value={Number.isFinite(purok.lat) ? purok.lat : ''}
                    onChange={(event) => updatePurok(index, 'lat', event.target.value === '' ? Number.NaN : Number(event.target.value))}
                  />
                </label>
                <label className="text-sm">
                  Longitude
                  <input
                    type="number"
                    step="0.000001"
                    className="block border rounded mt-1 px-2 py-1 w-full"
                    value={Number.isFinite(purok.lng) ? purok.lng : ''}
                    onChange={(event) => updatePurok(index, 'lng', event.target.value === '' ? Number.NaN : Number(event.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs h-9"
                  onClick={() => {
                    setSelectedPurokId(purok.id);
                    setMapEditMode('purok');
                  }}
                >
                  Edit on map
                </button>
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
