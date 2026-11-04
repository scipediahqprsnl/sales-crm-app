require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const trackingRoutes = require('./routes/tracking');
const reportsRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static files for uploaded selfies & report photos
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/reports', reportsRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    app: 'Sales-CRM Backend API',
    message: 'Backend server is running successfully 🚀',
    healthCheck: '/api/health',
    time: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    app: 'Sales-CRM Backend API',
    time: new Date().toISOString()
  });
});

// Start Server & Init DB
const start = async () => {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`===============================================`);
      console.log(`  Sales-CRM Server running on port ${PORT}`);
      console.log(`  Local: http://localhost:${PORT}`);
      console.log(`  Health: http://localhost:${PORT}/api/health`);
      console.log(`===============================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
