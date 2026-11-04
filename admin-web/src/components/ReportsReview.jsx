import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Building, 
  Clock, 
  RotateCw, 
  Search, 
  Filter, 
  User, 
  MapPin, 
  Image as ImageIcon, 
  MessageSquare,
  CheckCircle2,
  X
} from 'lucide-react';
import { api } from '../api';

const SCHEME_OPTIONS = [
  'ALL',
  'FD loan',
  'Smart Fee',
  'Real Estate',
  'Jan Samriddhi',
  'Gold loan',
  'Home loan'
];

export default function ReportsReview() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedScheme, setSelectedScheme] = useState('ALL');
  const [expandedNotes, setExpandedNotes] = useState({});
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [remarkModalReport, setRemarkModalReport] = useState(null);
  const [adminRemarks, setAdminRemarks] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await api.getAllReports();
      setReports(data.reports || []);
    } catch (err) {
      console.error('Failed to load work reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const toggleNote = (id) => {
    setExpandedNotes((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSaveRemark = async () => {
    if (!remarkModalReport) return;
    setSavingRemark(true);
    try {
      await api.reviewReport(remarkModalReport.id, 'APPROVED', adminRemarks);
      setRemarkModalReport(null);
      setAdminRemarks('');
      await fetchReports();
    } catch (err) {
      alert(err.message || 'Failed to save admin remark');
    } finally {
      setSavingRemark(false);
    }
  };

  const serverUrl = 'http://localhost:5000';
  const getFullUrl = (url) => url ? (url.startsWith('http') ? url : `${serverUrl}${url}`) : null;

  const filtered = reports.filter((r) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = 
      !term ||
      (r.user_name && r.user_name.toLowerCase().includes(term)) ||
      (r.client_name && r.client_name.toLowerCase().includes(term)) ||
      (r.meeting_type && r.meeting_type.toLowerCase().includes(term)) ||
      (r.notes && r.notes.toLowerCase().includes(term)) ||
      (r.scheme && r.scheme.toLowerCase().includes(term));

    const matchesScheme = selectedScheme === 'ALL' || r.scheme === selectedScheme;

    return matchesSearch && matchesScheme;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header & Search Controls */}
      <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileText size={22} color="#818cf8" />
              <span>Work Activity & Client Visit Logs</span>
              <span className="badge badge-success" style={{ fontSize: 11, padding: '3px 8px' }}>
                Directly Synchronized (No Approval Required)
              </span>
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              All client visit logs and discussion notes submitted by team members appear here immediately.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Total Logs: <strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong>
            </span>
            <button 
              onClick={fetchReports} 
              className="btn btn-secondary" 
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              <RotateCw size={14} /> Refresh Logs
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          {/* Search Box */}
          <div style={{
            flex: 1,
            minWidth: 260,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#ffffff',
            border: '1.5px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 14px'
          }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search by Employee, Organization, Purpose, or Notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
                width: '100%',
                outline: 'none',
                fontFamily: 'inherit'
              }}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Scheme Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Filter size={14} /> Scheme:
            </span>
            <select
              value={selectedScheme}
              onChange={(e) => setSelectedScheme(e.target.value)}
              style={{
                background: '#ffffff',
                border: '1.5px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Schemes</option>
              {SCHEME_OPTIONS.filter(s => s !== 'ALL').map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table: One Row per Log */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Name of Employee</th>
              <th style={{ width: '23%' }}>Name of Organization</th>
              <th style={{ width: '20%' }}>Meeting Purpose</th>
              <th style={{ width: '35%' }}>Added Note</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                  Loading activity logs...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                  <FileText size={32} color="#6b7280" style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 600, fontSize: 15 }}>No Work Logs Found</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {searchTerm || selectedScheme !== 'ALL'
                      ? 'No logs matched your search or scheme filter.'
                      : 'No work reports or client visits have been logged yet.'}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((report) => {
                const photoUrl = getFullUrl(report.visit_photo);
                const isExpanded = !!expandedNotes[report.id];
                const noteText = report.notes || '';
                const isLong = noteText.length > 110;

                return (
                  <tr key={report.id} style={{ verticalAlign: 'top' }}>
                    {/* 1st Column: Name of Employee */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <User size={15} color="#818cf8" />
                          <span>{report.user_name || 'Team Member'}</span>
                        </div>
                        <div>
                          <span className={`badge ${report.user_role === 'BUSINESS_MANAGER' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                            {report.user_role === 'BUSINESS_MANAGER' ? 'Manager' : 'Field Rep'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Clock size={12} />
                          <span>
                            {new Date(report.submitted_at).toLocaleString([], {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 2nd Column: Name of Organization */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Building size={16} color="#38bdf8" />
                          <span>{report.client_name}</span>
                        </div>

                        {report.client_address ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 2 }}>
                            <MapPin size={12} color="#9ca3af" style={{ marginTop: 2, flexShrink: 0 }} />
                            <span style={{ wordBreak: 'break-word' }}>{report.client_address}</span>
                          </div>
                        ) : null}
                      </div>
                    </td>

                    {/* 3rd Column: Meeting Purpose */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                        <span className="badge badge-info" style={{ fontSize: 11, fontWeight: 700 }}>
                          {report.meeting_type || 'General Visit'}
                        </span>

                        {report.scheme && (
                          <span style={{
                            background: 'rgba(99, 102, 241, 0.15)',
                            color: '#a5b4fc',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontWeight: 600,
                            fontSize: 12
                          }}>
                            📋 Scheme: {report.scheme}
                          </span>
                        )}

                        <span className="badge badge-success" style={{ fontSize: 10, padding: '1px 6px', opacity: 0.9 }}>
                          ✓ Directly Logged
                        </span>
                      </div>
                    </td>

                    {/* 4th Column: Added Note (Read more / Text wrap) */}
                    <td>
                      <div style={{
                        background: '#f8fafc',
                        borderRadius: 'var(--radius-sm)',
                        padding: '10px 14px',
                        border: '1px solid #e2e8f0'
                      }}>
                        {/* Note text with wrap & read more format */}
                        <div style={{
                          fontSize: 13,
                          color: '#1e293b',
                          lineHeight: 1.55,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}>
                          {isLong && !isExpanded ? (
                            <>
                              "{noteText.slice(0, 110)}..."
                              <button
                                onClick={() => toggleNote(report.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#07b0e3',
                                  fontWeight: 700,
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  marginLeft: 6,
                                  padding: 0
                                }}
                              >
                                Read More ▾
                              </button>
                            </>
                          ) : (
                            <>
                              "{noteText}"
                              {isLong && (
                                <button
                                  onClick={() => toggleNote(report.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#07b0e3',
                                    fontWeight: 700,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    display: 'block',
                                    marginTop: 6,
                                    padding: 0
                                  }}
                                >
                                  Show Less ▴
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        {/* Optional Attached Visit Photo */}
                        {photoUrl && (
                          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              onClick={() => setPreviewPhoto({ url: photoUrl, title: `${report.client_name} - Logged by ${report.user_name}` })}
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: 11, gap: 6 }}
                            >
                              <ImageIcon size={13} color="#07b0e3" />
                              <span>View Attached Photo</span>
                            </button>
                          </div>
                        )}

                        {/* Admin Feedback Remarks (if any exist or button to add remark) */}
                        {report.admin_remarks && (
                          <div style={{
                            marginTop: 8,
                            padding: '6px 10px',
                            borderRadius: 6,
                            background: 'rgba(7, 176, 227, 0.08)',
                            border: '1px solid rgba(7, 176, 227, 0.25)',
                            fontSize: 12
                          }}>
                            <span style={{ fontWeight: 700, color: '#07b0e3' }}>Admin Feedback: </span>
                            <span style={{ color: 'var(--text-secondary)' }}>{report.admin_remarks}</span>
                          </div>
                        )}

                        <div style={{ marginTop: 8, textAlign: 'right' }}>
                          <button
                            onClick={() => {
                              setRemarkModalReport(report);
                              setAdminRemarks(report.admin_remarks || '');
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#07b0e3',
                              fontSize: 11,
                              fontWeight: '600',
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                          >
                            {report.admin_remarks ? 'Edit Feedback Remark' : '+ Add Feedback Remark'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Photo Lightbox Modal */}
      {previewPhoto && (
        <div className="modal-overlay" onClick={() => setPreviewPhoto(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImageIcon size={18} color="#07b0e3" />
                <span>Visit Proof Photo</span>
              </h3>
              <button onClick={() => setPreviewPhoto(null)} className="btn btn-secondary" style={{ padding: '4px 8px' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 20, textAlign: 'center' }}>
              <img
                src={previewPhoto.url}
                alt="Visit Proof"
                style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: 8, objectFit: 'contain', border: '1px solid var(--border-color)' }}
              />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                {previewPhoto.title}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Optional Feedback Remark Modal */}
      {remarkModalReport && (
        <div className="modal-overlay" onClick={() => setRemarkModalReport(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div style={{ padding: 20, borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>Admin Feedback Remark</h3>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Organization: <strong>{remarkModalReport.client_name}</strong> • By {remarkModalReport.user_name}
              </div>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Optional Note / Guidance for Representative:
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. Great client update, make sure to follow up on Tuesday..."
                  value={adminRemarks}
                  onChange={(e) => setAdminRemarks(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1.5px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 12,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  disabled={savingRemark}
                  onClick={handleSaveRemark}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: 10 }}
                >
                  <CheckCircle2 size={16} /> Save Remark
                </button>
                <button 
                  onClick={() => setRemarkModalReport(null)} 
                  className="btn btn-secondary"
                  style={{ padding: '10px 16px' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
