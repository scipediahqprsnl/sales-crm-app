import React, { useEffect } from 'react';
import { X, MapPin, Calendar, Clock, User, ShieldCheck } from 'lucide-react';

export default function PhotoModal({ data, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!data) return null;

  const serverUrl = 'http://localhost:5000';
  const getFullUrl = (url) => {
    if (!url) return null;
    return url.startsWith('http') ? url : `${serverUrl}${url}`;
  };

  const inPhoto = getFullUrl(data.punch_in_photo);
  const outPhoto = getFullUrl(data.punch_out_photo);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        style={{ maxWidth: 840, width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Attendance Verification Audit</span>
              <span className="badge badge-info">{data.user_role || data.role || 'Employee'}</span>
            </h3>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {data.user_name || data.name} • {data.date || new Date().toISOString().split('T')[0]}
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="btn btn-secondary" 
            style={{ padding: '6px 10px', borderRadius: 'var(--radius-full)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body: Side by Side Punch Photos */}
        <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {/* Punch In Card */}
          <div className="glass-panel" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="badge badge-success">Punch In Verification</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {data.punch_in_time ? new Date(data.punch_in_time).toLocaleTimeString() : 'N/A'}
              </span>
            </div>

            <div style={{
              height: 280,
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-color)',
              marginBottom: 12
            }}>
              {inPhoto ? (
                <img 
                  src={inPhoto} 
                  alt="Punch In Selfie" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<div style="color:#ef4444;font-size:12px;padding:20px;text-align:center">Photo preview unavailable</div>';
                  }}
                />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No photo captured</div>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <MapPin size={14} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{data.punch_in_address || 'Address logged via GPS'}</span>
              </div>
              {data.punch_in_lat && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 20 }}>
                  GPS: {data.punch_in_lat.toFixed(5)}, {data.punch_in_lng.toFixed(5)}
                </div>
              )}
            </div>
          </div>

          {/* Punch Out Card */}
          <div className="glass-panel" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="badge badge-warning">Punch Out Verification</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {data.punch_out_time ? new Date(data.punch_out_time).toLocaleTimeString() : 'Not Punched Out Yet'}
              </span>
            </div>

            <div style={{
              height: 280,
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-color)',
              marginBottom: 12
            }}>
              {outPhoto ? (
                <img 
                  src={outPhoto} 
                  alt="Punch Out Selfie" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<div style="color:#ef4444;font-size:12px;padding:20px;text-align:center">Photo preview unavailable</div>';
                  }}
                />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  {data.punch_out_time ? 'Photo not provided' : 'Shift still in progress'}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <MapPin size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{data.punch_out_address || (data.punch_out_time ? 'Address logged via GPS' : 'Shift ongoing')}</span>
              </div>
              {data.total_hours !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontWeight: 600, color: '#10b981' }}>
                  <Clock size={14} />
                  <span>Total Shift Hours: {data.total_hours} hrs</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          background: 'rgba(0, 0, 0, 0.2)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button onClick={onClose} className="btn btn-secondary">Close Audit</button>
        </div>
      </div>
    </div>
  );
}
