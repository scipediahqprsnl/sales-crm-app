import React from 'react';
import { 
  Compass, 
  Users, 
  Camera, 
  Clock, 
  FileCheck2, 
  LogOut, 
  ShieldCheck,
  Radio
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, currentUser, onLogout }) {
  const navItems = [
    { id: 'live', label: 'Live Fleet Map', icon: Radio, liveDot: true },
    { id: 'attendance', label: 'Attendance & Photos', icon: Camera },
    { id: 'timeline', label: 'Day Timeline', icon: Clock },
    { id: 'reports', label: 'Work Reports', icon: FileCheck2 },
    { id: 'team', label: 'Team & Staff', icon: Users },
  ];

  return (
    <header style={{
      background: '#ffffff',
      borderBottom: '1px solid var(--border-color)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      padding: '0 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 68
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #07b0e3 0%, #0284c7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(7, 176, 227, 0.3)'
          }}>
            <Compass size={22} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>SALES-CRM</span>
              <span className="badge badge-info" style={{ fontSize: 10, padding: '2px 6px' }}>v1.0</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Field Force Command Center</div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isActive ? '1px solid rgba(7, 176, 227, 0.4)' : '1px solid transparent',
                  background: isActive ? 'rgba(7, 176, 227, 0.1)' : 'transparent',
                  color: isActive ? '#07b0e3' : 'var(--text-secondary)',
                  transition: 'all 0.2s ease'
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {item.liveDot && <span className="pulsing-dot" style={{ marginLeft: 2 }} />}
              </button>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {currentUser?.name || 'Administrator'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
              <ShieldCheck size={12} color="#10b981" />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                {currentUser?.role?.replace('_', ' ').toLowerCase() || 'Admin'}
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="btn btn-secondary"
            title="Log out"
            style={{ padding: '8px 12px' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
