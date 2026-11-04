# 🚀 Sales-CRM — Enterprise Field Force & Attendance Management System

A full-stack Role-Based Access Control (RBAC) sales CRM designed for field personnel tracking, selfie-verified GPS attendance, automated daily movement timeline generation with dwell time detection, and daily client activity reporting.

---

## 🏗️ System Components

| Component | Path | Technology | Purpose |
| :--- | :--- | :--- | :--- |
| **Backend API & Database** | `server/` | Node.js, Express, SQLite, JWT, Multer | Manages authentication, calculates shift hours, logs GPS pings, computes dwell times, and stores selfie verification photos. |
| **Admin Web Command Center** | `admin-web/` | React (Vite), CSS3 Glassmorphism, Leaflet Maps, Lucide Icons | Admin dashboard for live fleet monitoring, selfie inspection lightbox, route playback, and work report review. |
| **Mobile Application** | `mobile/` | React Native (Expo), Location, Camera, AsyncStorage | Field app for Representatives & Managers to punch in/out with front-camera selfies, log client meetings, and track daily timelines. |

---

## 👥 Role-Based Access Control (RBAC) & Demo Logins

The database comes pre-seeded with 3 demo accounts ready for testing:

| Role | Email | Password | Permissions & Features |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@salescrm.com` | `admin123` | Full access to Admin Web Dashboard, live fleet map, selfie audit, day route playback, work report approval/rejection, and user management. |
| **Business Manager** | `manager@salescrm.com` | `manager123` | Attendance punch in/out with selfie & GPS, submit management work reports, monitor team reports and dwell timelines. |
| **Field Representative** | `rep@salescrm.com` | `rep123` | Attendance punch in/out with selfie & GPS, background location tracking, log client visits/deals, and view personal day timeline. |

---

## ⚡ How to Run Everything

### 1. Start the Backend API Server
```bash
cd server
npm start
```
* Server runs on: `http://localhost:5000`
* Health check: `http://localhost:5000/api/health`
* Photo uploads directory: `server/uploads/`

---

### 2. Start the Admin Web Dashboard
```bash
cd admin-web
npm run dev
```
* Dashboard runs on: `http://localhost:3000`
* Features:
  * **Live Fleet Map**: Shows who is moving (green) or stationary at a client (amber).
  * **Attendance & Photos**: Side-by-side zoomable view of Punch In and Punch Out selfies with GPS coordinates and timestamps.
  * **Day Timeline**: Step-by-step breakdown of where the employee went and how long they waited at each stop.
  * **Work Reports**: Approve or Reject client visits and provide feedback remarks.
  * **Team & Staff**: Add new employee accounts and assign roles.

---

### 3. Start the React Native Mobile App
```bash
cd mobile
npx expo start
```
* **Testing on your phone**:
  1. Install the free **Expo Go** app from Google Play Store or Apple App Store.
  2. Ensure your phone and PC are connected to the same Wi-Fi.
  3. Scan the QR code shown in the terminal.
* **Testing in Web Browser**:
  * Press `w` in the terminal to launch the mobile app in Chrome.
* **Testing on Android Emulator / iOS Simulator**:
  * Press `a` for Android Emulator or `i` for iOS Simulator.

---

## ⏱️ Stop Detection & Dwell Time Engine

Sales-CRM features an intelligent dwell time detection algorithm:
1. **Periodic GPS Collection**: While an employee is punched in, GPS pings (lat, lng, speed, accuracy) are logged.
2. **Stationary Detection**: When consecutive pings remain within a 50–70 meter radius for $\ge 3\text{ minutes}$, the system automatically logs a **Stationary Stop**.
3. **Dwell Duration**: Upon leaving the area, the system computes the arrival and departure times (e.g. *Waited: 1h 30m at Apollo Healthcare*) and reverse-geocodes the location address.
4. **End-of-Day Timeline**: Chronologically binds Punch In $\rightarrow$ Travel Routes $\rightarrow$ Client Stops $\rightarrow$ Work Reports $\rightarrow$ Punch Out.
