// =========================
// 🛡️ Admin Routes (Production-Level)
// Protected with JWT authentication
// Super Admin can manage other admins
// =========================
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { authenticateAdmin, authenticateSuperAdmin } = require('../middleware/auth');

// Admin login (kept for backward compatibility, main login is /api/login)
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Missing username/password' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
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

// Get dashboard statistics (protected) — Client-Wise Structure
router.get('/stats', authenticateAdmin, (req, res) => {
  const stats = {
    totalBuses: 0,
    totalStudents: 0,
    totalFeesCollected: 0,
    totalRemainingFees: 0,
    totalOldFees: 0,
    totalCurrentFees: 0,
    totalGrandFees: 0,
    overdueStudents: 0,
    activeStudents: 0,
    passoutStudents: 0,
    schoolLeftStudents: 0,
    totalDrivers: 0,
    busWiseStats: [],
    classWiseStats: []
  };

  const fy = req.query.fy || 'ALL';
  let dateFilter = '';
  if (fy === 'OLD') {
    dateFilter = " WHERE joining_date < '2026-04-01 00:00:00' ";
  } else if (fy === 'FY_2027') {
    dateFilter = " WHERE joining_date >= '2026-04-01 00:00:00' AND joining_date <= '2027-03-31 23:59:59' ";
  } else if (fy === 'FY_2028') {
    dateFilter = " WHERE joining_date >= '2027-04-01 00:00:00' AND joining_date <= '2028-03-31 23:59:59' ";
  }

  db.query('SELECT COUNT(*) as count FROM buses', (err, busResults) => {
    if (!err && busResults.length > 0) stats.totalBuses = busResults[0].count;

    db.query('SELECT COUNT(*) as count FROM drivers', (err, driverResults) => {
      if (!err && driverResults.length > 0) stats.totalDrivers = driverResults[0].count;

    db.query(`SELECT
        COUNT(*) as total,
        SUM(fees_paid) as paid,
        SUM(remaining_fees) as remaining,
        SUM(old_bus_fees) as old_fees,
        SUM(current_fees) as curr_fees,
        SUM(total_fees) as grand_total,
        SUM(CASE WHEN student_status='active'      THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN student_status='passout'     THEN 1 ELSE 0 END) as passout_count,
        SUM(CASE WHEN student_status='school_left' THEN 1 ELSE 0 END) as left_count
      FROM students ${dateFilter}`, (err, sr) => {
      if (!err && sr.length > 0) {
        stats.totalStudents       = sr[0].total || 0;
        stats.totalFeesCollected  = sr[0].paid || 0;
        stats.totalRemainingFees  = sr[0].remaining || 0;
        stats.totalOldFees        = sr[0].old_fees || 0;
        stats.totalCurrentFees    = sr[0].curr_fees || 0;
        stats.totalGrandFees      = sr[0].grand_total || 0;
        stats.activeStudents      = sr[0].active_count || 0;
        stats.passoutStudents     = sr[0].passout_count || 0;
        stats.schoolLeftStudents  = sr[0].left_count || 0;
      }

      db.query(`SELECT COUNT(*) as count FROM students ${dateFilter ? dateFilter + ' AND remaining_fees > 0' : 'WHERE remaining_fees > 0'}`, (err, overdueResults) => {
        if (!err && overdueResults.length > 0) stats.overdueStudents = overdueResults[0].count;

        db.query(`SELECT
            b.bus_number, b.route,
            COUNT(s.id) as student_count,
            SUM(s.fees_paid) as collected,
            SUM(s.remaining_fees) as remaining,
            SUM(s.old_bus_fees) as old_fees,
            SUM(s.current_fees) as current_fees
          FROM buses b
          LEFT JOIN students s ON s.bus_id = b.id ${dateFilter ? dateFilter.replace('WHERE', 'AND') : ''}
          GROUP BY b.id, b.bus_number, b.route
          ORDER BY b.bus_number`, (err, busStats) => {
          if (!err) stats.busWiseStats = busStats;

          db.query(`SELECT class_name, COUNT(*) as count, SUM(remaining_fees) as pending FROM students ${dateFilter} GROUP BY class_name ORDER BY class_name`, (err, classResults) => {
            if (!err) stats.classWiseStats = classResults;
            res.json({ success: true, stats });
          });
        });
      });
    });
    });
  });
});

// ============================
// Get current admin info (protected)
// ============================
router.get('/me', authenticateAdmin, (req, res) => {
  db.query('SELECT id, username, email, role, created_at FROM admins WHERE id = ?', [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'Admin not found' });
    res.json({ success: true, admin: results[0] });
  });
});

