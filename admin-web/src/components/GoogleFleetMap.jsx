import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Navigation, 
  MapPin, 
  Clock, 
  Layers, 
  Maximize2, 
  Key, 
  Check, 
  Radio, 
  Eye, 
  Calendar,
  Zap,
  Activity,
  AlertCircle,
  Globe
} from 'lucide-react';
import { api } from '../api';

// CARTO Basemap API Key
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY || 'cb1_504s_1_f3ac9b9ea30e4c1947c0f86f';

// High-Resolution Basemap Tile Layers
const TILE_LAYERS = {
  dark: {
    url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
  streets: {
    url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  }
};

// Google Maps Dark Theme JSON Styling
const GOOGLE_MAPS_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }]
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#14233c' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#090d16' }]
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94a3b8' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#334155' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1e1b4b' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#818cf8' }]
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }]
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0b132b' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#475569' }]
  }
];

export default function GoogleFleetMap({ 
  fleet, 
  selectedStaff, 
  onSelectStaff, 
  onViewPhotos, 
  onSelectTimelineUser 
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const circlesRef = useRef({});
  const polylineRef = useRef(null);
  const infoWindowRef = useRef(null);
  const trafficLayerRef = useRef(null);

  // API Key State
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('google_maps_api_key') || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  });
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKeyInput, setTempKeyInput] = useState(apiKey);

  // Map Controls State
  const [mapType, setMapType] = useState('satellite');
  const [showTraffic, setShowTraffic] = useState(false);
  const [showTrails, setShowTrails] = useState(true);
  const [selectedStaffPings, setSelectedStaffPings] = useState([]);

  // Leaflet Fallback Ref
  const leafletMapRef = useRef(null);
  const leafletTileLayerRef = useRef(null);
  const leafletMarkersRef = useRef({});
  const leafletPolylineRef = useRef(null);

  // Helper to extract valid coords for a staff member
  const getStaffCoords = (staff) => {
    if (staff.latestPing && typeof staff.latestPing.latitude === 'number') {
      return { lat: staff.latestPing.latitude, lng: staff.latestPing.longitude };
    }
    if (typeof staff.punch_in_lat === 'number' && typeof staff.punch_in_lng === 'number') {
      return { lat: staff.punch_in_lat, lng: staff.punch_in_lng };
    }
    return null;
  };

  // -------------------------------------------------------------
  // Load Google Maps Script Dynamically
  // -------------------------------------------------------------
  useEffect(() => {
    if (!apiKey) {
      setIsGoogleLoaded(false);
      return;
    }

    if (window.google && window.google.maps) {
      setIsGoogleLoaded(true);
      return;
    }

    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) existingScript.remove();

    window.initGoogleFleetMap = () => {
      setIsGoogleLoaded(true);
      setGoogleLoadError('');
    };

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&callback=initGoogleFleetMap`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      setGoogleLoadError('Failed to load Google Maps script. Check your API Key & billing/domain restrictions.');
      setIsGoogleLoaded(false);
    };

    document.head.appendChild(script);

    return () => {
      delete window.initGoogleFleetMap;
    };
  }, [apiKey]);

  // -------------------------------------------------------------
  // Fetch Selected Staff's Route Trail for today
  // -------------------------------------------------------------
  useEffect(() => {
    if (!selectedStaff) {
      setSelectedStaffPings([]);
      return;
    }

    const fetchRoute = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const data = await api.getTimeline(selectedStaff.id, today);
        if (data && data.routePings && data.routePings.length > 0) {
          setSelectedStaffPings(data.routePings.map(p => ({ lat: p.latitude, lng: p.longitude })));
        } else {
          setSelectedStaffPings([]);
        }
      } catch (err) {
        console.error('Error fetching staff trail:', err);
      }
    };
    fetchRoute();
  }, [selectedStaff]);

  // -------------------------------------------------------------
  // INITIALIZE / UPDATE GOOGLE MAP
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isGoogleLoaded || !mapContainerRef.current || !window.google) return;

    // Clean up Leaflet if previously active
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }

    if (!mapInstanceRef.current) {
      // Find initial center point (either first staff or default to India)
      let initialCenter = { lat: 18.5204, lng: 73.8567 }; // Default Pune / India
      for (const s of fleet) {
        const coords = getStaffCoords(s);
        if (coords) {
          initialCenter = coords;
          break;
        }
      }

      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 14,
        styles: [],
        mapTypeId: 'hybrid',
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: true,
        fullscreenControl: false,
      });

      mapInstanceRef.current = map;
      infoWindowRef.current = new window.google.maps.InfoWindow();
      trafficLayerRef.current = new window.google.maps.TrafficLayer();
    }
  }, [isGoogleLoaded]);

  // Update Google Map Type and Traffic
  useEffect(() => {
    if (!mapInstanceRef.current || !isGoogleLoaded) return;
    const map = mapInstanceRef.current;
    map.setOptions({ styles: [] });
    map.setMapTypeId('hybrid');

    if (trafficLayerRef.current) {
      if (showTraffic) {
        trafficLayerRef.current.setMap(map);
      } else {
        trafficLayerRef.current.setMap(null);
      }
    }
  }, [showTraffic, isGoogleLoaded]);

  // -------------------------------------------------------------
  // UPDATE GOOGLE MAP MARKERS & TRAILS
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isGoogleLoaded || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const google = window.google;

    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;

    // Remove old markers not in current fleet
    const currentIds = new Set(fleet.map(s => s.id));
    Object.keys(markersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        markersRef.current[id].setMap(null);
        delete markersRef.current[id];
        if (circlesRef.current[id]) {
          circlesRef.current[id].setMap(null);
          delete circlesRef.current[id];
        }
      }
    });

    // Create / Update markers
    fleet.forEach(staff => {
      const coords = getStaffCoords(staff);
      if (!coords) return;

      hasCoords = true;
      const latLng = new google.maps.LatLng(coords.lat, coords.lng);
      bounds.extend(latLng);

      const isSelected = selectedStaff?.id === staff.id;
      const isMoving = staff.liveStatus === 'MOVING';
      const isStationary = staff.liveStatus === 'STATIONARY';

      const pinColor = isMoving ? '#10b981' : isStationary ? '#f59e0b' : '#6366f1';

      // Custom SVG Marker Icon
      const markerIcon = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: isSelected ? 12 : 9,
        fillColor: pinColor,
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: isSelected ? 3 : 2,
      };

      if (!markersRef.current[staff.id]) {
        const marker = new google.maps.Marker({
          position: latLng,
          map,
          title: staff.name,
          icon: markerIcon,
          animation: isMoving ? google.maps.Animation.BOUNCE : null,
        });

        marker.addListener('click', () => {
          onSelectStaff(staff);
          openInfoWindow(staff, marker, map);
        });

        markersRef.current[staff.id] = marker;

        // Pulsing radar / accuracy circle around moving staff
        const circle = new google.maps.Circle({
          map,
          radius: isMoving ? 90 : 50,
          fillColor: pinColor,
          fillOpacity: 0.18,
          strokeColor: pinColor,
          strokeOpacity: 0.45,
          strokeWeight: 1,
          center: latLng,
        });
        circlesRef.current[staff.id] = circle;
      } else {
        // Smoothly animate marker to new coordinates
        markersRef.current[staff.id].setPosition(latLng);
        markersRef.current[staff.id].setIcon(markerIcon);
        if (circlesRef.current[staff.id]) {
          circlesRef.current[staff.id].setCenter(latLng);
          circlesRef.current[staff.id].setOptions({
            fillColor: pinColor,
            strokeColor: pinColor,
          });
        }
      }
    });

    // Draw route trail for selected staff
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (showTrails && selectedStaffPings.length > 1) {
      polylineRef.current = new google.maps.Polyline({
        path: selectedStaffPings,
        geodesic: true,
        strokeColor: '#6366f1',
        strokeOpacity: 0.85,
        strokeWeight: 4,
        map,
      });
    }

    // Auto-center on selected staff
    if (selectedStaff) {
      const coords = getStaffCoords(selectedStaff);
      if (coords) {
        map.panTo(coords);
        if (map.getZoom() < 15) map.setZoom(15);
        if (markersRef.current[selectedStaff.id]) {
          openInfoWindow(selectedStaff, markersRef.current[selectedStaff.id], map);
        }
      }
    } else if (hasCoords && Object.keys(markersRef.current).length === 1) {
      map.setCenter(bounds.getCenter());
    }
  }, [fleet, selectedStaff, selectedStaffPings, showTrails, isGoogleLoaded]);

  // Open rich InfoWindow for a staff member
  const openInfoWindow = (staff, marker, map) => {
    if (!infoWindowRef.current) return;
    const coords = getStaffCoords(staff);
    if (!coords) return;

    const isMoving = staff.liveStatus === 'MOVING';
    const isStationary = staff.liveStatus === 'STATIONARY';
    const speedKmh = staff.latestPing?.speed ? (staff.latestPing.speed * 3.6).toFixed(1) : '0.0';

    const contentString = `
      <div style="color: #0f172a; font-family: sans-serif; padding: 4px; min-width: 220px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <strong style="font-size: 14px; color: #1e1b4b;">${staff.name}</strong>
          <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 9999px; background: ${
            isMoving ? '#d1fae5; color: #065f46;' : isStationary ? '#fef3c7; color: #92400e;' : '#e0e7ff; color: #3730a3;'
          }">
            ${isMoving ? '🚗 IN MOTION' : isStationary ? '📍 AT CLIENT' : 'IDLE'}
          </span>
        </div>
        <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${staff.role === 'BUSINESS_MANAGER' ? 'Business Manager' : 'Field Representative'}</div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 8px 0;" />
        <div style="font-size: 11px; line-height: 1.5; color: #334155;">
          <div><strong>Speed:</strong> ${speedKmh} km/h</div>
          <div><strong>Coordinates:</strong> ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}</div>
          ${staff.currentStop ? `<div style="color: #b45309; margin-top: 3px;">⏳ Halted for <strong>${staff.currentStop.dwell_minutes}m</strong> at ${staff.currentStop.location_name}</div>` : ''}
        </div>
      </div>
    `;

    infoWindowRef.current.setContent(contentString);
    infoWindowRef.current.open(map, marker);
  };

  // -------------------------------------------------------------
  // LEAFLET INTERACTIVE FALLBACK (Used if no Google Key provided)
  // -------------------------------------------------------------
  useEffect(() => {
    if (isGoogleLoaded || !mapContainerRef.current) return;
    if (typeof window.L === 'undefined') return;

    const L = window.L;

    if (!leafletMapRef.current) {
      let initialCenter = [18.5204, 73.8567];
      for (const s of fleet) {
        const coords = getStaffCoords(s);
        if (coords) {
          initialCenter = [coords.lat, coords.lng];
          break;
        }
      }

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 14,
        zoomControl: false,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const tileConfig = TILE_LAYERS.satellite;
      leafletTileLayerRef.current = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: tileConfig.maxZoom,
      }).addTo(map);

      leafletMapRef.current = map;
    }

    const map = leafletMapRef.current;

    // Ensure satellite tile layer is active
    if (!leafletTileLayerRef.current) {
      const tileConfig = TILE_LAYERS.satellite;
      leafletTileLayerRef.current = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: tileConfig.maxZoom,
      }).addTo(map);
    }

    // Update Leaflet markers
    const currentIds = new Set(fleet.map(s => s.id));
    Object.keys(leafletMarkersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        map.removeLayer(leafletMarkersRef.current[id]);
        delete leafletMarkersRef.current[id];
      }
    });

    const latLngs = [];
    fleet.forEach(staff => {
      const coords = getStaffCoords(staff);
      if (!coords) return;
      latLngs.push([coords.lat, coords.lng]);

      const isSelected = selectedStaff?.id === staff.id;
      const isMoving = staff.liveStatus === 'MOVING';
      const isStationary = staff.liveStatus === 'STATIONARY';
      const pinColor = isMoving ? '#10b981' : isStationary ? '#f59e0b' : '#6366f1';

      const customIcon = L.divIcon({
        className: 'custom-fleet-pin',
        html: `
          <div style="
            width: ${isSelected ? 26 : 20}px;
            height: ${isSelected ? 26 : 20}px;
            background: ${pinColor};
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 0 14px ${pinColor};
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
          "></div>
        `,
        iconSize: [isSelected ? 26 : 20, isSelected ? 26 : 20],
        iconAnchor: [isSelected ? 13 : 10, isSelected ? 13 : 10],
      });

      if (!leafletMarkersRef.current[staff.id]) {
        const marker = L.marker([coords.lat, coords.lng], { icon: customIcon }).addTo(map);
        marker.bindPopup(`
          <div style="font-family: sans-serif; font-size: 13px;">
            <strong style="font-size: 14px; color: #1e1b4b;">${staff.name}</strong>
            <div style="font-size: 11px; color: #64748b;">${staff.role}</div>
            <div style="margin-top: 6px;">Status: <strong>${staff.liveStatus}</strong></div>
            <div>Lat: ${coords.lat.toFixed(4)}, Lng: ${coords.lng.toFixed(4)}</div>
          </div>
        `);
        marker.on('click', () => onSelectStaff(staff));
        leafletMarkersRef.current[staff.id] = marker;
      } else {
        leafletMarkersRef.current[staff.id].setLatLng([coords.lat, coords.lng]);
        leafletMarkersRef.current[staff.id].setIcon(customIcon);
      }
    });

    // Trail polyline in Leaflet
    if (leafletPolylineRef.current) {
      map.removeLayer(leafletPolylineRef.current);
      leafletPolylineRef.current = null;
    }

    if (showTrails && selectedStaffPings.length > 1) {
      leafletPolylineRef.current = L.polyline(
        selectedStaffPings.map(p => [p.lat, p.lng]),
        { color: '#6366f1', weight: 4, opacity: 0.85 }
      ).addTo(map);
    }

    if (selectedStaff) {
      const coords = getStaffCoords(selectedStaff);
      if (coords) map.panTo([coords.lat, coords.lng]);
    }
  }, [fleet, selectedStaff, selectedStaffPings, showTrails, isGoogleLoaded]);

  // Handle Save API Key
  const handleSaveApiKey = () => {
    const trimmed = tempKeyInput.trim();
    setApiKey(trimmed);
    localStorage.setItem('google_maps_api_key', trimmed);
    setShowKeyModal(false);
  };

  // Center on all fleet bounds
  const handleFitAll = () => {
    if (isGoogleLoaded && mapInstanceRef.current && window.google) {
      const bounds = new window.google.maps.LatLngBounds();
      let hasCoords = false;
      fleet.forEach(s => {
        const coords = getStaffCoords(s);
        if (coords) {
          bounds.extend(new window.google.maps.LatLng(coords.lat, coords.lng));
          hasCoords = true;
        }
      });
      if (hasCoords) mapInstanceRef.current.fitBounds(bounds);
    } else if (leafletMapRef.current && typeof window.L !== 'undefined') {
      const latLngs = [];
      fleet.forEach(s => {
        const coords = getStaffCoords(s);
        if (coords) latLngs.push([coords.lat, coords.lng]);
      });
      if (latLngs.length > 0) {
        leafletMapRef.current.fitBounds(window.L.latLngBounds(latLngs), { padding: [40, 40] });
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {/* Top Map Control Bar (Dedicated Header Bar above map) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        padding: '8px 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-md)'
      }}>
        {/* Left: Mode Status Badge & Provider Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isGoogleLoaded ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#38bdf8', fontWeight: 700 }}>
              <span className="pulsing-dot" style={{ background: '#38bdf8' }} />
              Google Satellite
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#10b981', fontWeight: 600 }}>
              <span className="pulsing-dot" />
              Satellite Imagery Active
            </span>
          )}

          <div style={{ width: 1, height: 16, background: 'var(--border-color)', margin: '0 2px' }} />

          <button
            onClick={() => setShowKeyModal(true)}
            className="btn btn-secondary"
            style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Key size={12} color="#818cf8" />
            {apiKey ? 'Google Key Configured' : 'Optional Google Key'}
          </button>
        </div>

        {/* Right: Map Type & Layer Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Satellite View Mode Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            borderRadius: 'var(--radius-sm)',
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 700,
            color: '#93c5fd'
          }}>
            <Globe size={13} color="#60a5fa" />
            <span>🛰️ Satellite View Active</span>
          </div>

          {/* Traffic Layer (Only on Google) */}
          {isGoogleLoaded && (
            <button
              onClick={() => setShowTraffic(!showTraffic)}
              style={{
                border: '1px solid var(--border-color)',
                background: showTraffic ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.04)',
                color: showTraffic ? '#34d399' : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
              title="Toggle Google Real-Time Traffic"
            >
              <Activity size={12} />
              Traffic
            </button>
          )}

          {/* Toggle Polyline Trail */}
          <button
            onClick={() => setShowTrails(!showTrails)}
            style={{
              border: '1px solid var(--border-color)',
              background: showTrails ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.04)',
              color: showTrails ? '#a5b4fc' : 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            title="Toggle travel route polyline"
          >
            <Navigation size={12} />
            Route Trail
          </button>

          {/* Fit All Fleet Button */}
          <button
            onClick={handleFitAll}
            className="btn btn-secondary"
            style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            title="Fit all staff markers on screen"
          >
            <Maximize2 size={12} />
            Fit Fleet
          </button>
        </div>
      </div>

      {/* Map Viewport Area */}
      <div style={{ flex: 1, minHeight: 460, position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <div 
          ref={mapContainerRef} 
          style={{ 
            width: '100%', 
            height: '100%', 
            minHeight: 460, 
            background: '#0f172a'
          }} 
        />

        {/* Bottom Live Fleet Legend */}
        <div style={{
          position: 'absolute',
          bottom: 14,
          left: 14,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(10px)',
          padding: '8px 14px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          fontSize: 11,
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            <span>Moving Staff</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            <span>Stationary / Client Visit</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
            <span>Idle / Active Shift</span>
          </div>
        </div>
      </div>

      {/* API Key Configuration Modal */}
      {showKeyModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div className="glass-panel" style={{ maxWidth: 460, width: '100%', padding: 26, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Key size={18} color="#818cf8" />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Google Maps Platform API Key</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Enable official Google Maps, Satellite View, and Live Traffic</p>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
              Paste your <strong>Google Maps JavaScript API key</strong> below. It will be securely stored in your browser session and immediately power the live fleet map.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                GOOGLE MAPS API KEY:
              </label>
              <input
                type="text"
                className="input"
                placeholder="AIzaSy..."
                value={tempKeyInput}
                onChange={(e) => setTempKeyInput(e.target.value)}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>

            {googleLoadError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                fontSize: 12,
                color: '#f87171',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8
              }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{googleLoadError}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setShowKeyModal(false)}
                className="btn btn-secondary"
                style={{ fontSize: 13, padding: '8px 14px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                className="btn btn-primary"
                style={{ fontSize: 13, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Check size={14} />
                Save & Load Google Maps
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

