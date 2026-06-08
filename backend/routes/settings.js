const express = require('express');
const router = express.Router();
const db = require('../db');
const promisePool = db.promise;
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

// GET /fy-columns — Return list of all FY columns (archived + current)
router.get('/fy-columns', (req, res) => {
  db.query("SELECT setting_value FROM settings WHERE setting_key IN ('fy_columns','current_fy')", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Error fetching FY columns' });
    
    let fyColumns = [];
    let currentFy = '2026-27';
    results.forEach(row => {
      // We don't know which key each row is, so parse both
    });
    
    // Fetch properly
    db.query("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('fy_columns','current_fy')", (err2, rows) => {
      if (!err2) {
        rows.forEach(r => {
          if (r.setting_key === 'fy_columns') {
            try { fyColumns = JSON.parse(r.setting_value || '[]'); } catch(e) { fyColumns = []; }
          }
          if (r.setting_key === 'current_fy') currentFy = r.setting_value || '2026-27';
        });
      }
      res.json({ success: true, fyColumns, currentFy });
    });
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

// ============================
// POST /fy-rollover — Start a New Financial Year (Super Admin only)
// ============================
router.post('/fy-rollover', authenticateAdmin, async (req, res) => {
  try {
    // Only super_admin can perform rollover
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can perform FY rollover' });
    }

    const { confirmation } = req.body;
    if (confirmation !== 'ROLLOVER') {
      return res.status(400).json({ success: false, message: 'Type ROLLOVER to confirm' });
    }

    // 1. Get current FY and existing FY columns
    const [settingsRows] = await promisePool.query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('current_fy','fy_columns')"
    );
    
    let currentFy = '2026-27';
    let fyColumns = [];
    settingsRows.forEach(r => {
      if (r.setting_key === 'current_fy') currentFy = r.setting_value || '2026-27';
      if (r.setting_key === 'fy_columns') {
        try { fyColumns = JSON.parse(r.setting_value || '[]'); } catch(e) { fyColumns = []; }
      }
    });

    // 2. Create column name from current FY (e.g., "2026-27" → "fees_26_27")
    const colName = 'fees_' + currentFy.replace('-', '_');
    
    // Check if column already exists (prevent double rollover)
    if (fyColumns.includes(colName)) {
      return res.status(400).json({ 
        success: false, 
        message: `FY ${currentFy} has already been rolled over. Column "${colName}" already exists.` 
      });
    }

    // 3. Add new column to students table
    await promisePool.query(
      `ALTER TABLE students ADD COLUMN \`${colName}\` DECIMAL(10,2) DEFAULT 0`
    ).catch(e => {
      // Column might already exist from a failed previous attempt
      if (!e.message.includes('Duplicate column')) throw e;
    });

    // 4. Copy current_fees → new column for all students
    await promisePool.query(
      `UPDATE students SET \`${colName}\` = current_fees`
    );

    // 5. Reset current_fees and fees_paid for new year
    await promisePool.query(
      `UPDATE students SET current_fees = 0, fees_paid = 0`
    );

    // 6. Recalculate total_fees and remaining_fees
    // total_fees = old_bus_fees + SUM(all archived FY cols) + current_fees - discount_amount
    // Build the SUM expression dynamically
    const allFyCols = [...fyColumns, colName];
    const fySum = allFyCols.map(c => `COALESCE(\`${c}\`, 0)`).join(' + ');
    
    await promisePool.query(
      `UPDATE students SET 
        total_fees = GREATEST(0, COALESCE(old_bus_fees, 0) + ${fySum} + COALESCE(current_fees, 0) - COALESCE(discount_amount, 0)),
        remaining_fees = GREATEST(0, COALESCE(old_bus_fees, 0) + ${fySum} + COALESCE(current_fees, 0) - COALESCE(discount_amount, 0) - COALESCE(fees_paid, 0))`
    );

    // 7. Calculate next FY (e.g., "2026-27" → "2027-28")
    const parts = currentFy.split('-');
    const startYear = parseInt(parts[0]);
    const nextFy = `${startYear + 1}-${parseInt(parts[1]) + 1}`;

    // 8. Update settings
    fyColumns.push(colName);
    await promisePool.query(
      "UPDATE settings SET setting_value = ? WHERE setting_key = 'fy_columns'",
      [JSON.stringify(fyColumns)]
    );
    await promisePool.query(
      "UPDATE settings SET setting_value = ? WHERE setting_key = 'current_fy'",
      [nextFy]
    );
    await promisePool.query(
      "UPDATE settings SET setting_value = ? WHERE setting_key = 'fee_year'",
      [nextFy]
    );
    await promisePool.query(
      "UPDATE settings SET setting_value = ? WHERE setting_key = 'academic_year'",
      [nextFy]
    );

    // 9. Log the rollover
    console.log(`✅ FY Rollover complete: ${currentFy} → ${nextFy}. Column "${colName}" created.`);

    res.json({ 
      success: true, 
      message: `FY Rollover successful! ${currentFy} archived as "${colName}". New FY: ${nextFy}`,
      archivedColumn: colName,
      newFy: nextFy,
      allFyColumns: fyColumns
    });

  } catch (error) {
    console.error('FY Rollover error:', error);
    res.status(500).json({ success: false, message: 'Rollover failed: ' + error.message });
  }
});

module.exports = router;