// ============================
// SUPER ADMIN: List all admins
// ============================
router.get('/list', authenticateSuperAdmin, (req, res) => {
  db.query('SELECT id, username, email, role, created_at FROM admins ORDER BY created_at DESC', (err, results) => {
    if (err) {
      console.error('❌ DB Error listing admins:', err.message);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, admins: results });
  });
});

// ============================
// SUPER ADMIN: Create new admin
// ============================
router.post('/create', authenticateSuperAdmin, async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ success: false, message: 'Username, password and email are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }

    // Check for duplicates
    db.query('SELECT id FROM admins WHERE username = ? OR email = ?', [username.trim(), email.trim()], async (err, results) => {
      if (err) {
        console.error('❌ DB Error checking duplicates:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (results.length > 0) {
        return res.status(400).json({ success: false, message: 'Username or email already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      db.query(
        'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
        [username.trim(), hashedPassword, email.trim(), 'admin'],
        (err, result) => {
          if (err) {
            console.error('❌ DB Error creating admin:', err.message);
            if (err.code === 'ER_DUP_ENTRY') {
              return res.status(400).json({ success: false, message: 'Username or email already exists' });
            }
            return res.status(500).json({ success: false, message: 'Error creating admin' });
          }
          console.log('✅ New admin created:', username);
          res.json({ success: true, message: 'Admin created successfully', id: result.insertId });
        }
      );
    });
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =========================
// 🚀 EMERGENCY SETUP ROUTE (For Vercel/Serverless)
// =========================
router.get('/setup', async (req, res) => {
  try {
    const [admins] = await db.promise.query('SELECT * FROM admins WHERE role = ?', ['super_admin']);
    if (admins.length > 0) {
      return res.json({ success: true, message: 'Super admin already exists.' });
    }
    
    const hashedPassword = await bcrypt.hash('SuperAdmin@2024', 12);
    
    // Check if the email is already in use by a regular admin
    const [existing] = await db.promise.query('SELECT * FROM admins WHERE email = ?', ['ravikurane12@gmail.com']);
    
    if (existing.length > 0) {
      // Upgrade existing admin to super admin
      await db.promise.query(
        'UPDATE admins SET username = ?, password = ?, role = ? WHERE email = ?',
        ['superadmin', hashedPassword, 'super_admin', 'ravikurane12@gmail.com']
      );
      return res.json({ success: true, message: 'Existing admin upgraded to Super Admin! You can now log in.' });
    } else {
      // Insert new super admin
      await db.promise.query(
        'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
        ['superadmin', hashedPassword, 'ravikurane12@gmail.com', 'super_admin']
      );
      return res.json({ success: true, message: 'Super admin created successfully! You can now log in.' });
    }
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ success: false, message: 'Failed to create super admin: ' + error.message });
  }
});

// =========================
// 🔐 Auth Middleware
// ============================
// ============================
// SUPER ADMIN: Update admin
// ============================
router.put('/update/:id', authenticateSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid admin ID' });
  }

  const { username, email, password } = req.body;

  if (!username || !email) {
    return res.status(400).json({ success: false, message: 'Username and email are required' });
  }

  try {
    // Check for duplicates (excluding current admin)
    db.query('SELECT id FROM admins WHERE (username = ? OR email = ?) AND id != ?', 
      [username.trim(), email.trim(), id], 
      async (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (results.length > 0) {
          return res.status(400).json({ success: false, message: 'Username or email already taken' });
        }

        let sql, values;
        if (password && password.length >= 6) {
          const hashedPassword = await bcrypt.hash(password, 12);
          sql = 'UPDATE admins SET username = ?, email = ?, password = ? WHERE id = ? AND role != ?';
          values = [username.trim(), email.trim(), hashedPassword, id, 'super_admin'];
        } else {
          sql = 'UPDATE admins SET username = ?, email = ? WHERE id = ? AND role != ?';
          values = [username.trim(), email.trim(), id, 'super_admin'];
        }

        db.query(sql, values, (err, result) => {
          if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
              return res.status(400).json({ success: false, message: 'Username or email already exists' });
            }
            return res.status(500).json({ success: false, message: 'Error updating admin' });
          }
          if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Admin not found or cannot modify super admin' });
          }
          res.json({ success: true, message: 'Admin updated successfully' });
        });
      }
    );
  } catch (error) {
    console.error('❌ Error updating admin:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================
// SUPER ADMIN: Delete admin
// ============================
router.delete('/delete/:id', authenticateSuperAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid admin ID' });
  }

  // Prevent deleting super admin
  db.query('SELECT role FROM admins WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'Admin not found' });
    if (results[0].role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete super admin account' });
    }

    db.query('DELETE FROM admins WHERE id = ? AND role != ?', [id, 'super_admin'], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Error deleting admin' });
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Admin not found' });
      res.json({ success: true, message: 'Admin deleted successfully' });
    });
  });
});

module.exports = router;
