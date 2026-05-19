// =========================
// 🛡️ Admin Routes (Production-Level)
// Protected with JWT authentication
// =========================
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { authenticateAdmin } = require('../middleware/auth');

// Admin login (kept for backward compatibility, main login is /api/login)
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Missing username/password' });
  }

  db.query('SELECT * FROM admins WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    if (results.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const admin = results[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    return res.json({ success: true, message: 'Login success' });
  });
});

// Get dashboard statistics (protected)
router.get('/stats', authenticateAdmin, (req, res) => {
  const stats = {
    totalBuses: 0,
    totalStudents: 0,
    totalDrivers: 0,
    totalFeesCollected: 0,
    totalRemainingFees: 0,
    overdueStudents: 0
  };

  db.query('SELECT COUNT(*) as count FROM buses', (err, busResults) => {
    if (!err && busResults.length > 0) stats.totalBuses = busResults[0].count;

    db.query('SELECT COUNT(*) as count FROM drivers', (err, driverResults) => {
      if (!err && driverResults.length > 0) stats.totalDrivers = driverResults[0].count;

      db.query('SELECT COUNT(*) as count, SUM(fees_paid) as paid, SUM(remaining_fees) as remaining FROM students', (err, studentResults) => {
        if (!err && studentResults.length > 0) {
          stats.totalStudents = studentResults[0].count;
          stats.totalFeesCollected = studentResults[0].paid || 0;
          stats.totalRemainingFees = studentResults[0].remaining || 0;
        }
        
        db.query('SELECT COUNT(*) as count FROM students WHERE remaining_fees > 0', (err, overdueResults) => {
          if (!err && overdueResults.length > 0) stats.overdueStudents = overdueResults[0].count;
          res.json({ success: true, stats });
        });
      });
    });
  });
});

module.exports = router;
