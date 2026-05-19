// =========================
// 🚗 Drivers Routes (Production-Level)
// JWT-protected with input validation
// =========================
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Add driver (protected)
router.post('/add-driver', authenticateAdmin, (req, res) => {
  const { name, phone, license_number, address } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'Name and phone are required' });
  }

  // Validate phone format
  const cleanPhone = phone.toString().trim().replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    return res.status(400).json({ success: false, message: 'Please provide a valid phone number' });
  }

  const sql = 'INSERT INTO drivers (name, phone, license_number, address) VALUES (?, ?, ?, ?)';
  db.query(sql, [
    name.toString().trim().substring(0, 100),
    phone.toString().trim().substring(0, 20),
    (license_number || '').toString().trim().substring(0, 50),
    (address || '').toString().trim().substring(0, 500)
  ], (err, result) => {
    if (err) {
      console.error('Error adding driver:', err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Driver added successfully', id: result.insertId });
  });
});

// Get all drivers (protected)
router.get('/', authenticateAdmin, (req, res) => {
  db.query('SELECT * FROM drivers ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    res.json(results);
  });
});

// Get single driver (protected)
router.get('/get/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid driver ID' });
  }

  db.query('SELECT * FROM drivers WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Error retrieving driver' });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'Driver not found' });
    res.json({ success: true, driver: results[0] });
  });
});

// Update driver (protected)
router.put('/update/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid driver ID' });
  }

  const { name, phone, license_number, address } = req.body;
  
  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'Name and phone are required' });
  }

  const sql = 'UPDATE drivers SET name = ?, phone = ?, license_number = ?, address = ? WHERE id = ?';
  db.query(sql, [
    name.toString().trim().substring(0, 100),
    phone.toString().trim().substring(0, 20),
    (license_number || '').toString().trim().substring(0, 50),
    (address || '').toString().trim().substring(0, 500),
    id
  ], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Driver not found' });
    res.json({ success: true, message: 'Driver updated' });
  });
});

// Delete driver (protected)
router.delete('/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid driver ID' });
  }

  db.query('DELETE FROM drivers WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'DB delete error' });
    res.json({ success: true, message: 'Driver deleted' });
  });
});

module.exports = router;
