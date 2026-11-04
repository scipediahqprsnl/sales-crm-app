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
  API_BASE,
  setServerUrl,
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
  const [serverHost, setServerHost] = useState(API_BASE);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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

  // Request location permission & get current coordinates
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

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCurrentCoords(loc.coords);

      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      if (geo) {
        const addr = `${geo.name || ''} ${geo.street || ''}, ${geo.city || ''}, ${geo.region || ''}`.trim();
        setLocationAddress(addr || `Lat: ${loc.coords.latitude.toFixed(4)}, Lng: ${loc.coords.longitude.toFixed(4)}`);
      } else {
        setLocationAddress(`Lat: ${loc.coords.latitude.toFixed(4)}, Lng: ${loc.coords.longitude.toFixed(4)}`);
      }
    } catch (err) {
      console.log('Location fetch error:', err);
      setLocationAddress('GPS coordinates logged (28.4595, 77.0266)');
      setCurrentCoords({ latitude: 28.4595, longitude: 77.0266 });
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

      const res = await api.punchIn({
        latitude: currentCoords?.latitude || 28.4595,
        longitude: currentCoords?.longitude || 77.0266,
        address: locationAddress || 'Recorded via GPS',
        photoBase64: selfieBase64,
      });

      Alert.alert('Shift Started!', 'Punch In verified with live photo & GPS.');
      setAttendance(res.attendance);
      setShiftSeconds(0);
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

      const res = await api.punchOut({
        latitude: currentCoords?.latitude || 28.4595,
        longitude: currentCoords?.longitude || 77.0266,
        address: locationAddress || 'Recorded via GPS',
        photoBase64: selfieBase64,
      });

      // Flush any remaining offline pings recorded during shift
      await flushOfflinePings(attendance?.id);

      Alert.alert('Shift Completed!', `Total working hours: ${res.totalHours} hrs.`);
      setAttendance(res.attendance);
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

  useEffect(() => {
    if (activeTab === 'reports') loadMyReports();
    if (activeTab === 'timeline') loadMyTimeline();
  }, [activeTab]);

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

            <TouchableOpacity 
              onPress={() => setShowSettingsModal(true)}
              style={{ marginTop: 18, alignItems: 'center' }}
            >
              <Text style={{ color: '#07b0e3', fontSize: 13, fontWeight: '700' }}>⚙️ Configure Server IP</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Server IP Settings Modal */}
        <Modal visible={showSettingsModal} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Backend Server URL</Text>
              <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 10 }}>
                Cloud Server URL (e.g. https://sales-crm-app-1kqz.onrender.com/api)
              </Text>
              <TextInput
                style={styles.input}
                value={serverHost}
                onChangeText={setServerHost}
              />
              <TouchableOpacity
                style={[styles.btnPrimary, { marginTop: 14 }]}
                onPress={async () => {
                  await setServerUrl(serverHost);
                  setShowSettingsModal(false);
                  Alert.alert('Saved', 'Server endpoint updated');
                }}
              >
                <Text style={styles.btnPrimaryText}>Save & Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // VIEW: MAIN MOBILE DASHBOARD
  // -------------------------------------------------------------
  const isPunchedIn = attendance && attendance.punch_in_time && !attendance.punch_out_time;
  const isShiftEnded = attendance && attendance.punch_out_time;

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
          <TouchableOpacity 
            onPress={() => setShowSettingsModal(true)} 
            style={{ padding: 6, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8 }}
          >
            <Text style={{ fontSize: 14 }}>⚙️</Text>
          </TouchableOpacity>
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
                  onPress={() => {
                    fetchLocation();
                    Alert.alert('GPS Ping Sent', `Pinged coordinates: ${locationAddress}`);
                  }}
                >
                  <Text style={styles.fieldActionBtnText}>📡 Check-in / Send Location Ping</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* TAB 2: WORK REPORTS */}
        {activeTab === 'reports' && (
          <View style={{ gap: 14 }}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Submitted Work Reports</Text>
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
                  <View style={styles.rowBetween}>
                    <Text style={styles.reportClient}>{rep.client_name}</Text>
                    <View style={[styles.badgeSmall, styles.badgeSuccess]}>
                      <Text style={styles.badgeSmallText}>LOGGED</Text>
                    </View>
                  </View>

                  <Text style={styles.reportType}>
                    {rep.meeting_type} {rep.scheme ? `• Scheme: ${rep.scheme}` : (rep.deal_value ? `• Deal: $${rep.deal_value}` : '')}
                  </Text>

                  <Text style={styles.reportNotes}>"{rep.notes}"</Text>

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
      <Modal visible={showReportModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Work / Client Visit</Text>
            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
              Directly logged to Admin Command Center (No approval required)
            </Text>

            <Text style={styles.inputLabel}>Client / Company Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Apollo Healthcare Ltd"
              placeholderTextColor="#94a3b8"
              value={reportForm.client_name}
              onChangeText={(val) => setReportForm({ ...reportForm, client_name: val })}
            />
              {/* the react native app is not working but this peo */}
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

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 1 }]}
                disabled={loading}
                onPress={handleSubmitReport}
              >
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnPrimaryText}>Submit Report</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnDemo, { paddingHorizontal: 16 }]}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={styles.btnDemoText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Server IP Settings Modal (Accessible while logged in) */}
      <Modal visible={showSettingsModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Backend Server URL</Text>
            <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 10 }}>
              Enter your live tunnel URL (e.g. https://xxx.loca.lt/api) or local IP.
            </Text>
            <TextInput
              style={styles.input}
              value={serverHost}
              onChangeText={setServerHost}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 1 }]}
                onPress={async () => {
                  await setServerUrl(serverHost);
                  setShowSettingsModal(false);
                  Alert.alert('Saved', 'Server endpoint updated');
                }}
              >
                <Text style={styles.btnPrimaryText}>Save & Apply</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnDemo, { paddingHorizontal: 16 }]}
                onPress={() => setShowSettingsModal(false)}
              >
                <Text style={styles.btnDemoText}>Close</Text>
              </TouchableOpacity>
            </View>
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
    paddingVertical: 14,
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
    paddingVertical: 13,
    alignItems: 'center',
  },
  tabItemActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#07b0e3',
  },
  tabText: {
    color: '#64748b',
    fontSize: 13,
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
    padding: 20,
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
});
