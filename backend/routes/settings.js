const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// GET settings (public/any logged-in user can view settings like payment_cycle)
router.get('/', (req, res) => {
  db.query('SELECT setting_key, setting_value FROM settings', (err, results) => {
    if (err) {
      console.error('Error fetching settings:', err);
      return res.status(500).json({ success: false, message: 'Server error fetching settings' });
    }
    
    const settings = {};
    results.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    res.json({ success: true, settings });
  });
});

// PUT update a specific setting (Admin only)
router.put('/:key', authenticateAdmin, (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  
  if (!value && value !== '') {
    return res.status(400).json({ success: false, message: 'Value is required' });
  }
  
  // Insert or update the setting
  const sql = `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?`;
  db.query(sql, [key, value, value], (err, result) => {
    if (err) {
      console.error('Error updating setting:', err);
      return res.status(500).json({ success: false, message: 'Server error updating setting' });
    }
    
    res.json({ success: true, message: `Setting ${key} updated successfully` });
  });
});

module.exports = router;
