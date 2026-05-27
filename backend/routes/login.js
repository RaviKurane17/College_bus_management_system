// =========================
// 🔐 Login Route (Production-Level)
// JWT Authentication with bcrypt password verification
// =========================
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Login API for admin or student
router.post('/', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Input validation
    if (!username || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Username, password and role are required'
      });
    }

    // Sanitize role
    if (!['admin', 'student'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role'
      });
    }

    if (role === 'admin') {
      // Admin login: can use username or email
      db.query(
        'SELECT * FROM admins WHERE username = ? OR email = ?',
        [username, username],
        async (err, results) => {
          if (err) {
            console.error('❌ DB Error (admin login):', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
          }

          if (!results || results.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
          }

          const admin = results[0];

          // Compare password with bcrypt hash
          const isMatch = await bcrypt.compare(password, admin.password);
          if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
          }

          // Generate JWT token
          const token = jwt.sign(
            { id: admin.id, username: admin.username, role: admin.role || 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRY || '24h' }
          );

          return res.json({
            success: true,
            role: admin.role || 'admin',
            message: 'Login successful',
            token: token
          });
        }
      );
    } else if (role === 'student') {
      // Students login with email
      db.query(
        'SELECT * FROM students WHERE email = ?',
        [username],
        async (err, results) => {
          if (err) {
            console.error('❌ DB Error (student login):', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
          }

          if (!results || results.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
          }

          const student = results[0];

          // Compare password with bcrypt hash
          const isMatch = await bcrypt.compare(password, student.password);
          if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
          }

          // Generate JWT token
          const token = jwt.sign(
            { id: student.id, username: student.username, email: student.email, role: 'student' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRY || '24h' }
          );

          // Remove password from response
          const { password: _, ...studentData } = student;

          return res.json({
            success: true,
            role: 'student',
            student: studentData,
            message: 'Login successful',
            token: token
          });
        }
      );
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

module.exports = router;