const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, run, query } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../utils/upload');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const saveBase64Image = (base64Str, prefix = 'report') => {
  if (!base64Str) return null;
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  const data = matches ? matches[2] : base64Str;
  const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
  const uploadPath = path.resolve(__dirname, '../../uploads', filename);
  fs.writeFileSync(uploadPath, Buffer.from(data, 'base64'));
  return `/uploads/${filename}`;
};

// Submit a work report (Field Rep and Business Manager)
router.post('/', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const { client_name, client_address, meeting_type, scheme, notes, deal_value, attendance_id, photoBase64 } = req.body;

    if (!client_name || !notes) {
      return res.status(400).json({ error: 'Client name and meeting notes are required' });
    }

    let photoUrl = null;
    if (photoBase64) {
      // Store Base64 directly in cloud database so Render ephemeral disk never loses the photo
      photoUrl = photoBase64.startsWith('data:') ? photoBase64 : `data:image/jpeg;base64,${photoBase64}`;
    } else if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    const reportId = uuidv4();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO work_reports (
        id, user_id, attendance_id, client_name, client_address, meeting_type, scheme, notes, deal_value, visit_photo, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?)`,
      [
        reportId,
        req.user.id,
        attendance_id || null,
        client_name,
        client_address || '',
        meeting_type || 'General Visit',
        scheme || 'FD loan',
        notes,
        deal_value ? parseFloat(deal_value) : null,
        photoUrl,
        now
      ]
    );

    const report = await get(`SELECT * FROM work_reports WHERE id = ?`, [reportId]);
    res.status(201).json({
      message: 'Work report logged successfully!',
      report
    });
  } catch (error) {
    console.error('Work report submission error:', error);
    res.status(500).json({ error: 'Failed to submit work report' });
  }
});

// Get reports feed: For Manager, returns own reports + all Field Representatives' reports; for Reps, returns own reports
router.get('/my-reports', authenticateToken, async (req, res) => {
  try {
    let reports;
    if (req.user.role === 'BUSINESS_MANAGER') {
      reports = await query(
        `SELECT r.*, u.name as user_name, u.role as user_role
         FROM work_reports r
         JOIN users u ON r.user_id = u.id
         WHERE u.role = 'FIELD_REPRESENTATIVE' OR u.id = ? OR u.manager_id = ?
         ORDER BY r.submitted_at DESC`,
        [req.user.id, req.user.id]
      );
    } else {
      reports = await query(
        `SELECT r.*, u.name as user_name, u.role as user_role
         FROM work_reports r
         JOIN users u ON r.user_id = u.id
         WHERE r.user_id = ?
         ORDER BY r.submitted_at DESC`,
        [req.user.id]
      );
    }
    res.json({ reports });
  } catch (error) {
    console.error('Failed to fetch reports:', error);
    res.status(500).json({ error: 'Failed to fetch your reports' });
  }
});

// Admin / Manager view: All reports with employee details
router.get('/all', authenticateToken, requireRole(['ADMIN', 'BUSINESS_MANAGER']), async (req, res) => {
  try {
    let sql;
    let params = [];

    if (req.user.role === 'ADMIN') {
      sql = `
        SELECT r.*, u.name as user_name, u.email as user_email, u.role as user_role,
               reviewer.name as reviewer_name
        FROM work_reports r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN users reviewer ON r.reviewed_by = reviewer.id
        ORDER BY r.submitted_at DESC
      `;
    } else {
      sql = `
        SELECT r.*, u.name as user_name, u.email as user_email, u.role as user_role,
               reviewer.name as reviewer_name
        FROM work_reports r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN users reviewer ON r.reviewed_by = reviewer.id
        WHERE u.role = 'FIELD_REPRESENTATIVE' OR u.manager_id = ? OR u.id = ?
        ORDER BY r.submitted_at DESC
      `;
      params = [req.user.id, req.user.id];
    }

    const reports = await query(sql, params);
    res.json({ reports });
  } catch (error) {
    console.error('Failed to fetch reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Admin / Manager review and approval
router.patch('/:id/review', authenticateToken, requireRole(['ADMIN', 'BUSINESS_MANAGER']), async (req, res) => {
  try {
    const { status, admin_remarks } = req.body;
    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be APPROVED, REJECTED, or PENDING' });
    }

    const report = await get(`SELECT * FROM work_reports WHERE id = ?`, [req.params.id]);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const now = new Date().toISOString();
    await run(
      `UPDATE work_reports SET
        status = ?,
        admin_remarks = ?,
        reviewed_by = ?,
        reviewed_at = ?
       WHERE id = ?`,
      [status, admin_remarks || '', req.user.id, now, req.params.id]
    );

    const updated = await get(
      `SELECT r.*, u.name as user_name, reviewer.name as reviewer_name 
       FROM work_reports r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN users reviewer ON r.reviewed_by = reviewer.id
       WHERE r.id = ?`,
      [req.params.id]
    );

    res.json({
      message: `Report status updated to ${status}`,
      report: updated
    });
  } catch (error) {
    console.error('Review update error:', error);
    res.status(500).json({ error: 'Failed to update review status' });
  }
});

module.exports = router;
