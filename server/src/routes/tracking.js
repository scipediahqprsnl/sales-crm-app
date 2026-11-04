const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, run, query } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Haversine formula to compute distance in meters between two lat/lng points
const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Simple reverse geocoding fallback
const formatLocationLabel = (lat, lng, address) => {
  if (address && address.trim().length > 3) return address;
  return `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
};

// Process Dwell Time Stop Detection
const processDwellDetection = async (userId, attendanceId, currentLat, currentLng, recordedAt) => {
  try {
    const currentTime = new Date(recordedAt || Date.now());

    // Fetch the most recent stop for this user today
    const lastStop = await get(
      `SELECT * FROM timeline_stops 
       WHERE user_id = ? AND attendance_id = ? 
       ORDER BY departed_at DESC LIMIT 1`,
      [userId, attendanceId]
    );

    const DWELL_RADIUS_METERS = 70; // within 70m considered stationary

    if (lastStop) {
      const distFromLastStop = getDistanceMeters(
        lastStop.latitude,
        lastStop.longitude,
        currentLat,
        currentLng
      );

      // If still within the same location radius
      if (distFromLastStop <= DWELL_RADIUS_METERS) {
        const arrivalTime = new Date(lastStop.arrived_at);
        const dwellMins = Math.max(1, Math.round((currentTime - arrivalTime) / (1000 * 60)));

        await run(
          `UPDATE timeline_stops SET departed_at = ?, dwell_minutes = ? WHERE id = ?`,
          [currentTime.toISOString(), dwellMins, lastStop.id]
        );
        return;
      }
    }

    // Check recent pings to see if employee has been stationary here
    const recentPings = await query(
      `SELECT * FROM location_pings 
       WHERE user_id = ? AND attendance_id = ? 
       ORDER BY recorded_at DESC LIMIT 6`,
      [userId, attendanceId]
    );

    if (recentPings.length >= 3) {
      const oldestPing = recentPings[recentPings.length - 1];
      const oldestTime = new Date(oldestPing.recorded_at);
      const timeDiffMinutes = (currentTime - oldestTime) / (1000 * 60);

      // Check if all recent pings are within radius
      const allWithinRadius = recentPings.every((p) => {
        return getDistanceMeters(p.latitude, p.longitude, currentLat, currentLng) <= DWELL_RADIUS_METERS;
      });

      if (allWithinRadius && timeDiffMinutes >= 3) {
        // Create a new stationary stop record
        const stopId = uuidv4();
        const stopLabel = `Client Location / Zone (${currentLat.toFixed(3)}, ${currentLng.toFixed(3)})`;
        const dwellMins = Math.max(1, Math.round(timeDiffMinutes));

        await run(
          `INSERT INTO timeline_stops (
            id, user_id, attendance_id, location_name, address, latitude, longitude, arrived_at, departed_at, dwell_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            stopId,
            userId,
            attendanceId,
            stopLabel,
            `Visited area near coordinates [${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}]`,
            currentLat,
            currentLng,
            oldestTime.toISOString(),
            currentTime.toISOString(),
            dwellMins
          ]
        );
      }
    }
  } catch (err) {
    console.error('Error in dwell detection:', err);
  }
};

// Record a single live GPS ping
router.post('/ping', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, speed, recorded_at, attendanceId, address } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const recordedTime = recorded_at || new Date().toISOString();
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    await run(
      `INSERT INTO location_pings (user_id, attendance_id, latitude, longitude, accuracy, speed, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, attendanceId || null, lat, lng, accuracy || null, speed || null, recordedTime]
    );

    // Run dwell / stop detection if attendanceId is present
    if (attendanceId) {
      await processDwellDetection(req.user.id, attendanceId, lat, lng, recordedTime);
    }

    res.json({ success: true, timestamp: recordedTime });
  } catch (error) {
    console.error('Ping recording error:', error);
    res.status(500).json({ error: 'Failed to record location ping' });
  }
});

// Batch record GPS pings (for offline or battery-saving background sync)
router.post('/batch', authenticateToken, async (req, res) => {
  try {
    const { pings, attendanceId } = req.body;
    if (!Array.isArray(pings) || pings.length === 0) {
      return res.status(400).json({ error: 'pings must be a non-empty array' });
    }

    for (const p of pings) {
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      const recTime = p.recorded_at || new Date().toISOString();

      await run(
        `INSERT INTO location_pings (user_id, attendance_id, latitude, longitude, accuracy, speed, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, attendanceId || null, lat, lng, p.accuracy || null, p.speed || null, recTime]
      );

      if (attendanceId) {
        await processDwellDetection(req.user.id, attendanceId, lat, lng, recTime);
      }
    }

    res.json({ success: true, count: pings.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to batch process pings' });
  }
});

