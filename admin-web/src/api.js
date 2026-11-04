export const SERVER_BASE = import.meta.env.VITE_SERVER_BASE || 'https://sales-crm-app-1kqz.onrender.com';
export const API_BASE = import.meta.env.VITE_API_BASE || `${SERVER_BASE}/api`;

export const getAuthToken = () => localStorage.getItem('sales_crm_token');
export const setAuthToken = (token) => localStorage.setItem('sales_crm_token', token);
export const removeAuthToken = () => localStorage.removeItem('sales_crm_token');

export const getCurrentUser = () => {
  const user = localStorage.getItem('sales_crm_user');
  return user ? JSON.parse(user) : null;
};
export const setCurrentUser = (user) => localStorage.setItem('sales_crm_user', JSON.stringify(user));
export const removeCurrentUser = () => localStorage.removeItem('sales_crm_user');

const request = async (endpoint, options = {}) => {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
};

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  register: (userData) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),
  getMe: () => request('/auth/me'),
  getUsers: () => request('/auth/users'),
  createUser: (userData) => request('/auth/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),
  deleteUser: (userId) => request(`/auth/users/${userId}`, {
    method: 'DELETE',
  }),
  reactivateUser: (userId) => request(`/auth/users/${userId}/reactivate`, {
    method: 'PATCH',
  }),

  // Attendance
  getTodayAttendance: () => request('/attendance/today'),
  getAllAttendances: (date) => request(`/attendance/all${date ? `?date=${date}` : ''}`),

  // Tracking & Timeline
  getLiveFleet: () => request('/tracking/live'),
  getTimeline: (userId, date) => request(`/tracking/timeline?userId=${userId}&date=${date}`),

  // Reports
  getAllReports: () => request('/reports/all'),
  reviewReport: (reportId, status, admin_remarks) => request(`/reports/${reportId}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status, admin_remarks }),
  }),
};
