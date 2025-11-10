const express = require('express');
const router = express.Router();
const db = require('../db');

// Simple login for admin (plaintext password in DB for this simple project)
// In production, use hashed passwords (bcrypt) and proper sessions/JWT.
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, message: 'Missing username/password' });

  db.query('SELECT * FROM admins WHERE username = ? AND password = ?', [username, password], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    if (results.length > 0) {
      // For simplicity we just return success. Frontend stores a flag in localStorage.
      return res.json({ success: true, message: 'Login success' });
    } else {
      return res.json({ success: false, message: 'Invalid credentials' });
    }
  });
});

module.exports = router;
