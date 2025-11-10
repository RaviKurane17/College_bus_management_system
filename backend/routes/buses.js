const express = require('express');
const router = express.Router();
const db = require('../db');

// Get single bus
router.get('/get/:id', (req, res) => {
  const id = req.params.id;
  db.query('SELECT * FROM buses WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('❌ Database error getting bus:', err);
      return res.status(500).json({ success: false, message: 'Error retrieving bus data' });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Bus not found' });
    }
    res.json({ success: true, bus: results[0] });
  });
});

// Update bus
router.put('/update/:id', (req, res) => {
  const id = req.params.id;
  const { bus_number, driver_name, driver_phone, capacity, route } = req.body;

  // Validate bus number
  if (!bus_number) {
    return res.status(400).json({ success: false, message: 'Bus number is required' });
  }

  // Check for duplicate bus number (excluding current bus)
  db.query('SELECT id FROM buses WHERE bus_number = ? AND id != ?', [bus_number, id], (err, result) => {
    if (err) {
      console.error('❌ Database error checking duplicates:', err);
      return res.status(500).json({ success: false, message: 'Error checking for duplicate bus number' });
    }
    
    if (result.length > 0) {
      return res.status(400).json({ success: false, message: 'Bus number already exists' });
    }

    // Update bus
    const sql = `UPDATE buses SET bus_number = ?, driver_name = ?, driver_phone = ?, 
                 capacity = ?, route = ? WHERE id = ?`;
    const values = [bus_number, driver_name || '', driver_phone || '', 
                   parseInt(capacity) || 0, route || '', id];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error('❌ Database error updating bus:', err);
        return res.status(500).json({ success: false, message: 'Error updating bus' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Bus not found' });
      }
      res.json({ success: true, message: 'Bus updated successfully' });
    });
  });
});

// Add bus
router.post('/add-bus', (req, res) => {
  console.log('🚌 Add bus request received:', req.body);
  
  const { bus_number, driver_name, driver_phone, capacity, route } = req.body || {};
  
  // Validate bus number
  if (!bus_number) {
    return res.status(400).json({ success: false, message: 'Bus number is required' });
  }
  
  // Validate bus number format (alphanumeric and hyphen only)
  if (!/^[A-Za-z0-9-]+$/.test(bus_number)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Bus number can only contain letters, numbers, and hyphens' 
    });
  }

  // Validate capacity
  const capacityNum = parseInt(capacity);
  if (isNaN(capacityNum) || capacityNum < 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Capacity must be a non-negative number' 
    });
  }

  // Check for duplicate bus number
  db.query('SELECT id FROM buses WHERE bus_number = ?', [bus_number], (err, result) => {
    if (err) {
      console.error('❌ Database error checking duplicates:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking for duplicate bus number' 
      });
    }
    
    if (result.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bus number already exists' 
      });
    }

    // Insert new bus
    const sql = 'INSERT INTO buses (bus_number, driver_name, driver_phone, capacity, route) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [
      bus_number.trim(),
      (driver_name || '').trim(),
      (driver_phone || '').trim(),
      capacityNum,
      (route || '').trim()
    ], (err, result) => {
      if (err) {
        console.error('❌ Database error inserting bus:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Error adding bus to database' 
        });
      }
      console.log('✅ Bus added successfully:', { id: result.insertId, bus_number });
      res.json({ 
        success: true, 
        message: 'Bus added successfully', 
        id: result.insertId 
      });
    });
  });
});

// Get all buses
router.get('/', (req, res) => {
  db.query('SELECT * FROM buses ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    res.json(results);
  });
});

// Delete bus
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.query('DELETE FROM buses WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'DB delete error' });
    res.json({ success: true, message: 'Bus deleted' });
  });
});

// Update bus
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const { bus_number, driver_name, driver_phone, capacity, route } = req.body || {};

  if (!bus_number) {
    return res.status(400).json({ success: false, message: 'bus_number required' });
  }

  // Check if bus exists
  db.query('SELECT id FROM buses WHERE id = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error checking bus' });
    }
    if (result.length === 0) {
      return res.status(404).json({ success: false, message: 'Bus not found' });
    }

    // Check if new bus_number conflicts with existing ones (except current bus)
    db.query('SELECT id FROM buses WHERE bus_number = ? AND id != ?', [bus_number, id], (err, result) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error checking duplicates' });
      }
      if (result.length > 0) {
        return res.status(400).json({ success: false, message: 'Bus number already exists' });
      }

      // Update bus
      db.query(
        'UPDATE buses SET bus_number = ?, driver_name = ?, driver_phone = ?, capacity = ?, route = ? WHERE id = ?',
        [bus_number, driver_name || '', driver_phone || '', capacity || 0, route || '', id],
        (err) => {
          if (err) {
            return res.status(500).json({ success: false, message: 'DB update error' });
          }
          res.json({ success: true, message: 'Bus updated' });
        }
      );
    });
  });
});

module.exports = router;
