import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Navigation, 
  MapPin, 
  Clock, 
  RotateCw, 
  Eye, 
  Sparkles,
  Phone,
  Radio
} from 'lucide-react';
import { api } from '../api';
import GoogleFleetMap from './GoogleFleetMap';

export default function LiveFleetMap({ onViewPhotos, onSelectTimelineUser }) {
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchLiveFleet = async () => {
    try {
      const data = await api.getLiveFleet();
      setFleet(data.staff || []);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error loading live fleet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveFleet();
    const interval = setInterval(fetchLiveFleet, 10000); // 10s auto refresh
    return () => clearInterval(interval);
  }, []);

  const totalActive = fleet.filter(s => !s.punch_out_time).length;
  const totalMoving = fleet.filter(s => s.liveStatus === 'MOVING').length;
  const totalStationary = fleet.filter(s => s.liveStatus === 'STATIONARY').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16
      }}>
        <div className="glass-panel" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Active On Shift</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(7, 176, 227, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="#07b0e3" />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{totalActive}</div>
          <div style={{ fontSize: 12, color: '#07e375', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="pulsing-dot" /> Tracking live GPS
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Currently Moving</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(7, 227, 117, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Navigation size={18} color="#07e375" />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{totalMoving}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>In transit to client locations</div>
        </div>

        <div className="glass-panel" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>At Client / Stationary</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(227, 198, 7, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={18} color="#e3c607" />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{totalStationary}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Dwell time logged</div>
        </div>

        <div className="glass-panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Fleet Sync</span>
            <button 
              onClick={fetchLiveFleet} 
              className="btn btn-secondary" 
              style={{ padding: '6px 10px', fontSize: 12 }}
              title="Manual refresh"
            >
              <RotateCw size={14} /> Refresh
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Updated: {lastRefreshed.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Main Workspace: Staff List + Visual Map View */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, minHeight: 560 }}>
        {/* Left Column: Active Employees */}
        <div className="glass-panel" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Field Personnel ({fleet.length})</h3>
            <span className="badge badge-info" style={{ fontSize: 10 }}>Live Pings</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 520, paddingRight: 4 }}>
            {fleet.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>
                No employees have punched in today yet.
              </div>
            ) : (
              fleet.map((staff) => {
                const isSelected = selectedStaff?.id === staff.id;
                let statusBadge = <span className="badge badge-info">Idle</span>;
                if (staff.liveStatus === 'MOVING') {
                  statusBadge = <span className="badge badge-success">In Motion</span>;
                } else if (staff.liveStatus === 'STATIONARY') {
                  statusBadge = <span className="badge badge-warning">At Client</span>;
                } else if (staff.liveStatus === 'SHIFT_COMPLETED') {
                  statusBadge = <span className="badge badge-info">Punched Out</span>;
                }

                return (
                  <div
                    key={staff.id}
                    onClick={() => setSelectedStaff(staff)}
                    style={{
                      padding: 14,
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'rgba(7, 176, 227, 0.1)' : '#ffffff',
                      border: isSelected ? '1.5px solid #07b0e3' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{staff.name}</div>
                      {statusBadge}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {staff.role === 'BUSINESS_MANAGER' ? 'Business Manager' : 'Field Representative'}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={13} color="#6366f1" />
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {staff.latestPing 
                          ? `Lat: ${staff.latestPing.latitude.toFixed(3)}, Lng: ${staff.latestPing.longitude.toFixed(3)}`
                          : (staff.punch_in_address || 'GPS awaiting ping')}
                      </span>
                    </div>

                    {staff.currentStop && (
                      <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} />
                        <span>Halted for {staff.currentStop.dwell_minutes}m at {staff.currentStop.location_name}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewPhotos(staff);
                        }}
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px', flex: 1 }}
                      >
                        <Eye size={12} /> Photo Audit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTimelineUser(staff.id);
                        }}
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: '4px 8px', flex: 1 }}
                      >
                        Timeline
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Fleet Live View Display */}
        <div className="glass-panel" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Real-Time Fleet Map</span>
                <span className="badge badge-success" style={{ fontSize: 10 }}>Live GPS Active</span>
              </h3>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {selectedStaff ? `Focused on: ${selectedStaff.name}` : 'Showing live locations of all active field staff'}
              </div>
            </div>

            {selectedStaff && (
              <button 
                onClick={() => setSelectedStaff(null)} 
                className="btn btn-secondary" 
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                Reset Focus
              </button>
            )}
          </div>

          {/* Real Google Maps / Interactive Fleet Tracking */}
          <div style={{ flex: 1, minHeight: 480, position: 'relative' }}>
            <GoogleFleetMap 
              fleet={fleet}
              selectedStaff={selectedStaff}
              onSelectStaff={setSelectedStaff}
              onViewPhotos={onViewPhotos}
              onSelectTimelineUser={onSelectTimelineUser}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