// Admin / Manager Live Fleet Map (Latest location of all active staff)
router.get('/live', authenticateToken, requireRole(['ADMIN', 'BUSINESS_MANAGER']), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get all users who punched in today
    let userFilter = '';
    let params = [today];

    if (req.user.role === 'BUSINESS_MANAGER') {
      userFilter = 'AND (u.manager_id = ? OR u.id = ?)';
      params.push(req.user.id, req.user.id);
    }

    const activeStaff = await query(
      `SELECT u.id, u.name, u.email, u.role, u.phone,
              a.id as attendance_id, a.punch_in_time, a.punch_out_time, a.status,
              a.punch_in_lat, a.punch_in_lng, a.punch_in_address, a.punch_in_photo, a.punch_out_photo
       FROM attendances a
       JOIN users u ON a.user_id = u.id
       WHERE a.date = ? ${userFilter}`,
      params
    );

    // Enrich each staff with their latest location ping and current dwell status
    const liveResults = await Promise.all(
      activeStaff.map(async (staff) => {
        const latestPing = await get(
          `SELECT latitude, longitude, speed, recorded_at 
           FROM location_pings 
           WHERE user_id = ? 
           ORDER BY recorded_at DESC LIMIT 1`,
          [staff.id]
        );

        const currentStop = await get(
          `SELECT location_name, address, arrived_at, departed_at, dwell_minutes 
           FROM timeline_stops 
           WHERE user_id = ? 
           ORDER BY departed_at DESC LIMIT 1`,
          [staff.id]
        );

        let liveStatus = 'OFFLINE';
        if (!staff.punch_out_time && latestPing) {
          const pingAgeMinutes = (Date.now() - new Date(latestPing.recorded_at)) / (1000 * 60);
          if (pingAgeMinutes < 15) {
            liveStatus = (latestPing.speed && latestPing.speed > 1.5) ? 'MOVING' : 'STATIONARY';
          } else {
            liveStatus = 'IDLE';
          }
        } else if (staff.punch_out_time) {
          liveStatus = 'SHIFT_COMPLETED';
        }

        return {
          ...staff,
          latestPing: latestPing || null,
          currentStop: currentStop || null,
          liveStatus
        };
      })
    );

    res.json({ staff: liveResults });
  } catch (error) {
    console.error('Error fetching live fleet:', error);
    res.status(500).json({ error: 'Failed to fetch live locations' });
  }
});

// Full Day Timeline Generator for Employee & Admin
router.get('/timeline', authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.query.userId || req.user.id;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    // Security check: non-admin can only see their own timeline (or their team's if manager)
    if (req.user.role === 'FIELD_REPRESENTATIVE' && targetUserId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const attendance = await get(
      `SELECT * FROM attendances WHERE user_id = ? AND date = ?`,
      [targetUserId, date]
    );

    if (!attendance) {
      return res.json({
        hasAttendance: false,
        message: 'No attendance record found for this date',
        timeline: []
      });
    }

    // Get all stops and dwell times
    const stops = await query(
      `SELECT * FROM timeline_stops 
       WHERE user_id = ? AND attendance_id = ? 
       ORDER BY arrived_at ASC`,
      [targetUserId, attendance.id]
    );

    // Get polyline path of all GPS pings for the day
    const routePings = await query(
      `SELECT latitude, longitude, speed, recorded_at 
       FROM location_pings 
       WHERE user_id = ? AND attendance_id = ? 
       ORDER BY recorded_at ASC`,
      [targetUserId, attendance.id]
    );

    // Get work reports submitted on this day
    const reports = await query(
      `SELECT * FROM work_reports 
       WHERE user_id = ? AND attendance_id = ? 
       ORDER BY submitted_at ASC`,
      [targetUserId, attendance.id]
    );

    // Assemble unified chronological timeline
    const timelineEvents = [];

    // 1. Punch In Event
    timelineEvents.push({
      type: 'PUNCH_IN',
      time: attendance.punch_in_time,
      title: 'Shift Started (Punch In)',
      address: attendance.punch_in_address,
      latitude: attendance.punch_in_lat,
      longitude: attendance.punch_in_lng,
      photo: attendance.punch_in_photo
    });

    // 2. Add Stops / Dwell Times
    stops.forEach((s) => {
      timelineEvents.push({
        type: 'STATIONARY_STOP',
        time: s.arrived_at,
        departedAt: s.departed_at,
        title: s.location_name || 'Halted / Client Location',
        address: s.address,
        dwellMinutes: s.dwell_minutes,
        latitude: s.latitude,
        longitude: s.longitude
      });
    });

    // 3. Add Work Reports
    reports.forEach((r) => {
      const reportTime = new Date(r.submitted_at).getTime();
      let reportLat = null;
      let reportLng = null;

      // Find matching stop or closest ping
      const matchingStop = stops.find(s => {
        const arr = new Date(s.arrived_at).getTime();
        const dep = new Date(s.departed_at).getTime();
        return reportTime >= arr - 30 * 60 * 1000 && reportTime <= dep + 30 * 60 * 1000;
      });

      if (matchingStop) {
        reportLat = matchingStop.latitude;
        reportLng = matchingStop.longitude;
      } else if (routePings.length > 0) {
        let minDiff = Infinity;
        routePings.forEach(p => {
          const diff = Math.abs(new Date(p.recorded_at).getTime() - reportTime);
          if (diff < minDiff) {
            minDiff = diff;
            reportLat = p.latitude;
            reportLng = p.longitude;
          }
        });
      }

      timelineEvents.push({
        type: 'WORK_REPORT',
        time: r.submitted_at,
        title: `Client Visit: ${r.client_name}`,
        clientAddress: r.client_address,
        meetingType: r.meeting_type,
        notes: r.notes,
        dealValue: r.deal_value,
        status: r.status,
        photo: r.visit_photo,
        latitude: reportLat,
        longitude: reportLng
      });
    });

    // 4. Punch Out Event (if completed)
    if (attendance.punch_out_time) {
      timelineEvents.push({
        type: 'PUNCH_OUT',
        time: attendance.punch_out_time,
        title: 'Shift Ended (Punch Out)',
        address: attendance.punch_out_address,
        latitude: attendance.punch_out_lat,
        longitude: attendance.punch_out_lng,
        photo: attendance.punch_out_photo,
        totalHours: attendance.total_hours
      });
    }

    // Sort chronologically
    timelineEvents.sort((a, b) => new Date(a.time) - new Date(b.time));

    res.json({
      hasAttendance: true,
      attendance,
      timeline: timelineEvents,
      routePings,
      totalStops: stops.length,
      totalReports: reports.length
    });
  } catch (error) {
    console.error('Error generating timeline:', error);
    res.status(500).json({ error: 'Failed to generate timeline' });
  }
});

module.exports = router;
