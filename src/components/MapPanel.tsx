import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { HospitalMarker } from './HospitalMarker';
import { logActivity } from '../lib/storage';
import type { FilteredHospital, MapAction, Coordinates } from '../types';

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

  useEffect(() => {
    if (!mapAction) return;
    if (mapAction.type === 'show_markers' && mapAction.hospitals) {
      setActiveHospitals(mapAction.hospitals);
      setActiveCenter(mapAction.center || null);
    } else if (mapAction.type === 'clear_markers') {
      setActiveHospitals([]);
      setActiveCenter(null);
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

  const tileUrl = isDark ? DARK_TILES : LIGHT_TILES;

  return (
    <MapContainer
      center={[AHMEDABAD_CENTER.lat, AHMEDABAD_CENTER.lon]}
      zoom={DEFAULT_ZOOM}
      className="w-full h-full"
      zoomControl={true}
      attributionControl={true}
      style={{ borderRadius: 'inherit' }}
    >
      <TileLayer key={isDark ? 'dark' : 'light'} url={tileUrl} attribution={ATTRIBUTION} />
      <MapController hospitals={activeHospitals} center={activeCenter} />
      {activeHospitals.map((h) => (
        <HospitalMarker key={h.id} hospital={h} onSelect={onHospitalSelect} />
      ))}
    </MapContainer>
  );
};