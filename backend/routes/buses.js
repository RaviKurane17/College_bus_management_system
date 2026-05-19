// =========================
// 🚌 Buses Routes (Production-Level)
// JWT-protected with input validation
// =========================
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Get single bus (protected)
router.get('/get/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid bus ID' });
  }

  const sql = `
    SELECT b.*, d.name AS driver_name, d.phone AS driver_phone 
    FROM buses b 
    LEFT JOIN drivers d ON b.driver_id = d.id 
    WHERE b.id = ?
  `;
  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error('❌ Database error getting bus:', err.message);
      return res.status(500).json({ success: false, message: 'Error retrieving bus data' });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Bus not found' });
    }
    res.json({ success: true, bus: results[0] });
  });
});

// Update bus (protected) - FIXED: single update route, fixed undefined driver_id bug
router.put('/update/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid bus ID' });
  }

  const { bus_number, driver_id, capacity, route } = req.body;

  if (!bus_number) {
    return res.status(400).json({ success: false, message: 'Bus number is required' });
  }

  // Check for duplicate bus number (excluding current bus)
  db.query('SELECT id FROM buses WHERE bus_number = ? AND id != ?', [bus_number.trim(), id], (err, result) => {
    if (err) {
      console.error('❌ Database error checking duplicates:', err.message);
      return res.status(500).json({ success: false, message: 'Error checking for duplicate bus number' });
    }
    
    if (result.length > 0) {
      return res.status(400).json({ success: false, message: 'Bus number already exists' });
    }

    const sql = `UPDATE buses SET bus_number = ?, driver_id = ?, capacity = ?, route = ? WHERE id = ?`;
    const values = [
      bus_number.toString().trim().substring(0, 20),
      driver_id ? parseInt(driver_id) : null, 
      parseInt(capacity) || 0,
      (route || '').toString().trim().substring(0, 255),
      id
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error('❌ Database error updating bus:', err.message);
        return res.status(500).json({ success: false, message: 'Error updating bus' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Bus not found' });
      }
      res.json({ success: true, message: 'Bus updated successfully' });
    });
  });
});

// Add bus (protected)
router.post('/add-bus', authenticateAdmin, (req, res) => {
  const { bus_number, driver_id, capacity, route } = req.body || {};
  
  if (!bus_number) {
    return res.status(400).json({ success: false, message: 'Bus number is required' });
  }
  
  // Validate bus number format
  if (!/^[A-Za-z0-9- ]+$/.test(bus_number)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Bus number can only contain letters, numbers, spaces, and hyphens' 
    });
  }

  const capacityNum = parseInt(capacity);
  if (isNaN(capacityNum) || capacityNum < 0) {
    return res.status(400).json({ success: false, message: 'Capacity must be a non-negative number' });
  }

  // Check for duplicate bus number
  db.query('SELECT id FROM buses WHERE bus_number = ?', [bus_number.trim()], (err, result) => {
    if (err) {
      console.error('❌ Database error checking duplicates:', err.message);
      return res.status(500).json({ success: false, message: 'Error checking for duplicate bus number' });
    }
    
    if (result.length > 0) {
      return res.status(400).json({ success: false, message: 'Bus number already exists' });
    }

    const sql = 'INSERT INTO buses (bus_number, driver_id, capacity, route) VALUES (?, ?, ?, ?)';
    db.query(sql, [
      bus_number.toString().trim().substring(0, 20),
      driver_id ? parseInt(driver_id) : null,
      capacityNum,
      (route || '').toString().trim().substring(0, 255)
    ], (err, result) => {
      if (err) {
        console.error('❌ Database error inserting bus:', err.message);
        return res.status(500).json({ success: false, message: 'Error adding bus to database' });
      }
      res.json({ success: true, message: 'Bus added successfully', id: result.insertId });
    });
  });
});

// Get all buses (protected)
router.get('/', authenticateAdmin, (req, res) => {
  const sql = `
    SELECT b.*, d.name AS driver_name, d.phone AS driver_phone 
    FROM buses b 
    LEFT JOIN drivers d ON b.driver_id = d.id 
    ORDER BY b.id DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    res.json(results);
  });
});

// Get students for a specific bus (protected)
router.get('/:id/students', authenticateAdmin, (req, res) => {
  const bus_id = parseInt(req.params.id);
  if (isNaN(bus_id)) {
    return res.status(400).json({ success: false, message: 'Invalid bus ID' });
  }

  const sql = `
    SELECT id, name, roll_no, department, course_year, section, fees_paid, remaining_fees 
    FROM students 
    WHERE bus_id = ? 
    ORDER BY name ASC
  `;
  db.query(sql, [bus_id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    res.json({ success: true, students: results });
  });
});

// Delete bus (protected)
router.delete('/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid bus ID' });
  }

  db.query('DELETE FROM buses WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'DB delete error' });
    res.json({ success: true, message: 'Bus deleted' });
  });
});

module.exports = router;
