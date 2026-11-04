import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Maximize2, 
  MapPin, 
  Clock, 
  Navigation, 
  CheckCircle,
  FileText,
  Layers,
  Zap
} from 'lucide-react';

const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY || 'cb1_504s_1_f3ac9b9ea30e4c1947c0f86f';

const TILE_LAYERS = {
  dark: {
    url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; World Imagery',
    maxZoom: 19,
  },
  streets: {
    url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }
};

export default function TimelineMap({ 
  routePings = [], 
  timelineEvents = [], 
  attendance = {}, 
  selectedEventId = null,
  onSelectEvent = () => {} 
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const polylineRef = useRef(null);
  const replayMarkerRef = useRef(null);

  // Map Controls State
  const [mapType, setMapType] = useState('satellite');
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1); // 1x, 2x, 5x

  const replayTimerRef = useRef(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      let initialCenter = [18.5284, 73.8744]; // Pune default
      if (routePings.length > 0) {
        initialCenter = [routePings[0].latitude, routePings[0].longitude];
      }

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 13,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const tileConfig = TILE_LAYERS.satellite;
      tileLayerRef.current = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: tileConfig.maxZoom,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    };
  }, []);

  // Update Tile Layer
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    mapInstanceRef.current.removeLayer(tileLayerRef.current);
    const tileConfig = TILE_LAYERS.satellite;
    tileLayerRef.current = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
    }).addTo(mapInstanceRef.current);
  }, [mapType]);

  // Render Daily Route Polyline & Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    const latLngs = routePings.map(p => [p.latitude, p.longitude]);

    // 1. Draw glowing traveled route polyline
    if (latLngs.length > 1) {
      // Glow underlay
      L.polyline(latLngs, {
        color: '#818cf8',
        weight: 8,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(layer);

      // Main route line
      polylineRef.current = L.polyline(latLngs, {
        color: '#6366f1',
        weight: 4,
        opacity: 0.95,
        dashArray: '1, 0',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
    }

    // 2. Render Chronological Event Markers
    let stopCounter = 1;

    timelineEvents.forEach((ev, idx) => {
      if (!ev.latitude || !ev.longitude) return;

      if (ev.type === 'PUNCH_IN') {
        const startIcon = L.divIcon({
          className: 'timeline-marker',
          html: `
            <div style="
              background: #10b981;
              color: white;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              border: 3px solid #ffffff;
              box-shadow: 0 0 15px rgba(16, 185, 129, 0.6);
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 800;
              font-size: 13px;
            ">
              🏁
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        L.marker([ev.latitude, ev.longitude], { icon: startIcon })
          .addTo(layer)
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px; min-width: 200px;">
              <span style="background: #d1fae5; color: #065f46; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 9999px;">
                START (PUNCH IN)
              </span>
              <h4 style="margin: 6px 0 2px 0; color: #1e1b4b; font-size: 14px;">${ev.title}</h4>
              <div style="color: #64748b; font-size: 11px;">⏰ ${new Date(ev.time).toLocaleTimeString()}</div>
              <div style="margin-top: 4px; font-size: 11px; color: #334155;">📍 ${ev.address || 'Start Coordinates'}</div>
            </div>
          `);
      } else if (ev.type === 'STATIONARY_STOP') {
        const currentStopNum = stopCounter++;
        const stopIcon = L.divIcon({
          className: 'timeline-marker',
          html: `
            <div style="
              background: #f59e0b;
              color: #ffffff;
              width: 30px;
              height: 30px;
              border-radius: 50%;
              border: 3px solid #ffffff;
              box-shadow: 0 0 14px rgba(245, 158, 11, 0.6);
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 800;
              font-size: 12px;
            ">
              ${currentStopNum}
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        L.marker([ev.latitude, ev.longitude], { icon: stopIcon })
          .addTo(layer)
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px; min-width: 220px;">
              <span style="background: #fef3c7; color: #92400e; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 9999px;">
                STOP #${currentStopNum} • HALTED ${ev.dwellMinutes} MINS
              </span>
              <h4 style="margin: 6px 0 2px 0; color: #1e1b4b; font-size: 14px;">${ev.title}</h4>
              <div style="color: #64748b; font-size: 11px;">
                🕒 ${new Date(ev.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &rarr; ${new Date(ev.departedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style="margin-top: 4px; font-size: 11px; color: #334155;">📍 ${ev.address || ''}</div>
            </div>
          `);
      } else if (ev.type === 'WORK_REPORT') {
        const reportIcon = L.divIcon({
          className: 'timeline-marker',
          html: `
            <div style="
              background: #6366f1;
              color: white;
              width: 28px;
              height: 28px;
              border-radius: 50%;
              border: 3px solid #ffffff;
              box-shadow: 0 0 14px rgba(99, 102, 241, 0.6);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
            ">
              📝
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        L.marker([ev.latitude, ev.longitude], { icon: reportIcon })
          .addTo(layer)
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px; min-width: 220px;">
              <span style="background: #e0e7ff; color: #3730a3; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 9999px;">
                CLIENT VISIT REPORT (${ev.status || 'SUBMITTED'})
              </span>
              <h4 style="margin: 6px 0 2px 0; color: #1e1b4b; font-size: 14px;">${ev.title}</h4>
              <div style="color: #64748b; font-size: 11px;">⏰ ${new Date(ev.time).toLocaleTimeString()}</div>
              <div style="font-size: 12px; color: #4338ca; margin-top: 4px;"><strong>Purpose:</strong> ${ev.meetingType || 'Meeting'}</div>
              <div style="font-size: 11px; color: #475569; margin-top: 2px; font-style: italic;">"${ev.notes || ''}"</div>
            </div>
          `);
      } else if (ev.type === 'PUNCH_OUT') {
        const endIcon = L.divIcon({
          className: 'timeline-marker',
          html: `
            <div style="
              background: #ef4444;
              color: white;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              border: 3px solid #ffffff;
              box-shadow: 0 0 15px rgba(239, 68, 68, 0.6);
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 800;
              font-size: 13px;
            ">
              🔴
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        L.marker([ev.latitude, ev.longitude], { icon: endIcon })
          .addTo(layer)
          .bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px; min-width: 200px;">
              <span style="background: #fee2e2; color: #991b1b; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 9999px;">
                SHIFT FINISHED
              </span>
              <h4 style="margin: 6px 0 2px 0; color: #1e1b4b; font-size: 14px;">${ev.title}</h4>
              <div style="color: #64748b; font-size: 11px;">⏰ ${new Date(ev.time).toLocaleTimeString()}</div>
              <div style="margin-top: 4px; font-size: 11px; color: #334155;">Total Hours: <strong>${ev.totalHours} hrs</strong></div>
            </div>
          `);
      }
    });

    // 3. If currently on shift without punch-out, highlight current live point
    if (!attendance.punch_out_time && routePings.length > 0) {
      const latestPing = routePings[routePings.length - 1];
      const liveIcon = L.divIcon({
        className: 'timeline-live-marker',
        html: `
          <div style="
            background: #10b981;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 0 16px #10b981;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pulse 1.5s infinite;
          "></div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([latestPing.latitude, latestPing.longitude], { icon: liveIcon })
        .addTo(layer)
        .bindPopup(`
          <div style="font-family: sans-serif; font-size: 13px;">
            <strong style="color: #065f46;">📍 Current Live Position</strong>
            <div style="font-size: 11px; color: #64748b;">Recorded at ${new Date(latestPing.recorded_at).toLocaleTimeString()}</div>
          </div>
        `);
    }
  }, [routePings, timelineEvents, attendance]);

  // Handle Playback Animation along route
  useEffect(() => {
    if (!isPlaying) {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      return;
    }

    if (routePings.length === 0) return;

    replayTimerRef.current = setInterval(() => {
      setReplayIndex(prevIndex => {
        if (prevIndex >= routePings.length - 1) {
          setIsPlaying(false);
          return 0;
        }

        const nextIndex = prevIndex + 1;
        const ping = routePings[nextIndex];

        if (mapInstanceRef.current && ping) {
          // Update replay marker
          if (!replayMarkerRef.current) {
            const replayIcon = L.divIcon({
              className: 'replay-car-icon',
              html: `
                <div style="
                  width: 32px;
                  height: 32px;
                  border-radius: 50%;
                  background: #6366f1;
                  border: 3px solid #ffffff;
                  box-shadow: 0 0 16px rgba(99, 102, 241, 0.9);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 14px;
                ">🚗</div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            });
            replayMarkerRef.current = L.marker([ping.latitude, ping.longitude], { icon: replayIcon, zIndexOffset: 1000 }).addTo(mapInstanceRef.current);
          } else {
            replayMarkerRef.current.setLatLng([ping.latitude, ping.longitude]);
          }

          mapInstanceRef.current.panTo([ping.latitude, ping.longitude]);
        }

        return nextIndex;
      });
    }, 1200 / replaySpeed);

    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    };
  }, [isPlaying, routePings, replaySpeed]);

  const handleResetReplay = () => {
    setIsPlaying(false);
    setReplayIndex(0);
    if (replayMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(replayMarkerRef.current);
      replayMarkerRef.current = null;
    }
    if (routePings.length > 0 && mapInstanceRef.current) {
      mapInstanceRef.current.panTo([routePings[0].latitude, routePings[0].longitude]);
    }
  };

  const handleFitRoute = () => {
    if (!mapInstanceRef.current || routePings.length === 0) return;
    const latLngs = routePings.map(p => [p.latitude, p.longitude]);
    mapInstanceRef.current.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
  };

  const currentReplayPing = routePings[replayIndex] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top Map Action Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        background: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(12px)',
        padding: '10px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-md)'
      }}>
        {/* Left: Replay Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlaying ? 'Pause' : 'Replay Whole Day Route'}</span>
          </button>

          <button
            onClick={handleResetReplay}
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            title="Reset to morning start"
          >
            <RotateCcw size={14} />
            Reset
          </button>

          {/* Speed Selector */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
            {[1, 2, 5].map(s => (
              <button
                key={s}
                onClick={() => setReplaySpeed(s)}
                style={{
                  border: 'none',
                  background: replaySpeed === s ? 'var(--accent-primary)' : 'transparent',
                  color: replaySpeed === s ? '#fff' : 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                {s}x
              </button>
            ))}
          </div>

          {currentReplayPing && (
            <span style={{ fontSize: 12, color: '#a5b4fc', fontFamily: 'monospace', marginLeft: 4 }}>
              🕒 {new Date(currentReplayPing.recorded_at).toLocaleTimeString()} ({replayIndex + 1}/{routePings.length})
            </span>
          )}
        </div>

        {/* Right: Map Layers & Fit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            <span>🛰️ Satellite Route View</span>
          </div>

          <button
            onClick={handleFitRoute}
            className="btn btn-secondary"
            style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            title="Fit full route in screen"
          >
            <Maximize2 size={12} />
            Fit Route
          </button>
        </div>
      </div>

      {/* Map Viewport Container */}
      <div style={{
        height: 440,
        width: '100%',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-color)'
      }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', background: '#0f172a' }} />

        {/* Bottom Legend */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(10px)',
          padding: '6px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          fontSize: 11,
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 12 }}>🏁</span>
            <span>Punch In</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#f59e0b', color: '#fff', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
            <span>Client Stops</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 12 }}>📝</span>
            <span>Work Reports</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 3, background: '#6366f1', display: 'inline-block', borderRadius: 2 }} />
            <span>Traveled Path</span>
          </div>
        </div>
      </div>
    </div>
  );
}

