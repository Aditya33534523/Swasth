import React, { useMemo, useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Popup, Polyline, TileLayer, useMap } from 'react-leaflet';
import { Search, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { HospitalMarker } from './HospitalMarker';
import { filterHospitals } from '../lib/filterHospitals';
import { logActivity } from '../lib/storage';
import type { CardType, FilteredHospital, MapAction, Coordinates } from '../types';

const AHMEDABAD_CENTER: Coordinates = { lat: 23.0225, lon: 72.5714 };
const DEFAULT_ZOOM = 12;

const LIGHT_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIBUTION = '&copy; OpenStreetMap contributors';

/** Component that reacts to map actions (fly to, fit bounds) */
const MapController: React.FC<{
  hospitals: FilteredHospital[];
  center: Coordinates | null;
}> = ({ hospitals, center }) => {
  const map = useMap();
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (hospitals.length === 0) return;

    // Only re-fit if the hospital list changed
    if (hospitals.length !== prevLengthRef.current) {
      prevLengthRef.current = hospitals.length;

      if (hospitals.length === 1) {
        map.flyTo([hospitals[0].lat, hospitals[0].lon], 14, { duration: 1.2 });
      } else {
        const bounds: L.LatLngBounds = L.latLngBounds(
          hospitals.map((h) => [h.lat, h.lon] as L.LatLngTuple),
        );
        map.flyToBounds(bounds, { padding: [50, 50], duration: 1.2, maxZoom: 14 });
      }
    }
  }, [hospitals, map]);

  useEffect(() => {
    if (center) {
      map.flyTo([center.lat, center.lon], DEFAULT_ZOOM, { duration: 1.2 });
    }
  }, [center, map]);

  return null;
};

const UserLocationOverlay: React.FC<{ onLocation: (coords: Coordinates) => void }> = ({ onLocation }) => {
  const [location, setLocation] = useState<Coordinates | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const current = { lat: coords.latitude, lon: coords.longitude };
        setLocation(current);
        onLocation(current);
      },
      () => {
        // GPS is optional; pincode and city searches still work.
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }, [onLocation]);

  if (!location) return null;
  return (
    <>
      <Circle
        center={[location.lat, location.lon]}
        radius={120}
        pathOptions={{ color: 'var(--accent)', fillColor: 'var(--accent)', fillOpacity: 0.12, weight: 1 }}
      />
      <CircleMarker
        center={[location.lat, location.lon]}
        radius={8}
        pathOptions={{ color: '#fff', fillColor: 'var(--accent)', fillOpacity: 1, weight: 3 }}
      >
        <Popup>Your current location</Popup>
      </CircleMarker>
    </>
  );
};

const RouteOverlay: React.FC<{
  from: Coordinates | null;
  to: FilteredHospital | null;
}> = ({ from, to }) => {
  if (!from || !to) return null;
  return (
    <Polyline
      positions={[
        [from.lat, from.lon],
        [to.lat, to.lon],
      ]}
      pathOptions={{ color: 'var(--accent)', weight: 3, dashArray: '8 8', opacity: 0.8 }}
    />
  );
};

interface MapPanelProps {
  mapAction: MapAction | null;
  isDark: boolean;
  onHospitalSelect: (h: FilteredHospital) => void;
}

