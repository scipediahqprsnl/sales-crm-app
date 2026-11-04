import React, { useState, useEffect } from 'react';
import { 
  Compass, 
  Lock, 
  Mail, 
  ShieldCheck, 
  ArrowRight,
  Radio,
  Sparkles,
  User,
  Phone,
  Briefcase
} from 'lucide-react';
import Navbar from './components/Navbar';
import LiveFleetMap from './components/LiveFleetMap';
import AttendanceAudit from './components/AttendanceAudit';
import TimelineViewer from './components/TimelineViewer';
import ReportsReview from './components/ReportsReview';
import TeamManagement from './components/TeamManagement';
import PhotoModal from './components/PhotoModal';
import { api, getAuthToken, getCurrentUser, setAuthToken, setCurrentUser, removeAuthToken, removeCurrentUser } from './api';

export default function App() {
  const [currentUser, setCurrentUserState] = useState(getCurrentUser());
  const [activeTab, setActiveTab] = useState('live');
  const [timelineTargetUserId, setTimelineTargetUserId] = useState('');
  const [modalPhotoData, setModalPhotoData] = useState(null);

  // Auth form state
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('BUSINESS_MANAGER'); // 'BUSINESS_MANAGER' | 'FIELD_REPRESENTATIVE'

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setLoginError('');

    try {
      const data = await api.login(email, password);
      setAuthToken(data.token);
      setCurrentUser(data.user);
      setCurrentUserState(data.user);
    } catch (err) {
      setLoginError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword) {
      setLoginError('Please fill in Name, Email, and Password');
      return;
    }
    if (regPassword.length < 4) {
      setLoginError('Password must be at least 4 characters');
      return;
    }

    setLoading(true);
    setLoginError('');

    try {
      const data = await api.register({
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        role: regRole,
        phone: regPhone.trim(),
      });
      setAuthToken(data.token);
      setCurrentUser(data.user);
      setCurrentUserState(data.user);
    } catch (err) {
      setLoginError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    removeAuthToken();
    removeCurrentUser();
    setCurrentUserState(null);
  };

  const handleSelectTimelineUser = (userId) => {
    setTimelineTargetUserId(userId);
    setActiveTab('timeline');
  };

  // If user is not logged in, render Login Portal
  if (!currentUser) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'radial-gradient(circle at 50% 20%, #1e1b4b 0%, #0b0f19 80%)'
      }}>
        <div className="glass-panel" style={{
          maxWidth: 440,
          width: '100%',
          padding: 36,
          boxShadow: 'var(--shadow-lg)'
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #07b0e3 0%, #0284c7 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(7, 176, 227, 0.35)',
              marginBottom: 14
            }}>
              <Compass size={28} color="white" />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>SALES-CRM</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Enterprise Field Force & Attendance Command Portal
            </p>
          </div>

          {/* Auth Mode Switcher */}
          <div style={{
            display: 'flex',
            background: '#f1f5f9',
            padding: 4,
            borderRadius: 'var(--radius-sm)',
            marginBottom: 20,
            border: '1px solid var(--border-color)'
          }}>
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setLoginError(''); }}
              style={{
                flex: 1,
                padding: '9px 12px',
                border: 'none',
                borderRadius: 6,
                background: authMode === 'login' ? 'var(--accent-primary)' : 'transparent',
                color: authMode === 'login' ? '#ffffff' : 'var(--text-muted)',
                fontWeight: authMode === 'login' ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setLoginError(''); }}
              style={{
                flex: 1,
                padding: '9px 12px',
                border: 'none',
                borderRadius: 6,
                background: authMode === 'register' ? 'var(--accent-primary)' : 'transparent',
                color: authMode === 'register' ? '#ffffff' : 'var(--text-muted)',
                fontWeight: authMode === 'register' ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              New Register
            </button>
          </div>

          {loginError && (
            <div style={{
              padding: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger)',
              color: 'var(--danger)',
              fontSize: 13,
              marginBottom: 16
            }}>
              {loginError}
            </div>
          )}

          {authMode === 'login' ? (
            /* --- SIGN IN FORM --- */
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Email Address
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#111827',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px'
                }}>
                  <Mail size={16} color="var(--text-muted)" />
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#111827',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px'
                }}>
                  <Lock size={16} color="var(--text-muted)" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ padding: 12, marginTop: 4, width: '100%' }}
              >
                {loading ? 'Authenticating...' : 'Sign In to Command Center'}
              </button>

              <div style={{ textAlign: 'center', marginTop: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('register')}
                    style={{ background: 'none', border: 'none', color: '#818cf8', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    Register here
                  </button>
                </span>
              </div>
            </form>
          ) : (
            /* --- NEW REGISTER FORM --- */
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Full Name
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#111827',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px'
                }}>
                  <User size={16} color="var(--text-muted)" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Work Email
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#111827',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px'
                }}>
                  <Mail size={16} color="var(--text-muted)" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. rahul@company.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Phone Number (Optional)
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#111827',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px'
                }}>
                  <Phone size={16} color="var(--text-muted)" />
                  <input
                    type="tel"
                    placeholder="e.g. +91 98765 43210"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#111827',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px'
                }}>
                  <Lock size={16} color="var(--text-muted)" />
                  <input
                    type="password"
                    required
                    placeholder="Create a password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  Select Role
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setRegRole('BUSINESS_MANAGER')}
                    style={{
                      padding: '12px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: regRole === 'BUSINESS_MANAGER' ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                      background: regRole === 'BUSINESS_MANAGER' ? 'rgba(99, 102, 241, 0.15)' : '#111827',
                      color: 'white',
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span style={{ fontSize: 20 }}>👔</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: regRole === 'BUSINESS_MANAGER' ? '#a5b4fc' : '#e5e7eb' }}>
                      Manager
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Team & Approvals</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegRole('FIELD_REPRESENTATIVE')}
                    style={{
                      padding: '12px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: regRole === 'FIELD_REPRESENTATIVE' ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                      background: regRole === 'FIELD_REPRESENTATIVE' ? 'rgba(99, 102, 241, 0.15)' : '#111827',
                      color: 'white',
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span style={{ fontSize: 20 }}>🏃</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: regRole === 'FIELD_REPRESENTATIVE' ? '#a5b4fc' : '#e5e7eb' }}>
                      Field Rep
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>GPS & Visits</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ padding: 12, marginTop: 4, width: '100%' }}
              >
                {loading ? 'Creating Account...' : 'Register & Enter Portal'}
              </button>

              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
                    style={{ background: 'none', border: 'none', color: '#818cf8', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    Sign In
                  </button>
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Authenticated Dashboard Layout
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        currentUser={currentUser} 
        onLogout={handleLogout} 
      />

      <main style={{ maxWidth: 1400, margin: '0 auto', width: '100%', padding: '24px 24px 60px' }}>
        {activeTab === 'live' && (
          <LiveFleetMap 
            onViewPhotos={(data) => setModalPhotoData(data)} 
            onSelectTimelineUser={handleSelectTimelineUser} 
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceAudit 
            onViewPhotos={(data) => setModalPhotoData(data)} 
          />
        )}

        {activeTab === 'timeline' && (
          <TimelineViewer 
            initialUserId={timelineTargetUserId} 
            onViewPhotos={(data) => setModalPhotoData(data)} 
          />
        )}

        {activeTab === 'reports' && (
          <ReportsReview />
        )}

        {activeTab === 'team' && (
          <TeamManagement />
        )}
      </main>

      {/* Shared Selfie Photo Audit Lightbox */}
      {modalPhotoData && (
        <PhotoModal 
          data={modalPhotoData} 
          onClose={() => setModalPhotoData(null)} 
        />
      )}
    </div>
  );
}
