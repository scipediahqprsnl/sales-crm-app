import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, Phone, Mail, Check, AlertCircle } from 'lucide-react';
import { api } from '../api';

export default function TeamManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'FIELD_REPRESENTATIVE',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data.users || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      await api.createUser(formData);
      setShowAddModal(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'FIELD_REPRESENTATIVE',
        phone: '',
      });
      await fetchUsers();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header */}
      <div className="glass-panel" style={{ padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>Staff & RBAC Accounts ({users.length})</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Manage Admins, Business Managers, and Field Representatives
          </div>
        </div>

        <button 
          onClick={() => setShowAddModal(true)} 
          className="btn btn-primary"
          style={{ padding: '8px 16px', fontSize: 13 }}
        >
          <UserPlus size={16} /> Add Employee
        </button>
      </div>

      {/* Staff Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Phone</th>
              <th>Account Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  Loading staff accounts...
                </td>
              </tr>
            ) : (
              users.map((user) => {
                let roleBadge = <span className="badge badge-warning">Field Rep</span>;
                if (user.role === 'ADMIN') {
                  roleBadge = <span className="badge badge-danger">Admin</span>;
                } else if (user.role === 'BUSINESS_MANAGER') {
                  roleBadge = <span className="badge badge-info">Manager</span>;
                }

                return (
                  <tr key={user.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{user.name}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                        <Mail size={13} color="var(--text-muted)" />
                        <span>{user.email}</span>
                      </div>
                    </td>
                    <td>{roleBadge}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                        <Phone size={13} color="var(--text-muted)" />
                        <span>{user.phone || 'N/A'}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div style={{ padding: 20, borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>Add New Employee</h3>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Create login credentials and assign RBAC role
              </div>
            </div>

            <form onSubmit={handleCreateUser} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {errorMsg && (
                <div style={{ padding: 10, borderRadius: 6, background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12 }}>
                  {errorMsg}
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Full Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    color: '#0f172a',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Email Address:</label>
                <input
                  type="email"
                  required
                  placeholder="ramesh@salescrm.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    color: '#0f172a',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Password:</label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    color: '#0f172a',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Role Assignment:</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    color: '#0f172a',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13
                  }}
                >
                  <option value="FIELD_REPRESENTATIVE">Field Representative (Mobile Punch + Visits + Tracking)</option>
                  <option value="BUSINESS_MANAGER">Business Manager (Attendance + Team Oversight + Reports)</option>
                  <option value="ADMIN">System Administrator (Full Command Center Access)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Phone Number:</label>
                <input
                  type="text"
                  placeholder="+91 98765 00000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    color: '#0f172a',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: 10 }}
                >
                  {submitting ? 'Creating...' : 'Create Employee Account'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                  style={{ padding: '10px 16px' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