export const MapPanel: React.FC<MapPanelProps> = ({
  mapAction,
  isDark,
  onHospitalSelect,
}) => {
  // Track active hospitals shown on map
  const [activeHospitals, setActiveHospitals] = useState<FilteredHospital[]>([]);
  const [activeCenter, setActiveCenter] = useState<Coordinates | null>(null);
  const [cardFilter, setCardFilter] = useState<CardType | 'all'>('all');
  const [specialityFilter, setSpecialityFilter] = useState('');
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [selectedHospital, setSelectedHospital] = useState<FilteredHospital | null>(null);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    if (!mapAction) return;
    if (mapAction.type === 'show_markers' && mapAction.hospitals) {
      setActiveHospitals(mapAction.hospitals);
      setActiveCenter(mapAction.center || null);
    } else if (mapAction.type === 'clear_markers') {
      setActiveHospitals([]);
      setActiveCenter(null);
      setSelectedHospital(null);
    } else if (mapAction.type === 'fly_to' && mapAction.center) {
      setActiveCenter(mapAction.center);
    } else if (mapAction.type === 'highlight_marker' && mapAction.hospitalId) {
      const h = activeHospitals.find((h) => h.id === mapAction.hospitalId);
      if (h) {
        setActiveCenter({ lat: h.lat, lon: h.lon });
        onHospitalSelect(h);
      }
    }
  }, [mapAction, activeHospitals, onHospitalSelect]);

  useEffect(() => {
    // A chat search is authoritative; otherwise populate the map when the tab opens.
    if (mapAction && mapAction.type !== 'fly_to') return;

    const requestId = ++loadRequestRef.current;
    const center = userLocation || AHMEDABAD_CENTER;
    filterHospitals({ ...center, cardType: 'none', radiusKm: 100 })
      .then((hospitals) => {
        if (requestId !== loadRequestRef.current || mapAction?.type === 'show_markers') return;
        setActiveHospitals(hospitals.slice(0, 100));
        setActiveCenter(center);
      })
      .catch((error) => {
        console.error('Failed to load nearby hospitals:', error);
      });
  }, [userLocation, mapAction]);

  const visibleHospitals = useMemo(() => {
    const speciality = specialityFilter.trim().toLowerCase();
    return activeHospitals
      .filter((hospital) => {
        if (cardFilter === 'maa' && !hospital.acceptsMaa) return false;
        if (cardFilter === 'ayushman' && !hospital.acceptsAyushman) return false;
        if (cardFilter === 'both' && !(hospital.acceptsMaa && hospital.acceptsAyushman)) return false;
        if (speciality && !hospital.specialities.some((item) => item.toLowerCase().includes(speciality))) return false;
        return true;
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [activeHospitals, cardFilter, specialityFilter]);

  const selectHospital = (hospital: FilteredHospital) => {
    setActiveCenter({ lat: hospital.lat, lon: hospital.lon });
    setSelectedHospital(hospital);
    onHospitalSelect(hospital);
  };

  const tileUrl = isDark ? DARK_TILES : LIGHT_TILES;

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={[AHMEDABAD_CENTER.lat, AHMEDABAD_CENTER.lon]}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full"
        zoomControl={true}
        attributionControl={true}
        style={{ borderRadius: 'inherit' }}
      >
        <TileLayer key={isDark ? 'dark' : 'light'} url={tileUrl} attribution={ATTRIBUTION} />
        <UserLocationOverlay onLocation={setUserLocation} />
        <RouteOverlay from={userLocation} to={selectedHospital} />
        <MapController hospitals={visibleHospitals} center={activeCenter} />
        {visibleHospitals.map((h) => (
          <HospitalMarker key={h.id} hospital={h} onSelect={selectHospital} />
        ))}
      </MapContainer>

      <aside
        className="map-dock glass-strong absolute left-3 top-3 bottom-3 z-[1000] flex w-[calc(100%-1.5rem)] max-w-[22rem] flex-col overflow-hidden rounded-2xl sm:w-80"
        aria-label="Nearby hospitals"
      >
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Nearby hospitals
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {visibleHospitals.length} shown · nearest first
              </p>
            </div>
            {(cardFilter !== 'all' || specialityFilter) && (
              <button
                type="button"
                onClick={() => {
                  setCardFilter('all');
                  setSpecialityFilter('');
                }}
                className="rounded-full p-1.5"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Clear map filters"
                title="Clear filters"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={specialityFilter}
              onChange={(event) => setSpecialityFilter(event.target.value)}
              placeholder="Filter by speciality"
              className="w-full rounded-xl border bg-transparent py-2 pl-8 pr-3 text-xs outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              aria-label="Filter hospitals by speciality"
            />
          </div>

          <select
            value={cardFilter}
            onChange={(event) => setCardFilter(event.target.value as CardType | 'all')}
            className="mt-2 w-full rounded-xl border bg-transparent px-3 py-2 text-xs outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            aria-label="Filter hospitals by scheme"
          >
            <option value="all">All scheme types</option>
            <option value="maa">MAA Card</option>
            <option value="ayushman">Ayushman Bharat</option>
            <option value="both">Both schemes</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleHospitals.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
              {activeHospitals.length === 0
                ? 'Search for hospitals from the Chat tab to see results here.'
                : 'No hospitals match these filters.'}
            </p>
          ) : (
            visibleHospitals.map((hospital, index) => (
              <button
                key={hospital.id}
                type="button"
                onClick={() => selectHospital(hospital)}
                className="mb-1.5 w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/10"
                style={{ color: 'var(--text-primary)' }}
              >
                <div className="flex items-start gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ background: 'var(--accent)', color: 'white' }}>
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{hospital.name}</span>
                    <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {hospital.distanceKm.toFixed(1)} km · {hospital.district || hospital.state}
                    </span>
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
};