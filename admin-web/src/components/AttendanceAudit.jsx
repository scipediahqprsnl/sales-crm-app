import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Eye, 
  Search, 
  Filter, 
  Camera, 
  Download,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { api, SERVER_BASE } from '../api';
import MonthlyCalendarModal from './MonthlyCalendarModal';

export default function AttendanceAudit({ onViewPhotos, currentUser }) {
  const [attendances, setAttendances] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [calendarEmployee, setCalendarEmployee] = useState(null);

  const isAdmin = currentUser?.role === 'ADMIN';

  const fetchAttendances = async () => {
    setLoading(true);
    try {
      const data = await api.getAllAttendances(selectedDate);
      setAttendances(data.attendances || []);
    } catch (err) {
      console.error('Failed to load attendances:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendances();
  }, [selectedDate]);

  const filtered = attendances.filter((record) => {
    const matchesRole = roleFilter === 'ALL' || record.user_role === roleFilter;
    const matchesSearch = 
      record.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.user_email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const serverUrl = SERVER_BASE;
  const getFullUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('data:image') || url.startsWith('http')) return url;
    return `${serverUrl}${url}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Filter & Search Bar */}
      <div className="glass-panel" style={{ padding: 18, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Date Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff', padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <Calendar size={16} color="#07b0e3" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#0f172a',
                fontFamily: 'inherit',
                fontSize: 13,
                outline: 'none',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* Role Filter (Admin Only) */}
          {isAdmin && (
            <select 
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#0f172a',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none'
              }}
            >
              <option value="ALL">All Roles</option>
              <option value="FIELD_REPRESENTATIVE">Field Representatives</option>
              <option value="BUSINESS_MANAGER">Business Managers</option>
            </select>
          )}

          {/* Search box */}
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff', padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <Search size={14} color="#64748b" />
              <input 
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#0f172a',
                  fontSize: 13,
                  outline: 'none',
                  width: 200
                }}
              />
            </div>
          )}
        </div>

        {/* Quick summary */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {isAdmin ? (
            <>Showing <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{filtered.length}</span> attendance records for {selectedDate}</>
          ) : (
            <>Showing <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>your personal attendance</span> record for {selectedDate}</>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Punch In Time</th>
              <th>Punch In Photo</th>
              <th>Punch Out Time</th>
              <th>Punch Out Photo</th>
              <th>Total Hours</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  Loading attendance records...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  <AlertCircle size={28} color="#6b7280" style={{ margin: '0 auto 8px' }} />
                  <div>
                    {isAdmin
                      ? `No attendance records logged for ${selectedDate}.`
                      : `No personal attendance logged by you for ${selectedDate}.`}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((record) => {
                const inPhoto = getFullUrl(record.punch_in_photo);
                const outPhoto = getFullUrl(record.punch_out_photo);

                return (
                  <tr key={record.id}>
                    {/* Employee Name */}
                    <td>
                      <div style={{ fontWeight: 700 }}>{record.user_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{record.user_email}</div>
                    </td>

                    {/* Role */}
                    <td>
                      <span className={`badge ${record.user_role === 'BUSINESS_MANAGER' ? 'badge-info' : 'badge-warning'}`}>
                        {record.user_role === 'BUSINESS_MANAGER' ? 'Manager' : 'Field Rep'}
                      </span>
                    </td>

                    {/* Punch In */}
                    <td>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={13} color="#10b981" />
                        <span>{new Date(record.punch_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.punch_in_address}>
                        {(!record.punch_in_address || record.punch_in_address.includes('Fetching'))
                          ? (record.punch_in_lat ? `GPS: ${record.punch_in_lat.toFixed(4)}, ${record.punch_in_lng.toFixed(4)}` : 'Recorded via GPS')
                          : record.punch_in_address}
                      </div>
                    </td>

                    {/* Punch In Photo Thumbnail */}
                    <td>
                      {inPhoto ? (
                        <div 
                          onClick={() => onViewPhotos(record)}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 'var(--radius-sm)',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            position: 'relative'
                          }}
                          title="Click to view large selfie"
                        >
                          <img 
                            src={inPhoto} 
                            alt="Punch In Selfie" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          />
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No photo</span>
                      )}
                    </td>

                    {/* Punch Out */}
                    <td>
                      {record.punch_out_time ? (
                        <div>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={13} color="#f59e0b" />
                            <span>{new Date(record.punch_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.punch_out_address}>
                            {(!record.punch_out_address || record.punch_out_address.includes('Fetching'))
                              ? (record.punch_out_lat ? `GPS: ${record.punch_out_lat.toFixed(4)}, ${record.punch_out_lng.toFixed(4)}` : 'Recorded via GPS')
                              : record.punch_out_address}
                          </div>
                        </div>
                      ) : (
                        <span className="badge badge-success" style={{ fontSize: 10 }}>Active On Duty</span>
                      )}
                    </td>

                    {/* Punch Out Photo Thumbnail */}
                    <td>
                      {outPhoto ? (
                        <div 
                          onClick={() => onViewPhotos(record)}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 'var(--radius-sm)',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            position: 'relative'
                          }}
                          title="Click to view large selfie"
                        >
                          <img 
                            src={outPhoto} 
                            alt="Punch Out Selfie" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          />
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {record.punch_out_time ? 'No photo' : 'Pending punch-out'}
                        </span>
                      )}
                    </td>

                    {/* Total Hours */}
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 14, color: record.total_hours > 0 ? '#10b981' : 'var(--text-muted)' }}>
                        {record.total_hours > 0 ? `${record.total_hours} hrs` : 'In Progress'}
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      <span className={`badge ${record.punch_out_time ? 'badge-info' : 'badge-success'}`}>
                        {record.punch_out_time ? 'Completed' : 'Working'}
                      </span>
                    </td>

                    {/* Action */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          onClick={() => setCalendarEmployee(record)}
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                          title="View Monthly Attendance Calendar"
                        >
                          <Calendar size={13} color="#07b0e3" /> Calendar
                        </button>
                        <button
                          onClick={() => onViewPhotos(record)}
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Eye size={13} /> Audit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {calendarEmployee && (
        <MonthlyCalendarModal 
          user={calendarEmployee} 
          onClose={() => setCalendarEmployee(null)} 
        />
      )}
    </div>
  );
}
