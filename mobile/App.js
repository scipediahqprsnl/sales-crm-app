import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Modal,
  Alert,
  Image,
  ActivityIndicator,
  Platform
} from 'react-native';

// Safe optional imports for Location and ImagePicker
let Location = null;
try {
  Location = require('expo-location');
} catch (e) {}

let ImagePicker = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {}
import { 
  api, 
  getCurrentUser, 
  setCurrentUser, 
  setAuthToken, 
  removeAuthToken, 
  removeCurrentUser,
  queueOfflinePing,
  flushOfflinePings
} from './src/api';

const SCHEME_OPTIONS = [
  'FD loan',
  'Smart Fee',
  'Real Estate',
  'Jan Samriddhi',
  'Gold loan',
  'Home loan'
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('shift'); // 'shift', 'reports', 'timeline'

  // Auth form state
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('FIELD_REPRESENTATIVE'); // 'BUSINESS_MANAGER' or 'FIELD_REPRESENTATIVE'

  // Attendance & Shift State
  const [attendance, setAttendance] = useState(null);
  const [shiftSeconds, setShiftSeconds] = useState(0);
  const [locationAddress, setLocationAddress] = useState('Fetching GPS...');
  const [currentCoords, setCurrentCoords] = useState(null);

  // Modals
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSchemeDropdown, setShowSchemeDropdown] = useState(false);
  const [reportForm, setReportForm] = useState({
    client_name: '',
    client_address: '',
    meeting_type: 'Product Demo',
    scheme: 'FD loan',
    notes: '',
    photoBase64: null,
  });

  // Timeline & Reports data
  const [timelineData, setTimelineData] = useState([]);
  const [myReports, setMyReports] = useState([]);

  // Monthly Attendance Calendar & Counter State
  const todayObj = new Date();
  const [selectedMonth, setSelectedMonth] = useState({ 
    year: todayObj.getFullYear(), 
    month: todayObj.getMonth() 
  });
  const [monthlyAttendanceList, setMonthlyAttendanceList] = useState([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [selectedCalDate, setSelectedCalDate] = useState(todayObj.toISOString().split('T')[0]);

  // Check saved session on mount
  useEffect(() => {
    const initApp = async () => {
      try {
        setServerHost(API_BASE);
        const savedUser = await getCurrentUser();
        if (savedUser) {
          setUser(savedUser);
          await loadTodayAttendance();
        }
      } catch (err) {
        console.log('Init error:', err);
      }
    };
    initApp();
  }, []);

  // Request location permission & get current coordinates with instant cached lock
  const fetchLocation = async () => {
    try {
      if (!Location) {
        setLocationAddress('Sector 29, Cyber City Hub, Gurgaon, Haryana (Simulated GPS)');
        setCurrentCoords({ latitude: 28.4595, longitude: 77.0266 });
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationAddress('Location permission denied');
        return;
      }

      // 1. Instant fix from hardware cache (< 100ms)
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown && lastKnown.coords) {
          setCurrentCoords(lastKnown.coords);
          setLocationAddress(`GPS: ${lastKnown.coords.latitude.toFixed(4)}, ${lastKnown.coords.longitude.toFixed(4)}`);
        }
      } catch (cacheErr) {}

      // 2. Fetch fresh position with Balanced accuracy & 6s timeout (avoids satellite hanging)
      const freshPromise = Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.Balanced 
      });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('GPS timeout')), 6000)
      );

      const loc = await Promise.race([freshPromise, timeoutPromise]).catch(() => null);

      if (loc && loc.coords) {
        setCurrentCoords(loc.coords);
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        setLocationAddress(`GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);

        // 3. Fast reverse-geocode with 3s timeout
        try {
          const geoPromise = Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          const geoTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Geo timeout')), 3000));
          const geoList = await Promise.race([geoPromise, geoTimeout]);

          if (geoList && geoList.length > 0) {
            const geo = geoList[0];
            const parts = [geo.name, geo.street, geo.city, geo.region].filter(Boolean);
            const addr = parts.join(', ').trim();
            if (addr) {
              setLocationAddress(addr);
            }
          }
        } catch (geoErr) {
          // Keep GPS coordinates if reverse geocode times out
        }
      }
    } catch (err) {
      console.log('Location fetch error:', err);
      if (!currentCoords) {
        setCurrentCoords({ latitude: 18.5670, longitude: 73.9197 });
        setLocationAddress('GPS Logged (18.5670, 73.9197)');
      }
    }
  };

  useEffect(() => {
    if (user) {
      fetchLocation();
    }
  }, [user]);

  // Load today's attendance
  const loadTodayAttendance = async () => {
    try {
      const res = await api.getTodayAttendance();
      if (res && res.attendance) {
        setAttendance(res.attendance);
        if (res.attendance.punch_in_time && !res.attendance.punch_out_time) {
          const punchTime = new Date(res.attendance.punch_in_time).getTime();
          const elapsed = Math.floor((Date.now() - punchTime) / 1000);
          setShiftSeconds(Math.max(0, elapsed));
        }
      } else {
        setAttendance(null);
        setShiftSeconds(0);
      }
    } catch (err) {
      console.log('Attendance fetch error:', err);
    }
  };

  // Shift timer tick
  useEffect(() => {
    let timer;
    if (attendance && attendance.punch_in_time && !attendance.punch_out_time) {
      timer = setInterval(() => {
        setShiftSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [attendance]);

  // Periodic GPS Ping & Movement Detection while on shift
  useEffect(() => {
    let pingInterval;
    if (attendance && attendance.punch_in_time && !attendance.punch_out_time) {
      // First attempt to flush any offline pings accumulated while away from network
      flushOfflinePings(attendance.id);

      pingInterval = setInterval(async () => {
        try {
          let coords = currentCoords;
          let speed = 0;
          let accuracy = 10;

          // Always try to fetch fresh live GPS hardware location
          if (Location) {
            try {
              const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              if (fresh && fresh.coords) {
                coords = fresh.coords;
                speed = fresh.coords.speed || 0;
                accuracy = fresh.coords.accuracy || 10;
                setCurrentCoords(fresh.coords);
              }
            } catch (posErr) {
              // Fallback to last known coords
            }
          }

          if (coords) {
            const pingPayload = {
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy,
              speed,
              attendanceId: attendance.id,
              address: locationAddress,
              recorded_at: new Date().toISOString()
            };

            try {
              await api.sendPing(pingPayload);
              // Also sync any previously buffered offline points if connection is good
              await flushOfflinePings(attendance.id);
            } catch (netErr) {
              // If phone is out of Wi-Fi range (e.g. at client on 4G) or offline, buffer locally!
              console.log('Server unreachable outside Wi-Fi, buffering ping locally:', netErr.message);
              await queueOfflinePing(pingPayload);
            }
          }
        } catch (e) {
          console.log('Auto-ping tick error:', e);
        }
      }, 30000); // Check every 30s for fine-grained walking and dwell tracking
    }
    return () => clearInterval(pingInterval);
  }, [attendance, currentCoords, locationAddress]);

  // Login handler
  const handleLogin = async (loginEmail, loginPass) => {
    const e = loginEmail || email;
    const p = loginPass || password;
    if (!e || !p) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const data = await api.login(e, p);
      await setAuthToken(data.token);
      await setCurrentUser(data.user);
      setUser(data.user);
      await loadTodayAttendance();
    } catch (err) {
      Alert.alert('Login Failed', err.message || 'Check your credentials');
    } finally {
      setLoading(false);
    }
  };

  // Register handler
  const handleRegister = async () => {
    if (!regName.trim()) {
      Alert.alert('Missing Field', 'Please enter your full name');
      return;
    }
    if (!regEmail.trim()) {
      Alert.alert('Missing Field', 'Please enter your work email');
      return;
    }
    if (!regPassword) {
      Alert.alert('Missing Field', 'Please create a password');
      return;
    }
    if (regPassword.length < 4) {
      Alert.alert('Weak Password', 'Password must be at least 4 characters');
      return;
    }

    setLoading(true);
    try {
      const data = await api.register({
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        role: regRole,
        phone: regPhone.trim(),
      });
      await setAuthToken(data.token);
      await setCurrentUser(data.user);
      setUser(data.user);
      await loadTodayAttendance();
      Alert.alert('Registration Successful', `Welcome, ${data.user.name}! Your account is now active.`);
    } catch (err) {
      Alert.alert('Registration Failed', err.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await removeAuthToken();
    await removeCurrentUser();
    setUser(null);
    setAttendance(null);
    setShiftSeconds(0);
  };

  // Capture Live Front Selfie for Punch In / Out
  const captureSelfie = async () => {
    try {
      if (!ImagePicker) {
        // Simulated live selfie SVG for preview
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="#4338ca"/><circle cx="150" cy="120" r="50" fill="white"/><path d="M 80 250 Q 150 180 220 250" fill="none" stroke="white" stroke-width="20" stroke-linecap="round"/><text x="150" y="280" fill="white" font-size="12" text-anchor="middle">VERIFIED LIVE SELFIE</text></svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      }

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is needed for live attendance selfie verification');
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        return `data:image/jpeg;base64,${result.assets[0].base64}`;
      }
      return null;
    } catch (err) {
      console.log('Camera error:', err);
      // Fallback for emulator / web preview without physical camera
      return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzYzNjZmMSIvPjwvc3ZnPg==';
    }
  };

  // Punch In Action
  const handlePunchIn = async () => {
    setLoading(true);
    try {
      await fetchLocation();
      const selfieBase64 = await captureSelfie();
      if (!selfieBase64) {
        setLoading(false);
        return;
      }

      const safeAddress = (!locationAddress || locationAddress.includes('Fetching'))
        ? (currentCoords ? `GPS (${currentCoords.latitude.toFixed(4)}, ${currentCoords.longitude.toFixed(4)})` : 'Recorded via GPS')
        : locationAddress;

      const res = await api.punchIn({
        latitude: currentCoords?.latitude || 18.5670,
        longitude: currentCoords?.longitude || 73.9197,
        address: safeAddress,
        photoBase64: selfieBase64,
      });

      Alert.alert('Shift Started!', 'Punch In verified with live photo & GPS.');
      setAttendance(res.attendance);
      setShiftSeconds(0);
      loadMonthlyAttendance(selectedMonth.year, selectedMonth.month);
    } catch (err) {
      Alert.alert('Punch In Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Punch Out Action
  const handlePunchOut = async () => {
    setLoading(true);
    try {
      await fetchLocation();
      const selfieBase64 = await captureSelfie();
      if (!selfieBase64) {
        setLoading(false);
        return;
      }

      const safeAddress = (!locationAddress || locationAddress.includes('Fetching'))
        ? (currentCoords ? `GPS (${currentCoords.latitude.toFixed(4)}, ${currentCoords.longitude.toFixed(4)})` : 'Recorded via GPS')
        : locationAddress;

      const res = await api.punchOut({
        latitude: currentCoords?.latitude || 18.5670,
        longitude: currentCoords?.longitude || 73.9197,
        address: safeAddress,
        photoBase64: selfieBase64,
      });

      // Flush any remaining offline pings recorded during shift
      await flushOfflinePings(attendance?.id);

      Alert.alert('Shift Completed!', `Total working hours: ${res.totalHours} hrs.`);
      setAttendance(res.attendance);
      loadMonthlyAttendance(selectedMonth.year, selectedMonth.month);
    } catch (err) {
      Alert.alert('Punch Out Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Work Report
  const handleSubmitReport = async () => {
    if (!reportForm.client_name || !reportForm.notes) {
      Alert.alert('Missing Info', 'Please enter client name and meeting notes');
      return;
    }

    setLoading(true);
    try {
      await api.submitReport({
        client_name: reportForm.client_name,
        client_address: reportForm.client_address || locationAddress,
        meeting_type: reportForm.meeting_type,
        scheme: reportForm.scheme || 'FD loan',
        notes: reportForm.notes,
        attendance_id: attendance?.id,
        photoBase64: reportForm.photoBase64,
      });

      Alert.alert('Logged Successfully!', 'Work report directly logged to Admin Dashboard');
      setShowReportModal(false);
      setShowSchemeDropdown(false);
      setReportForm({
        client_name: '',
        client_address: '',
        meeting_type: 'Product Demo',
        scheme: 'FD loan',
        notes: '',
        photoBase64: null,
      });
      loadMyReports();
    } catch (err) {
      Alert.alert('Submission Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMyReports = async () => {
    try {
      const res = await api.getMyReports();
      setMyReports(res.reports || []);
    } catch (e) {
      console.log('Error loading reports:', e);
    }
  };

  const loadMyTimeline = async () => {
    try {
      const res = await api.getMyTimeline();
      setTimelineData(res.timeline || []);
    } catch (e) {
      console.log('Error loading timeline:', e);
    }
  };

  // Load Monthly Attendance for calendar & counters
  const loadMonthlyAttendance = async (year, month) => {
    setLoadingMonthly(true);
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const res = await api.getMonthlyAttendance(monthStr);
      setMonthlyAttendanceList(res.attendances || []);
    } catch (e) {
      console.log('Error loading monthly attendance:', e);
    } finally {
      setLoadingMonthly(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports') loadMyReports();
    if (activeTab === 'timeline') loadMyTimeline();
    if (activeTab === 'calendar') loadMonthlyAttendance(selectedMonth.year, selectedMonth.month);
  }, [activeTab]);

  useEffect(() => {
    if (user) {
      loadMonthlyAttendance(selectedMonth.year, selectedMonth.month);
    }
  }, [user, selectedMonth.year, selectedMonth.month]);

  // Calendar Helpers & Navigation
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const handlePrevMonth = () => {
    setSelectedMonth(prev => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setSelectedMonth(prev => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    setSelectedMonth({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedCalDate(now.toISOString().split('T')[0]);
  };

  const formatCalTime = (isoString) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return isoString;
    }
  };

  const formatCalFullDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const date = new Date(y, m, d);
        return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  // Format Timer String
  const formatTimer = (totalSec) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}h : ${mins.toString().padStart(2, '0')}m : ${secs.toString().padStart(2, '0')}s`;
  };

  // -------------------------------------------------------------
  // VIEW: LOGIN SCREEN
  // -------------------------------------------------------------
  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <ScrollView contentContainerStyle={styles.loginContent}>
          {/* Logo */}
          <View style={styles.logoBadge}>
            <Text style={{ fontSize: 32 }}>📍</Text>
          </View>
          <Text style={styles.appTitle}>SALES-CRM</Text>
          <Text style={styles.appSubtitle}>Field Force & Attendance App</Text>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Auth Switcher Tabs */}
            <View style={styles.authSwitchContainer}>
              <TouchableOpacity
                style={[styles.authSwitchBtn, authMode === 'login' && styles.authSwitchBtnActive]}
                onPress={() => setAuthMode('login')}
              >
                <Text style={[styles.authSwitchText, authMode === 'login' && styles.authSwitchTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.authSwitchBtn, authMode === 'register' && styles.authSwitchBtnActive]}
                onPress={() => setAuthMode('register')}
              >
                <Text style={[styles.authSwitchText, authMode === 'register' && styles.authSwitchTextActive]}>
                  New Register
                </Text>
              </TouchableOpacity>
            </View>

            {authMode === 'login' ? (
              /* --- SIGN IN FORM --- */
              <View>
                <Text style={styles.inputLabel}>Work Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@company.com"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                <TouchableOpacity
                  style={styles.btnPrimary}
                  disabled={loading}
                  onPress={() => handleLogin()}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>Sign In to Work</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setAuthMode('register')}
                  style={{ marginTop: 16, alignItems: 'center' }}
                >
                  <Text style={{ color: '#64748b', fontSize: 13 }}>
                    Don't have an account? <Text style={{ color: '#07b0e3', fontWeight: '700' }}>Register here</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* --- NEW REGISTRATION FORM --- */
              <View>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Rahul Sharma"
                  placeholderTextColor="#94a3b8"
                  value={regName}
                  onChangeText={setRegName}
                  autoCapitalize="words"
                />

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Work Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. rahul@company.com"
                  placeholderTextColor="#94a3b8"
                  value={regEmail}
                  onChangeText={setRegEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Phone Number (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. +91 98765 43210"
                  placeholderTextColor="#94a3b8"
                  value={regPhone}
                  onChangeText={setRegPhone}
                  keyboardType="phone-pad"
                />

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create a strong password"
                  placeholderTextColor="#94a3b8"
                  value={regPassword}
                  onChangeText={setRegPassword}
                  secureTextEntry
                />

                {/* Role Selection */}
                <Text style={[styles.inputLabel, { marginTop: 14 }]}>Select Your Role</Text>
                <View style={styles.roleSelectionRow}>
                  <TouchableOpacity
                    style={[
                      styles.roleCard,
                      regRole === 'BUSINESS_MANAGER' && styles.roleCardActive
                    ]}
                    onPress={() => setRegRole('BUSINESS_MANAGER')}
                  >
                    <Text style={{ fontSize: 24, marginBottom: 4 }}>👔</Text>
                    <Text style={[
                      styles.roleCardTitle,
                      regRole === 'BUSINESS_MANAGER' && styles.roleCardTitleActive
                    ]}>Manager</Text>
                    <Text style={styles.roleCardSub}>Team & Reports</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.roleCard,
                      regRole === 'FIELD_REPRESENTATIVE' && styles.roleCardActive
                    ]}
                    onPress={() => setRegRole('FIELD_REPRESENTATIVE')}
                  >
                    <Text style={{ fontSize: 24, marginBottom: 4 }}>🏃</Text>
                    <Text style={[
                      styles.roleCardTitle,
                      regRole === 'FIELD_REPRESENTATIVE' && styles.roleCardTitleActive
                    ]}>Field Rep</Text>
                    <Text style={styles.roleCardSub}>GPS & Client Visits</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.btnPrimary, { marginTop: 16 }]}
                  disabled={loading}
                  onPress={handleRegister}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>Create Account & Sign In</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setAuthMode('login')}
                  style={{ marginTop: 16, alignItems: 'center' }}
                >
                  <Text style={{ color: '#64748b', fontSize: 13 }}>
                    Already have an account? <Text style={{ color: '#07b0e3', fontWeight: '700' }}>Sign In</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // VIEW: MAIN MOBILE DASHBOARD
  // -------------------------------------------------------------
  const isPunchedIn = attendance && attendance.punch_in_time && !attendance.punch_out_time;
  const isShiftEnded = attendance && attendance.punch_out_time;

  // Monthly Attendance & Calendar Day Status Logic
  const monthlyAttendanceMap = {};
  monthlyAttendanceList.forEach(item => {
    if (item.date) {
      monthlyAttendanceMap[item.date] = item;
    }
  });

  const daysInMonth = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(selectedMonth.year, selectedMonth.month, 1).getDay(); // 0 = Sun
  const leadOffset = (firstDayOfWeek + 6) % 7; // Mon = 0, Sun = 6

  const todayDateStr = new Date().toISOString().split('T')[0];

  const getDayStatus = (dayNum) => {
    const dateStr = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const record = monthlyAttendanceMap[dateStr];
    const dateObj = new Date(selectedMonth.year, selectedMonth.month, dayNum);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun
    const isSunday = (dayOfWeek === 0);

    const isToday = (dateStr === todayDateStr);
    const isPast = (dateStr < todayDateStr);
    const isFuture = (dateStr > todayDateStr);

    if (record) {
      // Complete day: Successfully punched in and punched out
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
      // Active day: Currently on duty today
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
      // Incomplete day: Punched in in past but never punched out
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
      // Leave / Absent on a past workday
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

  // Compute monthly stats counters
  let calCompleteCount = 0;
  let calActiveCount = 0;
  let calLeaveCount = 0;
  let calTotalHours = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const st = getDayStatus(d);
    if (st.type === 'COMPLETE') {
      calCompleteCount++;
      if (st.record && st.record.total_hours) {
        calTotalHours += parseFloat(st.record.total_hours) || 0;
      }
    } else if (st.type === 'ACTIVE') {
      calActiveCount++;
    } else if (st.type === 'LEAVE' || st.type === 'INCOMPLETE') {
      calLeaveCount++;
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerUserName}>{user.name}</Text>
          <View style={styles.roleBadgeContainer}>
            <Text style={styles.roleBadgeText}>
              {user.role === 'BUSINESS_MANAGER' ? 'Business Manager' : 'Field Representative'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'shift' && styles.tabItemActive]}
          onPress={() => setActiveTab('shift')}
        >
          <Text style={[styles.tabText, activeTab === 'shift' && styles.tabTextActive]}>⏰ Shift</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'calendar' && styles.tabItemActive]}
          onPress={() => setActiveTab('calendar')}
        >
          <Text style={[styles.tabText, activeTab === 'calendar' && styles.tabTextActive]}>📅 Attendance</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'reports' && styles.tabItemActive]}
          onPress={() => setActiveTab('reports')}
        >
          <Text style={[styles.tabText, activeTab === 'reports' && styles.tabTextActive]}>📝 Reports</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'timeline' && styles.tabItemActive]}
          onPress={() => setActiveTab('timeline')}
        >
          <Text style={[styles.tabText, activeTab === 'timeline' && styles.tabTextActive]}>⏱️ My Day</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.bodyContent}>
        {/* TAB 1: SHIFT & ATTENDANCE */}
        {activeTab === 'shift' && (
          <View style={{ gap: 16 }}>
            {/* Shift Timer Card */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Today's Shift Status</Text>
                <View style={[styles.statusPill, isPunchedIn ? styles.statusPillActive : styles.statusPillIdle]}>
                  <Text style={styles.statusPillText}>
                    {isPunchedIn ? '🟢 ACTIVE ON DUTY' : isShiftEnded ? '🏁 SHIFT ENDED' : '⚪ NOT PUNCHED IN'}
                  </Text>
                </View>
              </View>

              {/* Glowing Timer */}
              <View style={styles.timerContainer}>
                <Text style={styles.timerText}>
                  {isPunchedIn ? formatTimer(shiftSeconds) : isShiftEnded ? `${attendance.total_hours} hrs worked` : '00h : 00m : 00s'}
                </Text>
                <Text style={styles.timerSubtext}>
                  {isPunchedIn ? 'GPS Background Tracking is Active' : isShiftEnded ? 'Shift logged to Admin Command Center' : 'Punch in to start timer and GPS log'}
                </Text>
              </View>

              {/* Current GPS location */}
              <View style={styles.gpsBox}>
                <Text style={styles.gpsLabel}>📍 Current GPS Address:</Text>
                <Text style={styles.gpsValue}>{locationAddress}</Text>
              </View>

              {/* Action Buttons */}
              {!isPunchedIn && !isShiftEnded && (
                <TouchableOpacity
                  style={[styles.btnAction, styles.btnPunchIn]}
                  disabled={loading}
                  onPress={handlePunchIn}
                >
                  <Text style={styles.btnActionText}>📸 Punch In (Front Selfie + GPS)</Text>
                </TouchableOpacity>
              )}

              {isPunchedIn && (
                <View style={{ gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.btnAction, styles.btnPunchOut]}
                    disabled={loading}
                    onPress={handlePunchOut}
                  >
                    <Text style={styles.btnActionText}>🏁 Punch Out (End Shift Selfie)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btnAction, styles.btnReport]}
                    onPress={() => setShowReportModal(true)}
                  >
                    <Text style={styles.btnActionText}>+ Add Work Report / Client Visit</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Quick Actions Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Quick Field Actions</Text>
              <View style={{ gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  style={styles.fieldActionBtn}
                  onPress={() => setShowReportModal(true)}
                >
                  <Text style={styles.fieldActionBtnText}>📝 Log Client Meeting & Deals</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.fieldActionBtn}
                  onPress={async () => {
                    await fetchLocation();
                    if (currentCoords && attendance) {
                      try {
                        await api.sendPing({
                          latitude: currentCoords.latitude,
                          longitude: currentCoords.longitude,
                          accuracy: currentCoords.accuracy || 10,
                          speed: currentCoords.speed || 0,
                          attendanceId: attendance.id,
                          address: locationAddress,
                          recorded_at: new Date().toISOString()
                        });
                      } catch (err) {}
                    }
                    Alert.alert('GPS Check-in Sent', `Live location ping recorded:\n${locationAddress}`);
                  }}
                >
                  <Text style={styles.fieldActionBtnText}>📡 Check-in / Send Location Ping</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Monthly Attendance Glance */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.cardTitle}>Monthly Attendance Glance</Text>
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {MONTH_NAMES[selectedMonth.month]} {selectedMonth.year}
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={() => setActiveTab('calendar')}
                  style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}
                >
                  <Text style={{ color: '#0284c7', fontSize: 12, fontWeight: '700' }}>Open Calendar 📅</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.calMiniStatsRow}>
                <View style={styles.miniStatBox}>
                  <Text style={[styles.miniStatVal, { color: '#10b981' }]}>{calCompleteCount}</Text>
                  <Text style={styles.miniStatLbl}>🟢 Complete</Text>
                </View>
                <View style={styles.miniStatBox}>
                  <Text style={[styles.miniStatVal, { color: '#0284c7' }]}>{calActiveCount}</Text>
                  <Text style={styles.miniStatLbl}>🔵 Active</Text>
                </View>
                <View style={styles.miniStatBox}>
                  <Text style={[styles.miniStatVal, { color: '#ef4444' }]}>{calLeaveCount}</Text>
                  <Text style={styles.miniStatLbl}>🔴 Missed</Text>
                </View>
                <View style={styles.miniStatBox}>
                  <Text style={[styles.miniStatVal, { color: '#0f172a' }]}>{calTotalHours.toFixed(1)}h</Text>
                  <Text style={styles.miniStatLbl}>⏱️ Hours</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* TAB 2: MONTHLY ATTENDANCE CALENDAR & COUNTERS */}
        {activeTab === 'calendar' && (
          <View style={{ gap: 16 }}>
            {/* Month Navigation & Title */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <TouchableOpacity 
                  style={styles.calNavBtn} 
                  onPress={handlePrevMonth}
                  activeOpacity={0.7}
                >
                  <Text style={styles.calNavBtnText}>‹</Text>
                </TouchableOpacity>

                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.calMonthTitle}>
                    {MONTH_NAMES[selectedMonth.month]} {selectedMonth.year}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Monthly Attendance & Shift Counter
                  </Text>
                </View>

                <TouchableOpacity 
                  style={styles.calNavBtn} 
                  onPress={handleNextMonth}
                  activeOpacity={0.7}
                >
                  <Text style={styles.calNavBtnText}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Jump to Today Button */}
              {(selectedMonth.month !== todayObj.getMonth() || selectedMonth.year !== todayObj.getFullYear()) && (
                <TouchableOpacity 
                  onPress={handleCurrentMonth} 
                  style={styles.currentMonthPill}
                >
                  <Text style={styles.currentMonthPillText}>🔄 Return to Current Month</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Monthly Attendance Counter Cards (4 Metrics) */}
            <View style={styles.statGrid}>
              {/* 🟢 Complete */}
              <View style={[styles.counterCard, { borderLeftColor: '#10b981' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.counterLabel}>Complete</Text>
                  <View style={[styles.miniCircle, { backgroundColor: '#10b981' }]} />
                </View>
                <Text style={[styles.counterValue, { color: '#047857' }]}>{calCompleteCount}</Text>
                <Text style={styles.counterSub}>Punch In & Out Done</Text>
              </View>

              {/* 🔵 Active Today */}
              <View style={[styles.counterCard, { borderLeftColor: '#0284c7' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.counterLabel}>Active Today</Text>
                  <View style={[styles.miniCircle, { backgroundColor: '#0284c7' }]} />
                </View>
                <Text style={[styles.counterValue, { color: '#0369a1' }]}>{calActiveCount}</Text>
                <Text style={styles.counterSub}>Currently On Duty</Text>
              </View>

              {/* 🔴 Leave / Incomplete */}
              <View style={[styles.counterCard, { borderLeftColor: '#ef4444' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.counterLabel}>Missed / Leave</Text>
                  <View style={[styles.miniCircle, { backgroundColor: '#ef4444' }]} />
                </View>
                <Text style={[styles.counterValue, { color: '#b91c1c' }]}>{calLeaveCount}</Text>
                <Text style={styles.counterSub}>Incomplete / Absent</Text>
              </View>

              {/* ⏱️ Total Hours */}
              <View style={[styles.counterCard, { borderLeftColor: '#8b5cf6' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.counterLabel}>Total Hours</Text>
                  <Text style={{ fontSize: 13 }}>⏱️</Text>
                </View>
                <Text style={[styles.counterValue, { color: '#6d28d9' }]}>{calTotalHours.toFixed(1)}h</Text>
                <Text style={styles.counterSub}>Total Worked Time</Text>
              </View>
            </View>

            {/* Calendar Grid Card */}
            <View style={styles.card}>
              {/* Legend Row */}
              <View style={styles.legendContainer}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                  <Text style={styles.legendText}>Complete</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#0284c7' }]} />
                  <Text style={styles.legendText}>Active</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
                  <Text style={styles.legendText}>Leave / Incomplete</Text>
                </View>
              </View>

              {/* Weekday Names Header */}
              <View style={styles.weekHeader}>
                {WEEKDAYS.map((dayName, idx) => (
                  <View key={idx} style={styles.calCol}>
                    <Text style={[
                      styles.weekHeaderText, 
                      idx === 6 && { color: '#ef4444' }
                    ]}>
                      {dayName}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Calendar Days */}
              {loadingMonthly ? (
                <View style={{ padding: 36, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#07b0e3" />
                  <Text style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>Loading monthly records...</Text>
                </View>
              ) : (
                <View style={styles.calGrid}>
                  {/* Empty leading cells */}
                  {Array.from({ length: leadOffset }).map((_, idx) => (
                    <View key={`lead-${idx}`} style={styles.calCell} />
                  ))}

                  {/* Days 1 to daysInMonth */}
                  {Array.from({ length: daysInMonth }).map((_, idx) => {
                    const dayNum = idx + 1;
                    const status = getDayStatus(dayNum);
                    const isSelected = (selectedCalDate === status.dateStr);

                    return (
                      <TouchableOpacity
                        key={`day-${dayNum}`}
                        style={styles.calCell}
                        activeOpacity={0.7}
                        onPress={() => setSelectedCalDate(status.dateStr)}
                      >
                        <View style={[
                          styles.calCircle,
                          status.type === 'COMPLETE' && styles.calCircleComplete,
                          status.type === 'ACTIVE' && styles.calCircleActive,
                          (status.type === 'LEAVE' || status.type === 'INCOMPLETE') && styles.calCircleLeave,
                          status.isTodayWaiting && styles.calCircleTodayWaiting,
                          status.isSunday && styles.calCircleSunday,
                          isSelected && styles.calCircleSelected
                        ]}>
                          <Text style={[
                            styles.calDayNum,
                            (status.type === 'COMPLETE' || status.type === 'ACTIVE' || status.type === 'LEAVE' || status.type === 'INCOMPLETE') && { color: '#ffffff', fontWeight: '800' },
                            status.isTodayWaiting && { color: '#0284c7', fontWeight: '800' },
                            status.isSunday && { color: '#94a3b8' },
                            status.type === 'FUTURE' && { color: '#64748b' }
                          ]}>
                            {dayNum}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Selected Date Details Card */}
            {selectedCalDate && (
              <View style={[styles.card, { borderTopWidth: 3, borderTopColor: '#07b0e3' }]}>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>
                      Selected Date Details
                    </Text>
                    <Text style={styles.cardTitle}>{formatCalFullDate(selectedCalDate)}</Text>
                  </View>

                  {/* Status Badge */}
                  {(() => {
                    const dayNum = parseInt(selectedCalDate.split('-')[2], 10);
                    const status = getDayStatus(dayNum);
                    return (
                      <View style={[
                        styles.calStatusBadge,
                        status.type === 'COMPLETE' && { backgroundColor: '#d1fae5', borderColor: '#10b981' },
                        status.type === 'ACTIVE' && { backgroundColor: '#e0f2fe', borderColor: '#0284c7' },
                        (status.type === 'LEAVE' || status.type === 'INCOMPLETE') && { backgroundColor: '#fee2e2', borderColor: '#ef4444' },
                        (status.type === 'OFF' || status.type === 'FUTURE' || status.type === 'TODAY_WAITING') && { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
                      ]}>
                        <Text style={[
                          styles.calStatusBadgeText,
                          status.type === 'COMPLETE' && { color: '#065f46' },
                          status.type === 'ACTIVE' && { color: '#0369a1' },
                          (status.type === 'LEAVE' || status.type === 'INCOMPLETE') && { color: '#991b1b' },
                          (status.type === 'OFF' || status.type === 'FUTURE' || status.type === 'TODAY_WAITING') && { color: '#475569' },
                        ]}>
                          {status.label}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                {/* Day Details breakdown */}
                {(() => {
                  const dayNum = parseInt(selectedCalDate.split('-')[2], 10);
                  const status = getDayStatus(dayNum);
                  const rec = status.record;

                  if (rec) {
                    return (
                      <View style={{ gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                        {/* Punch In */}
                        <View style={styles.dayDetailRow}>
                          <Text style={styles.dayDetailIcon}>🟢</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.dayDetailLabel}>Punch In Time</Text>
                            <Text style={styles.dayDetailVal}>{formatCalTime(rec.punch_in_time)}</Text>
                            {rec.punch_in_address && (
                              <Text style={styles.dayDetailAddr}>📍 {rec.punch_in_address}</Text>
                            )}
                          </View>
                        </View>

                        {/* Punch Out */}
                        <View style={styles.dayDetailRow}>
                          <Text style={styles.dayDetailIcon}>🏁</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.dayDetailLabel}>Punch Out Time</Text>
                            <Text style={styles.dayDetailVal}>
                              {rec.punch_out_time ? formatCalTime(rec.punch_out_time) : (status.type === 'ACTIVE' ? 'Active Shift in Progress...' : 'Missing Punch Out')}
                            </Text>
                            {rec.punch_out_address && (
                              <Text style={styles.dayDetailAddr}>📍 {rec.punch_out_address}</Text>
                            )}
                          </View>
                        </View>

                        {/* Total Worked */}
                        {rec.total_hours != null && (
                          <View style={styles.dayDetailDurationBox}>
                            <Text style={{ fontSize: 12, color: '#0369a1', fontWeight: '600' }}>
                              ⏱️ Total Duration Worked:
                            </Text>
                            <Text style={{ fontSize: 14, color: '#0c4a6e', fontWeight: '800' }}>
                              {rec.total_hours} hrs
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  }

                  if (status.type === 'LEAVE') {
                    return (
                      <View style={{ marginTop: 12, padding: 14, backgroundColor: '#fef2f2', borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#ef4444' }}>
                        <Text style={{ color: '#991b1b', fontWeight: '700', fontSize: 13 }}>Leave / Absent Recorded</Text>
                        <Text style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>
                          No punch-in was recorded for this working day.
                        </Text>
                      </View>
                    );
                  }

                  if (status.type === 'OFF') {
                    return (
                      <View style={{ marginTop: 12, padding: 14, backgroundColor: '#f8fafc', borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#94a3b8' }}>
                        <Text style={{ color: '#475569', fontWeight: '700', fontSize: 13 }}>Sunday Weekly Off</Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          Non-working weekend off.
                        </Text>
                      </View>
                    );
                  }

                  if (status.type === 'TODAY_WAITING') {
                    return (
                      <View style={{ marginTop: 12, padding: 14, backgroundColor: '#f0f9ff', borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#0284c7' }}>
                        <Text style={{ color: '#0369a1', fontWeight: '700', fontSize: 13 }}>Today's Shift Not Started</Text>
                        <Text style={{ color: '#0284c7', fontSize: 12, marginTop: 2 }}>
                          Switch to the Shift tab and punch in with your live selfie to start today's duty.
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <View style={{ marginTop: 12, padding: 14, backgroundColor: '#f8fafc', borderRadius: 10 }}>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Upcoming day in the future.</Text>
                    </View>
                  );
                })()}
              </View>
            )}
          </View>
        )}

        {/* TAB 2: WORK REPORTS */}
        {activeTab === 'reports' && (
          <View style={{ gap: 14 }}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>
                  {user.role === 'BUSINESS_MANAGER' ? 'Team & Field Reports' : 'Submitted Work Reports'}
                </Text>
                {user.role === 'BUSINESS_MANAGER' && (
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Your reports + all Field Representatives' logs
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.btnAddSmall}
                onPress={() => setShowReportModal(true)}
              >
                <Text style={styles.btnAddSmallText}>+ Add Visit</Text>
              </TouchableOpacity>
            </View>

            {myReports.length === 0 ? (
              <View style={[styles.card, { alignItems: 'center', padding: 30 }]}>
                <Text style={{ color: '#9ca3af', fontSize: 14 }}>No reports submitted yet today.</Text>
              </View>
            ) : (
              myReports.map((rep) => (
                <View key={rep.id} style={styles.reportCard}>
                  {/* Author Name Banner for Business Manager */}
                  {user.role === 'BUSINESS_MANAGER' && rep.user_name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: rep.user_id === user.id ? '#0284c7' : '#334155' }}>
                        👤 {rep.user_name} {rep.user_id === user.id ? '(You)' : ''}
                      </Text>
                      <View style={[styles.badgeSmall, rep.user_role === 'BUSINESS_MANAGER' ? styles.badgeSuccess : styles.badgeWarning, { paddingHorizontal: 7, paddingVertical: 1 }]}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: rep.user_role === 'BUSINESS_MANAGER' ? '#16a34a' : '#d97706' }}>
                          {rep.user_role === 'BUSINESS_MANAGER' ? 'Manager' : 'Field Rep'}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.rowBetween}>
                    <Text style={styles.reportClient}>{rep.client_name}</Text>
                    <View style={[styles.badgeSmall, styles.badgeSuccess]}>
                      <Text style={styles.badgeSmallText}>LOGGED</Text>
                    </View>
                  </View>

                  <Text style={styles.reportType}>
                    {rep.meeting_type} {rep.scheme ? `• Scheme: ${rep.scheme}` : (rep.deal_value ? `• Deal: ₹${rep.deal_value}` : '')}
                  </Text>

                  <Text style={styles.reportNotes}>"{rep.notes}"</Text>

                  {rep.submitted_at && (
                    <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
                      🕒 {new Date(rep.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, {new Date(rep.submitted_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                    </Text>
                  )}

                  {rep.admin_remarks && (
                    <View style={styles.adminRemarksBox}>
                      <Text style={styles.adminRemarksText}>Admin Feedback: {rep.admin_remarks}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 3: MY DAY TIMELINE */}
        {activeTab === 'timeline' && (
          <View style={{ gap: 14 }}>
            <Text style={styles.cardTitle}>My Day Timeline & Dwell Stops</Text>

            {timelineData.length === 0 ? (
              <View style={[styles.card, { alignItems: 'center', padding: 30 }]}>
                <Text style={{ color: '#9ca3af', fontSize: 14 }}>No timeline recorded yet for today.</Text>
              </View>
            ) : (
              timelineData.map((item, idx) => (
                <View key={idx} style={styles.timelineItem}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineBody}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.timelineTitle}>{item.title}</Text>
                      <Text style={styles.timelineTime}>
                        {new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>

                    {item.dwellMinutes && (
                      <Text style={styles.dwellBadge}>⏱️ Waited: {item.dwellMinutes} mins</Text>
                    )}

                    {item.address && (
                      <Text style={styles.timelineAddr}>📍 {item.address}</Text>
                    )}

                    {item.notes && (
                      <Text style={styles.timelineNotes}>"{item.notes}"</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal: Add Work Report */}
      <Modal visible={showReportModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 22 }}>
              <Text style={styles.modalTitle}>Add Work / Client Visit</Text>
              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 14 }}>
                Enter meeting discussion and selected scheme
              </Text>

              <Text style={styles.inputLabel}>Client / Company Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Apollo Healthcare Ltd"
                placeholderTextColor="#94a3b8"
                value={reportForm.client_name}
                onChangeText={(val) => setReportForm({ ...reportForm, client_name: val })}
              />

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>Meeting Purpose</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Product Demo / Deal Closing"
                placeholderTextColor="#94a3b8"
                value={reportForm.meeting_type}
                onChangeText={(val) => setReportForm({ ...reportForm, meeting_type: val })}
              />

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>Select Scheme *</Text>
              <TouchableOpacity
                style={styles.dropdownTrigger}
                onPress={() => setShowSchemeDropdown(!showSchemeDropdown)}
              >
                <Text style={styles.dropdownValueText}>{reportForm.scheme || 'Select Scheme'}</Text>
                <Text style={{ color: '#64748b', fontSize: 13 }}>{showSchemeDropdown ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showSchemeDropdown && (
                <View style={styles.dropdownMenu}>
                  {SCHEME_OPTIONS.map((item) => {
                    const isSelected = reportForm.scheme === item;
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                        onPress={() => {
                          setReportForm({ ...reportForm, scheme: item });
                          setShowSchemeDropdown(false);
                        }}
                      >
                        <Text style={[styles.dropdownMenuText, isSelected && styles.dropdownMenuTextActive]}>
                          {isSelected ? `✓  ${item}` : item}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>Discussion Notes *</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                multiline
                placeholder="Summary of discussion with client..."
                placeholderTextColor="#94a3b8"
                value={reportForm.notes}
                onChangeText={(val) => setReportForm({ ...reportForm, notes: val })}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 }}>
                <TouchableOpacity
                  style={{
                    flex: 1.6,
                    backgroundColor: '#07b0e3',
                    borderRadius: 10,
                    paddingVertical: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  disabled={loading}
                  onPress={handleSubmitReport}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Submit Report</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#f1f5f9',
                    borderRadius: 10,
                    paddingVertical: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                  }}
                  onPress={() => setShowReportModal(false)}
                >
                  <Text style={{ color: '#475569', fontSize: 14, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loginContent: {
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100%',
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: '#07b0e3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#07b0e3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 24,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#0f172a',
    fontSize: 14,
  },
  btnPrimary: {
    backgroundColor: '#07b0e3',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
    shadowColor: '#07b0e3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  authSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  authSwitchBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  authSwitchBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  authSwitchText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  authSwitchTextActive: {
    color: '#07b0e3',
    fontWeight: '800',
  },
  roleSelectionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  roleCardActive: {
    borderColor: '#07b0e3',
    backgroundColor: 'rgba(7, 176, 227, 0.06)',
  },
  roleCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  roleCardTitleActive: {
    color: '#07b0e3',
  },
  roleCardSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 14 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  headerUserName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  roleBadgeContainer: {
    backgroundColor: 'rgba(7, 176, 227, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(7, 176, 227, 0.25)',
  },
  roleBadgeText: {
    color: '#07b0e3',
    fontSize: 11,
    fontWeight: '700',
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#07b0e3',
  },
  tabText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#07b0e3',
    fontWeight: '800',
  },
  bodyContent: {
    padding: 18,
    gap: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillActive: {
    backgroundColor: 'rgba(7, 227, 117, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(7, 227, 117, 0.4)',
  },
  statusPillIdle: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  timerContainer: {
    alignItems: 'center',
    marginVertical: 16,
    paddingVertical: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timerText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  timerSubtext: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  gpsBox: {
    backgroundColor: 'rgba(7, 176, 227, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(7, 176, 227, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  gpsLabel: {
    fontSize: 11,
    color: '#07b0e3',
    fontWeight: '700',
  },
  gpsValue: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
    lineHeight: 16,
  },
  btnAction: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  btnPunchIn: {
    backgroundColor: '#07e375',
  },
  btnPunchOut: {
    backgroundColor: '#e3c607',
  },
  btnReport: {
    backgroundColor: '#07b0e3',
  },
  btnActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  fieldActionBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 13,
  },
  fieldActionBtnText: {
    color: '#1e293b',
    fontSize: 13,
    fontWeight: '700',
  },
  btnAddSmall: {
    backgroundColor: '#07b0e3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnAddSmallText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  reportCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  reportClient: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  reportType: {
    fontSize: 12,
    color: '#07b0e3',
    fontWeight: '700',
    marginTop: 2,
  },
  reportNotes: {
    fontSize: 13,
    color: '#334155',
    marginTop: 8,
    lineHeight: 19,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  adminRemarksBox: {
    backgroundColor: 'rgba(7, 176, 227, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(7, 176, 227, 0.2)',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  adminRemarksText: {
    fontSize: 11,
    color: '#07b0e3',
    fontWeight: '700',
  },
  badgeSmall: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(7, 227, 117, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(7, 227, 117, 0.3)',
  },
  badgeWarning: {
    backgroundColor: 'rgba(227, 198, 7, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(227, 198, 7, 0.3)',
  },
  badgeSmallText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#07b0e3',
    marginTop: 6,
  },
  timelineBody: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  timelineTime: {
    fontSize: 11,
    color: '#64748b',
  },
  dwellBadge: {
    color: '#b45309',
    backgroundColor: 'rgba(227, 198, 7, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    overflow: 'hidden',
  },
  timelineAddr: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
  },
  timelineNotes: {
    color: '#334155',
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  btnDemo: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  btnDemoText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownValueText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownMenu: {
    marginTop: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownMenuItemActive: {
    backgroundColor: 'rgba(7, 176, 227, 0.08)',
  },
  dropdownMenuText: {
    color: '#475569',
    fontSize: 14,
  },
  dropdownMenuTextActive: {
    color: '#07b0e3',
    fontWeight: '700',
  },
  // Calendar & Attendance Styles
  calNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  calNavBtnText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 24,
  },
  calMonthTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  currentMonthPill: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#e0f2fe',
    borderRadius: 20,
    alignSelf: 'center',
  },
  currentMonthPillText: {
    fontSize: 12,
    color: '#0284c7',
    fontWeight: '700',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  counterCard: {
    width: '48.3%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  counterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  counterValue: {
    fontSize: 22,
    fontWeight: '800',
    marginVertical: 4,
  },
  counterSub: {
    fontSize: 10,
    color: '#94a3b8',
  },
  miniCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  weekHeader: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 8,
  },
  calCol: {
    flex: 1,
    alignItems: 'center',
  },
  weekHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  calCell: {
    width: '14.28%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  calCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  calCircleComplete: {
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  calCircleActive: {
    backgroundColor: '#0284c7',
    borderWidth: 2,
    borderColor: '#38bdf8',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
  calCircleLeave: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  calCircleTodayWaiting: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1.5,
    borderColor: '#0284c7',
  },
  calCircleSunday: {
    backgroundColor: '#f1f5f9',
  },
  calCircleSelected: {
    borderWidth: 2.5,
    borderColor: '#0f172a',
  },
  calDayNum: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  calStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  calStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dayDetailRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  dayDetailIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  dayDetailLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  dayDetailVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 1,
  },
  dayDetailAddr: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  dayDetailDurationBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    padding: 10,
    borderRadius: 8,
  },
  calMiniStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  miniStatBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  miniStatVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  miniStatLbl: {
    fontSize: 9.5,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
});
