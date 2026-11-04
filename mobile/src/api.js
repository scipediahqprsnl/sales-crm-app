import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Cloud Production Server URL on Render (accessible anywhere via 4G/5G mobile data or Wi-Fi)
export const CLOUD_SERVER_URL = 'https://sales-crm-app-1kqz.onrender.com';
export const CLOUD_API_BASE = `${CLOUD_SERVER_URL}/api`;

export let API_BASE = CLOUD_API_BASE;

// Check if custom server host was saved in storage, upgrade old localhost/LAN to cloud
AsyncStorage.getItem('sales_crm_server_url')
  .then((saved) => {
    if (saved && saved.startsWith('http') && !saved.includes('localhost') && !saved.includes('192.168.') && !saved.includes('10.0.2.2')) {
      API_BASE = saved;
    } else {
      // Default to production cloud Render server
      API_BASE = CLOUD_API_BASE;
      AsyncStorage.setItem('sales_crm_server_url', CLOUD_API_BASE);
    }
  })
  .catch(() => {});

export const setServerUrl = async (url) => {
  API_BASE = url;
  await AsyncStorage.setItem('sales_crm_server_url', url);
};

export const getAuthToken = async () => {
  return await AsyncStorage.getItem('sales_crm_token');
};

export const setAuthToken = async (token) => {
  await AsyncStorage.setItem('sales_crm_token', token);
};

export const removeAuthToken = async () => {
  await AsyncStorage.removeItem('sales_crm_token');
};

export const getCurrentUser = async () => {
  const user = await AsyncStorage.getItem('sales_crm_user');
  return user ? JSON.parse(user) : null;
};

export const setCurrentUser = async (user) => {
  await AsyncStorage.setItem('sales_crm_user', JSON.stringify(user));
};

export const removeCurrentUser = async () => {
  await AsyncStorage.removeItem('sales_crm_user');
};

const request = async (endpoint, options = {}) => {
  const token = await getAuthToken();
  const isMultipart = options.body instanceof FormData;

  const headers = {
    ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Server error occurred');
  }

  return data;
};

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  register: (payload) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getMe: () => request('/auth/me'),

  // Attendance
  getTodayAttendance: () => request('/attendance/today'),
  punchIn: (payload) => request('/attendance/punch-in', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  punchOut: (payload) => request('/attendance/punch-out', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getMyHistory: () => request('/attendance/history'),

  // Live Tracking
  sendPing: (pingData) => request('/tracking/ping', {
    method: 'POST',
    body: JSON.stringify(pingData),
  }),
  sendBatchPings: (batchData) => request('/tracking/batch', {
    method: 'POST',
    body: JSON.stringify(batchData),
  }),
  getMyTimeline: (date) => request(`/tracking/timeline${date ? `?date=${date}` : ''}`),

  // Work Reports
  submitReport: (reportData) => request('/reports', {
    method: 'POST',
    body: JSON.stringify(reportData),
  }),
  getMyReports: () => request('/reports/my-reports'),
};

export const queueOfflinePing = async (ping) => {
  try {
    const raw = await AsyncStorage.getItem('offline_gps_pings');
    const list = raw ? JSON.parse(raw) : [];
    list.push(ping);
    if (list.length > 500) list.shift();
    await AsyncStorage.setItem('offline_gps_pings', JSON.stringify(list));
  } catch (e) {}
};

export const flushOfflinePings = async (attendanceId) => {
  try {
    const raw = await AsyncStorage.getItem('offline_gps_pings');
    if (!raw) return;
    const list = JSON.parse(raw);
    if (!list || list.length === 0) return;

    await api.sendBatchPings({ pings: list, attendanceId });
    await AsyncStorage.removeItem('offline_gps_pings');
    console.log(`Synced ${list.length} offline GPS pings to server!`);
  } catch (e) {
    // Keep cached, will retry when back online
  }
};
