import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { api } from '../api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MonthlyCalendarModal({ user, onClose }) {
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState({
    year: today.getFullYear(),
    month: today.getMonth()
  });
  const [attendances, setAttendances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(today.toISOString().split('T')[0]);

  const userId = user?.user_id || user?.id;
  const userName = user?.user_name || user?.name || 'Employee';
  const userRole = user?.user_role || user?.role || 'FIELD_REPRESENTATIVE';

  const fetchMonthlyData = async (year, month) => {
    if (!userId) return;
    setLoading(true);
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const res = await api.getMonthlyAttendance(monthStr, userId);
      setAttendances(res.attendances || []);
    } catch (err) {
      console.error('Failed to load monthly attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlyData(selectedMonth.year, selectedMonth.month);
  }, [userId, selectedMonth.year, selectedMonth.month]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePrevMonth = () => {
    setSelectedMonth(prev => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setSelectedMonth(prev => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    setSelectedMonth({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDate(now.toISOString().split('T')[0]);
  };

  // Build map of attendances by date
  const recordsByDate = {};
  attendances.forEach(rec => {
    if (rec.date) recordsByDate[rec.date] = rec;
  });

  const daysInMonth = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(selectedMonth.year, selectedMonth.month, 1).getDay(); // 0 = Sun
  const leadOffset = (firstDayOfWeek + 6) % 7; // Mon = 0, Sun = 6
  const todayStr = today.toISOString().split('T')[0];

  const getDayStatus = (dayNum) => {
    const dateStr = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const record = recordsByDate[dateStr];
    const dateObj = new Date(selectedMonth.year, selectedMonth.month, dayNum);
    const dayOfWeek = dateObj.getDay();
    const isSunday = (dayOfWeek === 0);

    const isToday = (dateStr === todayStr);
    const isPast = (dateStr < todayStr);
    const isFuture = (dateStr > todayStr);

    if (record) {
      if (record.punch_in_time && record.punch_out_time) {
        return {
          type: 'COMPLETE',
          label: 'Complete Shift (In & Out Done)',
          circleColor: '#10b981',
          textColor: '#ffffff',
          record,
          dateStr
        };
      }
      if (isToday && record.punch_in_time && !record.punch_out_time) {
        return {
          type: 'ACTIVE',
          label: 'Active On Duty',
          circleColor: '#0284c7',
          textColor: '#ffffff',
          record,
          dateStr
        };
      }
      if (isPast && record.punch_in_time && !record.punch_out_time) {
        return {
          type: 'INCOMPLETE',
          label: 'Incomplete (No Punch Out)',
          circleColor: '#ef4444',
          textColor: '#ffffff',
          record,
          dateStr
        };
      }
    }

    if (isPast) {
      if (isSunday) {
        return {
          type: 'OFF',
          label: 'Sunday (Weekly Off)',
          circleColor: '#f1f5f9',
          textColor: '#94a3b8',
          isSunday: true,
          record: null,
          dateStr
        };
      }
      return {
        type: 'LEAVE',
        label: 'Leave / Absent',
        circleColor: '#ef4444',
        textColor: '#ffffff',
        record: null,
        dateStr
      };
    }

    if (isToday) {
      return {
        type: 'TODAY_WAITING',
        label: 'Today (Not Punched Yet)',
        circleColor: '#e0f2fe',
        textColor: '#0284c7',
        isTodayWaiting: true,
        record: null,
        dateStr
      };
    }

    return {
      type: 'FUTURE',
      label: 'Upcoming Day',
      circleColor: 'transparent',
      textColor: '#94a3b8',
      record: null,
      dateStr
    };
  };

  // Compute stats
  let completeCount = 0;
  let activeCount = 0;
  let leaveCount = 0;
  let totalHours = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const st = getDayStatus(d);
    if (st.type === 'COMPLETE') {
      completeCount++;
      if (st.record && st.record.total_hours) {
        totalHours += parseFloat(st.record.total_hours) || 0;
      }
    } else if (st.type === 'ACTIVE') {
      activeCount++;
    } else if (st.type === 'LEAVE' || st.type === 'INCOMPLETE') {
      leaveCount++;
    }
  }

  const formatTime = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return isoString;
    }
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  const selectedDayNum = selectedDate ? parseInt(selectedDate.split('-')[2], 10) : null;
  const selectedStatus = selectedDayNum ? getDayStatus(selectedDayNum) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        style={{ maxWidth: 780, width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
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
            <h3 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Calendar size={18} color="#07b0e3" />
              <span>Monthly Attendance Calendar</span>
              <span className={`badge ${userRole === 'BUSINESS_MANAGER' ? 'badge-info' : 'badge-warning'}`}>
                {userRole === 'BUSINESS_MANAGER' ? 'Manager' : 'Field Rep'}
              </span>
            </h3>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              Employee: <strong style={{ color: 'var(--text-primary)' }}>{userName}</strong>
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

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Month Navigation Bar */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            background: '#ffffff',
            padding: '12px 18px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <button 
              onClick={handlePrevMonth}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: 18, fontWeight: 700 }}
            >
              <ChevronLeft size={18} />
            </button>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                {MONTH_NAMES[selectedMonth.month]} {selectedMonth.year}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Monthly Attendance & Shift Summary
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(selectedMonth.month !== today.getMonth() || selectedMonth.year !== today.getFullYear()) && (
                <button
                  onClick={handleCurrentMonth}
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', fontSize: 11, color: '#0284c7' }}
                >
                  Today
                </button>
              )}
              <button 
                onClick={handleNextMonth}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: 18, fontWeight: 700 }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* 4 Stats Counters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {/* 🟢 Complete */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderLeft: '4px solid #10b981',
              borderRadius: 10,
              padding: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Complete</span>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#047857', margin: '4px 0' }}>{completeCount}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>Punch In & Out Done</div>
            </div>

            {/* 🔵 Active Today */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderLeft: '4px solid #0284c7',
              borderRadius: 10,
              padding: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Active Today</span>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0284c7' }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0369a1', margin: '4px 0' }}>{activeCount}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>Currently On Duty</div>
            </div>

            {/* 🔴 Leave / Incomplete */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderLeft: '4px solid #ef4444',
              borderRadius: 10,
              padding: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Leave / Missed</span>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#b91c1c', margin: '4px 0' }}>{leaveCount}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>Incomplete / Absent</div>
            </div>

            {/* ⏱️ Total Hours */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderLeft: '4px solid #8b5cf6',
              borderRadius: 10,
              padding: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Hours</span>
                <Clock size={12} color="#8b5cf6" />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#6d28d9', margin: '4px 0' }}>{totalHours.toFixed(1)}h</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>Total Shift Hours</div>
            </div>
          </div>

          {/* Calendar Grid Container */}
          <div style={{
            background: '#ffffff',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: 18
          }}>
            {/* Legend */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              paddingBottom: 12,
              marginBottom: 12,
              borderBottom: '1px solid #f1f5f9',
              fontSize: 12,
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
                <span>🟢 Complete (Punch In & Out)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0284c7' }} />
                <span>🔵 Active (Today)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                <span>🔴 Leave / Incomplete</span>
              </div>
            </div>

            {/* Weekday Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 8 }}>
              {WEEKDAYS.map((wd, i) => (
                <div key={wd} style={{ fontSize: 12, fontWeight: 700, color: i === 6 ? '#ef4444' : '#64748b' }}>
                  {wd}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {/* Empty leading cells */}
              {Array.from({ length: leadOffset }).map((_, idx) => (
                <div key={`lead-${idx}`} style={{ height: 42 }} />
              ))}

              {/* Month Days */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const status = getDayStatus(dayNum);
                const isSelected = selectedDate === status.dateStr;

                return (
                  <div
                    key={`day-${dayNum}`}
                    onClick={() => setSelectedDate(status.dateStr)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 42,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      backgroundColor: status.circleColor,
                      color: status.textColor,
                      border: isSelected 
                        ? '2.5px solid #0f172a' 
                        : (status.isTodayWaiting ? '2px dashed #0284c7' : '1px solid transparent'),
                      boxShadow: (status.type === 'COMPLETE' || status.type === 'ACTIVE' || status.type === 'LEAVE')
                        ? '0 2px 4px rgba(0,0,0,0.1)' 
                        : 'none',
                      transition: 'transform 0.15s ease'
                    }}>
                      {dayNum}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Date Details Card */}
          {selectedStatus && (
            <div style={{
              background: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              borderTop: '3px solid #07b0e3',
              padding: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Day Record Details
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                    {formatDateLabel(selectedStatus.dateStr)}
                  </div>
                </div>

                <span className={`badge ${
                  selectedStatus.type === 'COMPLETE' ? 'badge-success' :
                  selectedStatus.type === 'ACTIVE' ? 'badge-info' :
                  (selectedStatus.type === 'LEAVE' || selectedStatus.type === 'INCOMPLETE') ? 'badge-danger' : 'badge-neutral'
                }`}>
                  {selectedStatus.label}
                </span>
              </div>

              {selectedStatus.record ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>🟢 PUNCH IN</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                      {formatTime(selectedStatus.record.punch_in_time)}
                    </div>
                    {selectedStatus.record.punch_in_address && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={12} color="#07b0e3" /> {selectedStatus.record.punch_in_address}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>🏁 PUNCH OUT</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                      {selectedStatus.record.punch_out_time ? formatTime(selectedStatus.record.punch_out_time) : (selectedStatus.type === 'ACTIVE' ? 'Shift In Progress...' : 'Missing Punch Out')}
                    </div>
                    {selectedStatus.record.punch_out_address && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={12} color="#ef4444" /> {selectedStatus.record.punch_out_address}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>⏱️ TOTAL WORKED</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#047857' }}>
                      {selectedStatus.record.total_hours != null ? `${selectedStatus.record.total_hours} hrs` : '—'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {selectedStatus.type === 'LEAVE' && 'No attendance was logged on this working day (Marked as Leave).'}
                  {selectedStatus.type === 'OFF' && 'Sunday - Weekend off.'}
                  {selectedStatus.type === 'TODAY_WAITING' && 'Shift not yet started for today.'}
                  {selectedStatus.type === 'FUTURE' && 'Upcoming day in the month.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

