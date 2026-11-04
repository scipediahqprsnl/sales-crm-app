const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { get, run, query } = require('../db');
const { JWT_SECRET, authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public User Registration (Manager or Field Representative)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();

    // Validate role
    const validRoles = ['BUSINESS_MANAGER', 'FIELD_REPRESENTATIVE'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role. Please select either Manager or Field Representative' 
      });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    // Check if user already exists
    const existing = await get(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await run(
      `INSERT INTO users (id, name, email, password, role, phone, manager_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, cleanName, cleanEmail, hashedPassword, role, phone ? phone.trim() : null, null]
    );

    // Sign JWT token
    const token = jwt.sign(
      {
        id: userId,
        name: cleanName,
        email: cleanEmail,
        role: role
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const newUser = {
      id: userId,
      name: cleanName,
      email: cleanEmail,
      role: role,
      phone: phone ? phone.trim() : null,
      manager_id: null
    };

    res.status(201).json({
      message: 'Account registered successfully',
      token,
      user: newUser
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.is_active === false || user.is_active === 0) {
      return res.status(403).json({ error: 'This employee account has been deactivated. Please contact your administrator.' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        manager_id: user.manager_id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Current User Profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await get(`SELECT id, name, email, role, phone, manager_id, created_at FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching user profile' });
  }
});

// Admin-only user creation
router.post('/users', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { name, email, password, role, phone, manager_id } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    const existing = await get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await run(
      `INSERT INTO users (id, name, email, password, role, phone, manager_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, email.toLowerCase().trim(), hashedPassword, role, phone || null, manager_id || null]
    );

    res.status(201).json({
      message: 'User created successfully',
      user: { id: userId, name, email, role, phone, manager_id }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error creating user' });
  }
});

// List all users (For Admin and Manager team views)
router.get('/users', authenticateToken, requireRole(['ADMIN', 'BUSINESS_MANAGER']), async (req, res) => {
  try {
    let users;
    if (req.user.role === 'ADMIN') {
      users = await query(`SELECT id, name, email, role, phone, manager_id, is_active, created_at FROM users ORDER BY created_at DESC`);
    } else {
      // Manager can view themselves and reps assigned to them
      users = await query(
        `SELECT id, name, email, role, phone, manager_id, is_active, created_at FROM users WHERE manager_id = ? OR id = ?`,
        [req.user.id, req.user.id]
      );
    }
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching users' });
  }
});

// Admin-only employee deactivation / soft-delete:
// Revokes login immediately but 100% PRESERVES past attendance, reports, and GPS timeline data!
router.delete('/users/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (req.user.id === id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account' });
    }

    const targetUser = await get(`SELECT id, name, email, role FROM users WHERE id = ?`, [id]);
    if (!targetUser) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Unlink any subordinates who reported to this manager
    await run(`UPDATE users SET manager_id = NULL WHERE manager_id = ?`, [id]);

    // Soft-delete: Disable login & mark inactive, DO NOT delete past work logs or attendance records!
    await run(`UPDATE users SET is_active = false WHERE id = ?`, [id]);

    res.json({ 
      message: `Employee "${targetUser.name}" has been removed. Login is disabled, but all past work logs and attendance records are permanently preserved.` 
    });
  } catch (error) {
    console.error('Deactivate employee error:', error);
    res.status(500).json({ error: error.message || 'Server error deactivating employee' });
  }
});

// Admin-only employee reactivation
router.patch('/users/:id/reactivate', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await get(`SELECT id, name FROM users WHERE id = ?`, [id]);
    if (!targetUser) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    await run(`UPDATE users SET is_active = true WHERE id = ?`, [id]);
    res.json({ message: `Employee "${targetUser.name}" reactivated successfully` });
  } catch (error) {
    res.status(500).json({ error: 'Server error reactivating employee' });
  }
});

module.exports = router;
