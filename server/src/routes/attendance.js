const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { get, run, query } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../utils/upload');

const router = express.Router();

// Helper to save base64 image if uploaded as base64 string
const saveBase64Image = (base64Str, prefix = 'selfie') => {
  if (!base64Str) return null;
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  const data = matches ? matches[2] : base64Str;
  const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
  const uploadPath = path.resolve(__dirname, '../../uploads', filename);
  fs.writeFileSync(uploadPath, Buffer.from(data, 'base64'));
  return `/uploads/${filename}`;
};

// Punch In
router.post('/punch-in', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Check if already punched in today
    const existing = await get(
      `SELECT * FROM attendances WHERE user_id = ? AND date = ?`,
      [userId, today]
    );

    if (existing) {
      return res.status(400).json({ 
        error: 'Already punched in for today', 
        attendance: existing 
      });
    }

    const { latitude, longitude, address, photoBase64 } = req.body;
    let photoUrl = null;

    if (photoBase64) {
      // Store Base64 directly in cloud database so Render ephemeral disk never loses the photo
      photoUrl = photoBase64.startsWith('data:') ? photoBase64 : `data:image/jpeg;base64,${photoBase64}`;
    } else if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    if (!photoUrl) {
      return res.status(400).json({ error: 'Live selfie photo is required to punch in' });
    }

    const attendanceId = uuidv4();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO attendances (
        id, user_id, date, punch_in_time, punch_in_lat, punch_in_lng, punch_in_address, punch_in_photo, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attendanceId,
        userId,
        today,
        now,
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        address || 'Recorded via GPS',
        photoUrl,
        'PRESENT'
      ]
    );

    const record = await get(`SELECT * FROM attendances WHERE id = ?`, [attendanceId]);
    res.status(201).json({
      message: 'Punched in successfully! Have a great shift.',
      attendance: record
    });
  } catch (error) {
    console.error('Punch in error:', error);
    res.status(500).json({ error: 'Failed to record punch in' });
  }
});

// Punch Out
router.post('/punch-out', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const attendance = await get(
      `SELECT * FROM attendances WHERE user_id = ? AND date = ?`,
      [userId, today]
    );

    if (!attendance) {
      return res.status(400).json({ error: 'No punch-in found for today. Please punch in first.' });
    }

    if (attendance.punch_out_time) {
      return res.status(400).json({ 
        error: 'Already punched out for today', 
        attendance 
      });
    }

    const { latitude, longitude, address, photoBase64 } = req.body;
    let photoUrl = null;

    if (photoBase64) {
      // Store Base64 directly in cloud database so Render ephemeral disk never loses the photo
      photoUrl = photoBase64.startsWith('data:') ? photoBase64 : `data:image/jpeg;base64,${photoBase64}`;
    } else if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    if (!photoUrl) {
      return res.status(400).json({ error: 'Live selfie photo is required to punch out' });
    }

    const now = new Date();
    const punchInDate = new Date(attendance.punch_in_time);
    const diffMs = now - punchInDate;
    const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100; // Round to 2 decimal places

    await run(
      `UPDATE attendances SET
        punch_out_time = ?,
        punch_out_lat = ?,
        punch_out_lng = ?,
        punch_out_address = ?,
        punch_out_photo = ?,
        total_hours = ?
      WHERE id = ?`,
      [
        now.toISOString(),
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        address || 'Recorded via GPS',
        photoUrl,
        totalHours,
        attendance.id
      ]
    );

    const updated = await get(`SELECT * FROM attendances WHERE id = ?`, [attendance.id]);
    res.json({
      message: 'Punched out successfully! Shift completed.',
      attendance: updated,
      totalHours
    });
  } catch (error) {
    console.error('Punch out error:', error);
    res.status(500).json({ error: 'Failed to record punch out' });
  }
});

// Today's status for the logged-in user
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const attendance = await get(
      `SELECT * FROM attendances WHERE user_id = ? AND date = ?`,
      [req.user.id, today]
    );
    res.json({ attendance: attendance || null });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching today attendance' });
  }
});

// User's own attendance history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const records = await query(
      `SELECT * FROM attendances WHERE user_id = ? ORDER BY date DESC LIMIT 30`,
      [req.user.id]
    );
    res.json({ attendances: records });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching attendance history' });
  }
});

// Admin / Manager view: All employee attendances with photos
router.get('/all', authenticateToken, requireRole(['ADMIN', 'BUSINESS_MANAGER']), async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    let sql;
    let params;

    if (req.user.role === 'ADMIN') {
      sql = `
        SELECT a.*, u.name as user_name, u.email as user_email, u.role as user_role, u.phone as user_phone
        FROM attendances a
        JOIN users u ON a.user_id = u.id
        WHERE a.date = ?
        ORDER BY a.punch_in_time DESC
      `;
      params = [date];
    } else {
      // Business Manager view
      sql = `
        SELECT a.*, u.name as user_name, u.email as user_email, u.role as user_role, u.phone as user_phone
        FROM attendances a
        JOIN users u ON a.user_id = u.id
        WHERE a.date = ? AND (u.manager_id = ? OR u.id = ?)
        ORDER BY a.punch_in_time DESC
      `;
      params = [date, req.user.id, req.user.id];
    }

    const attendances = await query(sql, params);
    res.json({ date, attendances });
  } catch (error) {
    console.error('Fetch all attendances error:', error);
    res.status(500).json({ error: 'Error fetching team attendance records' });
  }
});

module.exports = router;
