const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { run, get, query } = require('./src/db');

// Create a realistic sample photo if not present
const createSamplePhoto = (filename, label, color) => {
  const uploadDir = path.resolve(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const targetPath = path.resolve(uploadDir, filename);
  // Simple 1x1 base64 transparent GIF / JPEG header or placeholder data
  // We can write a clean SVG rendered as an image or sample buffer
  const svgData = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#grad)" rx="24"/>
      <circle cx="200" cy="160" r="60" fill="white" opacity="0.9"/>
      <path d="M 120 300 Q 200 230 280 300" fill="none" stroke="white" stroke-width="24" stroke-linecap="round" opacity="0.9"/>
      <rect x="30" y="330" width="340" height="40" rx="8" fill="rgba(0,0,0,0.5)"/>
      <text x="200" y="356" fill="white" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">${label}</text>
    </svg>
  `;
  fs.writeFileSync(targetPath, svgData);
  return `/uploads/${filename}`;
};

const seed = async () => {
  console.log('Seeding demo attendance, timeline stops, and work reports...');

  const today = new Date().toISOString().split('T')[0];
  const repUser = await get(`SELECT id FROM users WHERE email = ?`, ['rep@salescrm.com']);
  const mgrUser = await get(`SELECT id FROM users WHERE email = ?`, ['manager@salescrm.com']);

  if (!repUser) {
    console.log('User rep@salescrm.com not found. Start server first.');
    return;
  }

  // Clear today's previous test data for clean slate
  await run(`DELETE FROM attendances WHERE user_id = ? AND date = ?`, [repUser.id, today]);
  await run(`DELETE FROM location_pings WHERE user_id = ?`, [repUser.id]);
  await run(`DELETE FROM timeline_stops WHERE user_id = ?`, [repUser.id]);
  await run(`DELETE FROM work_reports WHERE user_id = ?`, [repUser.id]);

  // 1. Photos
  const punchInPhoto = createSamplePhoto('selfie-in-rohit.svg', 'PUNCH-IN VERIFIED (Rohit Patel)', '#10b981');
  const punchOutPhoto = createSamplePhoto('selfie-out-rohit.svg', 'PUNCH-OUT VERIFIED (Rohit Patel)', '#f59e0b');
  const visitPhoto = createSamplePhoto('visit-apollo.svg', 'SITE VISIT: Apollo Health HQ', '#6366f1');

  // 2. Attendance
  const attendanceId = uuidv4();
  const punchInTime = new Date();
  punchInTime.setHours(9, 15, 0, 0);

  const punchOutTime = new Date();
  punchOutTime.setHours(17, 45, 0, 0);

  const totalHours = 8.5;

  await run(
    `INSERT INTO attendances (
      id, user_id, date, punch_in_time, punch_in_lat, punch_in_lng, punch_in_address, punch_in_photo,
      punch_out_time, punch_out_lat, punch_out_lng, punch_out_address, punch_out_photo, total_hours, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attendanceId,
      repUser.id,
      today,
      punchInTime.toISOString(),
      28.4595,
      77.0266,
      'Sector 29, Cyber City Hub, Gurgaon, Haryana',
      punchInPhoto,
      punchOutTime.toISOString(),
      28.4682,
      77.0345,
      'MG Road Metro Station, Gurgaon, Haryana',
      punchOutPhoto,
      totalHours,
      'PRESENT'
    ]
  );

  // 3. Location Pings
  const pings = [
    { lat: 28.4595, lng: 77.0266, time: 9.3, speed: 4.2 },
    { lat: 28.4612, lng: 77.0289, time: 9.6, speed: 6.5 },
    { lat: 28.4650, lng: 77.0310, time: 10.0, speed: 0.1 }, // stopped at Apollo
    { lat: 28.4652, lng: 77.0312, time: 11.2, speed: 0.0 }, // still at Apollo
    { lat: 28.4710, lng: 77.0420, time: 12.0, speed: 5.8 }, // transit
    { lat: 28.4780, lng: 77.0510, time: 13.5, speed: 0.2 }, // stopped at Fortis
    { lat: 28.4781, lng: 77.0512, time: 15.0, speed: 0.1 },
    { lat: 28.4682, lng: 77.0345, time: 17.7, speed: 0.0 }  // punch out
  ];

  for (const p of pings) {
    const t = new Date();
    const hours = Math.floor(p.time);
    const minutes = Math.floor((p.time - hours) * 60);
    t.setHours(hours, minutes, 0, 0);

    await run(
      `INSERT INTO location_pings (user_id, attendance_id, latitude, longitude, accuracy, speed, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [repUser.id, attendanceId, p.lat, p.lng, 8.5, p.speed, t.toISOString()]
    );
  }

  // 4. Timeline Stops (Dwell times)
  const stop1Time = new Date();
  stop1Time.setHours(10, 0, 0, 0);
  const stop1Depart = new Date();
  stop1Depart.setHours(11, 30, 0, 0);

  await run(
    `INSERT INTO timeline_stops (
      id, user_id, attendance_id, location_name, address, latitude, longitude, arrived_at, departed_at, dwell_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      repUser.id,
      attendanceId,
      'Apollo Healthcare Headquarters',
      'Plot 42, Sector 32, Institutional Area, Gurgaon',
      28.4650,
      77.0310,
      stop1Time.toISOString(),
      stop1Depart.toISOString(),
      90
    ]
  );

  const stop2Time = new Date();
  stop2Time.setHours(13, 30, 0, 0);
  const stop2Depart = new Date();
  stop2Depart.setHours(15, 15, 0, 0);

  await run(
    `INSERT INTO timeline_stops (
      id, user_id, attendance_id, location_name, address, latitude, longitude, arrived_at, departed_at, dwell_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      repUser.id,
      attendanceId,
      'Fortis Med Distribution Center',
      'Tower B, Sector 44 Commercial Hub, Gurgaon',
      28.4780,
      77.0510,
      stop2Time.toISOString(),
      stop2Depart.toISOString(),
      105
    ]
  );

  // 5. Work Reports
  const report1Time = new Date();
  report1Time.setHours(11, 20, 0, 0);

  await run(
    `INSERT INTO work_reports (
      id, user_id, attendance_id, client_name, client_address, meeting_type, notes, deal_value, visit_photo, status, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [
      uuidv4(),
      repUser.id,
      attendanceId,
      'Apollo Healthcare Corp',
      'Plot 42, Sector 32, Gurgaon',
      'Product Demo & Pitch',
      'Met with Dr. Sharma (Head of Procurement). Demonstrated CRM features and tablet reporting. Client expressed high interest and requested proposal for 25 licenses.',
      14500.00,
      visitPhoto,
      report1Time.toISOString()
    ]
  );

  const report2Time = new Date();
  report2Time.setHours(15, 0, 0, 0);

  await run(
    `INSERT INTO work_reports (
      id, user_id, attendance_id, client_name, client_address, meeting_type, notes, deal_value, visit_photo, status, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?)`,
    [
      uuidv4(),
      repUser.id,
      attendanceId,
      'Fortis Med Distribution',
      'Tower B, Sector 44, Gurgaon',
      'Order Booking & Contract',
      'Closed annual renewal contract for pharma dispatch tracking. Cheque handed over for Q1 retainer.',
      8200.00,
      visitPhoto,
      report2Time.toISOString()
    ]
  );

  console.log('Demo data successfully seeded for Rohit Patel (rep@salescrm.com)!');
  process.exit(0);
};

seed();
