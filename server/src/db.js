require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');

const isPostgres = !!(process.env.DATABASE_URL || process.env.DB_HOST);

let pool = null;
let sqliteDb = null;

if (isPostgres) {
  const { Pool } = require('pg');
  console.log('⚡ Initializing Supabase PostgreSQL connection pool...');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  pool.on('error', (err) => {
    console.error('Unexpected Supabase PostgreSQL error on idle client:', err);
  });
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.resolve(__dirname, '../crm.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Could not connect to SQLite database', err);
    else console.log('Connected to local SQLite database at', dbPath);
  });
}

// Convert SQLite '?' parameter placeholders to PostgreSQL '$1, $2, ...'
const convertPlaceholders = (sql) => {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
};

// Promisified query helper (returns array of rows)
const query = (sql, params = []) => {
  if (isPostgres) {
    const pgSql = convertPlaceholders(sql);
    return pool.query(pgSql, params).then((res) => res.rows);
  }
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

// Promisified get helper (returns single row or null)
const get = (sql, params = []) => {
  if (isPostgres) {
    const pgSql = convertPlaceholders(sql);
    return pool.query(pgSql, params).then((res) => res.rows[0] || null);
  }
  return new Promise((resolve, reject) => {
    sqliteDb.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
};

// Promisified run helper (returns { id, changes })
const run = (sql, params = []) => {
  if (isPostgres) {
    const pgSql = convertPlaceholders(sql);
    return pool.query(pgSql, params).then((res) => ({
      id: res.rows && res.rows[0] ? res.rows[0].id : null,
      changes: res.rowCount
    }));
  }
  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Initialize schema and seed demo accounts
const initDB = async () => {
  if (isPostgres) {
    console.log('🚀 Setting up Supabase PostgreSQL tables...');

    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('ADMIN', 'BUSINESS_MANAGER', 'FIELD_REPRESENTATIVE')) NOT NULL,
        phone TEXT,
        manager_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS attendances (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        punch_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
        punch_in_lat DOUBLE PRECISION,
        punch_in_lng DOUBLE PRECISION,
        punch_in_address TEXT,
        punch_in_photo TEXT,
        punch_out_time TIMESTAMP WITH TIME ZONE,
        punch_out_lat DOUBLE PRECISION,
        punch_out_lng DOUBLE PRECISION,
        punch_out_address TEXT,
        punch_out_photo TEXT,
        total_hours DOUBLE PRECISION DEFAULT 0,
        status TEXT DEFAULT 'PRESENT',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS location_pings (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        attendance_id TEXT,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        accuracy DOUBLE PRECISION,
        speed DOUBLE PRECISION,
        recorded_at TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS timeline_stops (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        attendance_id TEXT,
        location_name TEXT,
        address TEXT,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        arrived_at TIMESTAMP WITH TIME ZONE NOT NULL,
        departed_at TIMESTAMP WITH TIME ZONE NOT NULL,
        dwell_minutes INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS work_reports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        attendance_id TEXT,
        client_name TEXT NOT NULL,
        client_address TEXT,
        meeting_type TEXT,
        scheme TEXT,
        notes TEXT,
        deal_value DOUBLE PRECISION,
        visit_photo TEXT,
        status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'APPROVED',
        admin_remarks TEXT,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        reviewed_by TEXT,
        reviewed_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Ensure scheme column exists for existing tables
    try {
      await run(`ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS scheme TEXT`);
    } catch (err) {}

  } else {
    // Local SQLite schema fallback
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('ADMIN', 'BUSINESS_MANAGER', 'FIELD_REPRESENTATIVE')) NOT NULL,
        phone TEXT,
        manager_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS attendances (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        punch_in_time DATETIME NOT NULL,
        punch_in_lat REAL,
        punch_in_lng REAL,
        punch_in_address TEXT,
        punch_in_photo TEXT,
        punch_out_time DATETIME,
        punch_out_lat REAL,
        punch_out_lng REAL,
        punch_out_address TEXT,
        punch_out_photo TEXT,
        total_hours REAL DEFAULT 0,
        status TEXT DEFAULT 'PRESENT',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS location_pings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        attendance_id TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        speed REAL,
        recorded_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS timeline_stops (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        attendance_id TEXT,
        location_name TEXT,
        address TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        arrived_at DATETIME NOT NULL,
        departed_at DATETIME NOT NULL,
        dwell_minutes INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS work_reports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        attendance_id TEXT,
        client_name TEXT NOT NULL,
        client_address TEXT,
        meeting_type TEXT,
        scheme TEXT,
        notes TEXT,
        deal_value REAL,
        visit_photo TEXT,
        status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'APPROVED',
        admin_remarks TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_by TEXT,
        reviewed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    try {
      await run(`ALTER TABLE work_reports ADD COLUMN scheme TEXT`);
    } catch (err) {}
  }

  // Seed default demo accounts if not present
  const existingAdmin = await get(`SELECT id FROM users WHERE email = ?`, ['admin@salescrm.com']);
  if (!existingAdmin) {
    const adminPass = await bcrypt.hash('admin123', 10);
    const mgrPass = await bcrypt.hash('manager123', 10);
    const repPass = await bcrypt.hash('rep123', 10);

    await run(
      `INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)`,
      ['user-admin-1', 'Rajesh Sharma (Admin)', 'admin@salescrm.com', adminPass, 'ADMIN', '+91 98765 43210']
    );

    await run(
      `INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)`,
      ['user-mgr-1', 'Amit Verma (Manager)', 'manager@salescrm.com', mgrPass, 'BUSINESS_MANAGER', '+91 98765 11223']
    );

    await run(
      `INSERT INTO users (id, name, email, password, role, phone, manager_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['user-rep-1', 'Rohit Patel (Field Rep)', 'rep@salescrm.com', repPass, 'FIELD_REPRESENTATIVE', '+91 98765 99887', 'user-mgr-1']
    );

    console.log('✅ Default demo users seeded into database:');
    console.log(' - Admin: admin@salescrm.com / admin123');
    console.log(' - Manager: manager@salescrm.com / manager123');
    console.log(' - Field Rep: rep@salescrm.com / rep123');
  } else {
    console.log('✅ Supabase database already initialized with user accounts.');
  }
};

module.exports = {
  db: isPostgres ? pool : sqliteDb,
  pool,
  query,
  get,
  run,
  initDB,
  isPostgres
};
