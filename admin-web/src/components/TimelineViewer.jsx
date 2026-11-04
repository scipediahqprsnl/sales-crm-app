import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  MapPin, 
  Calendar, 
  User, 
  CheckCircle, 
  AlertCircle, 
  Navigation, 
  Hourglass, 
  FileText, 
  RotateCw, 
  Camera 
} from 'lucide-react';
import { api } from '../api';
import TimelineMap from './TimelineMap';

export default function TimelineViewer({ initialUserId, onViewPhotos }) {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(initialUserId || '');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);

  // Load user list
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await api.getUsers();
        const nonAdmins = (data.users || []).filter(u => u.role !== 'ADMIN');
        setUsers(nonAdmins);
        if (!selectedUserId && nonAdmins.length > 0) {
          setSelectedUserId(nonAdmins[0].id);
        }
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    };
    fetchUsers();
  }, []);

  // Load timeline for selected user and date
  const fetchTimeline = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      const data = await api.getTimeline(selectedUserId, selectedDate);
      setTimelineData(data);
    } catch (err) {
      console.error('Error fetching timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [selectedUserId, selectedDate]);

  const selectedUserObj = users.find(u => u.id === selectedUserId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Selector Header */}
      <div className="glass-panel" style={{ padding: 18, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {/* Employee dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Staff Member:</span>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#0f172a',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                minWidth: 200
              }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role === 'BUSINESS_MANAGER' ? 'Manager' : 'Field Rep'})
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Date:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff', padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <Calendar size={15} color="#07b0e3" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#0f172a',
                  fontSize: 13,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>
        </div>

        <button 
          onClick={fetchTimeline} 
          className="btn btn-secondary" 
          style={{ padding: '8px 14px', fontSize: 13 }}
        >
          <RotateCw size={14} /> Refresh Timeline
        </button>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
          Generating timeline and dwell analysis...
        </div>
      ) : !timelineData || !timelineData.hasAttendance ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center' }}>
          <AlertCircle size={36} color="#6b7280" style={{ margin: '0 auto 12px' }} />
          <h4 style={{ fontSize: 16, fontWeight: 700 }}>No Movement Recorded for this Date</h4>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            {selectedUserObj?.name || 'This user'} did not punch in on {selectedDate}.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Daily Movement Route Map */}
          <div className="glass-panel" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Daily Trajectory & Movement Route Map</span>
                  <span className="badge badge-success" style={{ fontSize: 10 }}>{timelineData.routePings.length} GPS Points</span>
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Interactive day path with stops and dwell time markers for {selectedUserObj?.name} ({selectedDate})
                </div>
              </div>
            </div>

            <TimelineMap 
              routePings={timelineData.routePings}
              timelineEvents={timelineData.timeline}
              attendance={timelineData.attendance}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
            />
          </div>

          {/* Bottom Grid: Chronological Stream + Shift Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
            {/* Left: Chronological Timeline Stream */}
            <div className="glass-panel" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Day Timeline & Stop Analysis</h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Showing complete daily sequence for {selectedUserObj?.name}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="badge badge-success">{timelineData.totalStops} Client Stops</span>
                <span className="badge badge-info">{timelineData.totalReports} Work Reports</span>
              </div>
            </div>

            {/* Timeline Stream with Connecting Vertical Line */}
            <div style={{ position: 'relative', paddingLeft: 32 }}>
              {/* Connecting vertical line */}
              <div style={{
                position: 'absolute',
                left: 11,
                top: 8,
                bottom: 8,
                width: 2,
                background: 'linear-gradient(to bottom, #10b981, #6366f1, #f59e0b)'
              }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {timelineData.timeline.map((event, idx) => {
                  if (event.type === 'PUNCH_IN') {
                    return (
                      <div key={idx} style={{ position: 'relative' }}>
                        {/* Dot */}
                        <div style={{
                          position: 'absolute',
                          left: -32,
                          top: 2,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#10b981',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)'
                        }}>
                          <CheckCircle size={13} color="white" />
                        </div>

                        <div style={{
                          background: 'rgba(16, 185, 129, 0.08)',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          borderRadius: 'var(--radius-sm)',
                          padding: 14
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700, color: '#34d399', fontSize: 14 }}>
                              {event.title}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(event.time).toLocaleTimeString()}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <MapPin size={13} color="#10b981" />
                            <span>{event.address}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (event.type === 'STATIONARY_STOP') {
                    return (
                      <div key={idx} style={{ position: 'relative' }}>
                        {/* Dot */}
                        <div style={{
                          position: 'absolute',
                          left: -32,
                          top: 2,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#f59e0b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 0 10px rgba(245, 158, 11, 0.4)'
                        }}>
                          <Hourglass size={12} color="white" />
                        </div>

                        <div style={{
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          borderRadius: 'var(--radius-sm)',
                          padding: 14
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700, color: '#fbbf24', fontSize: 14 }}>
                              {event.title}
                            </span>
                            <span className="badge badge-warning" style={{ fontSize: 11 }}>
                              Waited: {event.dwellMinutes} mins
                            </span>
                          </div>

                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={13} color="#f59e0b" />
                            <span>
                              {new Date(event.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {' — '}
                              {new Date(event.departedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <MapPin size={13} color="#9ca3af" />
                            <span>{event.address}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (event.type === 'WORK_REPORT') {
                    return (
                      <div key={idx} style={{ position: 'relative' }}>
                        {/* Dot */}
                        <div style={{
                          position: 'absolute',
                          left: -32,
                          top: 2,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#6366f1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 0 10px rgba(99, 102, 241, 0.4)'
                        }}>
                          <FileText size={12} color="white" />
                        </div>

                        <div style={{
                          background: 'rgba(99, 102, 241, 0.08)',
                          border: '1px solid rgba(99, 102, 241, 0.25)',
                          borderRadius: 'var(--radius-sm)',
                          padding: 14
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700, color: '#a5b4fc', fontSize: 14 }}>
                              {event.title}
                            </span>
                            <span className={`badge ${event.status === 'APPROVED' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: 10 }}>
                              {event.status}
                            </span>
                          </div>

                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                            <strong>Purpose:</strong> {event.meetingType} {event.dealValue ? `• Deal: $${event.dealValue}` : ''}
                          </div>

                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                            "{event.notes}"
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (event.type === 'PUNCH_OUT') {
                    return (
                      <div key={idx} style={{ position: 'relative' }}>
                        {/* Dot */}
                        <div style={{
                          position: 'absolute',
                          left: -32,
                          top: 2,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)'
                        }}>
                          <CheckCircle size={13} color="white" />
                        </div>

                        <div style={{
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          borderRadius: 'var(--radius-sm)',
                          padding: 14
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700, color: '#f87171', fontSize: 14 }}>
                              {event.title}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(event.time).toLocaleTimeString()}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                            Total Shift Working Hours: <strong>{event.totalHours} hrs</strong>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Shift Summary Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="glass-panel" style={{ padding: 20 }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Shift Summary</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Hours:</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>
                    {timelineData.attendance.total_hours || 'In Progress'} hrs
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Punch In:</span>
                  <span>{new Date(timelineData.attendance.punch_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Punch Out:</span>
                  <span>
                    {timelineData.attendance.punch_out_time 
                      ? new Date(timelineData.attendance.punch_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'Active'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>GPS Route Points:</span>
                  <span>{timelineData.routePings.length} pings</span>
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => onViewPhotos(timelineData.attendance)}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  <Camera size={14} /> View Punch Selfie Audit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);
}
