// =========================
// 👨‍🎓 Students Routes
// Simple columns matching client Excel:
//   name | class_name | phone | bus_id | pick_up_point
//   old_bus_fees | current_fees | discount_amount
//   total_fees (=old+current+archived_fy-discount) | fees_paid | remaining_fees
//   student_status (active/passout/school_left)
// =========================
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const promisePool = db.promise;
const bcrypt  = require('bcryptjs');
const { sendEmail }                          = require('../utils/mailer');
const { authenticateAdmin, authenticateAny } = require('../middleware/auth');

// ─── Helper: Get archived FY columns from settings ─────────────────────────
async function getFyColumns() {
  try {
    const [rows] = await promisePool.query("SELECT setting_value FROM settings WHERE setting_key='fy_columns'");
    if (rows.length && rows[0].setting_value) {
      return JSON.parse(rows[0].setting_value);
    }
  } catch(e) { /* ignore */ }
  return [];
}

// ─── Compute totals from Excel fields + dynamic FY columns ──────────────────
function computeTotals(old_bus_fees, current_fees, discount_amount, fees_paid, fyColValues) {
  const old   = parseFloat(old_bus_fees    || 0);
  const curr  = parseFloat(current_fees    || 0);
  const disc  = parseFloat(discount_amount || 0);
  const paid  = parseFloat(fees_paid       || 0);
  // Sum all archived FY column values
  let fySum = 0;
  if (fyColValues && typeof fyColValues === 'object') {
    Object.values(fyColValues).forEach(v => { fySum += parseFloat(v || 0); });
  }
  const total = Math.max(0, old + fySum + curr - disc);
  return {
    total_fees:     total.toFixed(2),
    remaining_fees: Math.max(0, total - paid).toFixed(2)
  };
}

// ─── Derive student_status from class_name ────────────────────────────────────
function deriveStatus(class_name, explicit) {
  if (explicit && ['active','passout','school_left'].includes(explicit)) return explicit;
  if (!class_name) return 'active';
  const c = class_name.toLowerCase();
  if (c.includes('passout'))     return 'passout';
  if (c.includes('school left')) return 'school_left';
  return 'active';
}

// ============================
// GET all students
// Query params: ?status=active|passout|school_left  &bus_id=X
// ============================
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const fyColumns = await getFyColumns();
    const { status, bus_id } = req.query;
    
    // Build dynamic SELECT with FY columns
    let fyCols = '';
    if (fyColumns.length > 0) {
      fyCols = ', ' + fyColumns.map(c => `s.\`${c}\``).join(', ');
    }
    
    let sql = `SELECT s.*${fyCols}, b.bus_number, b.route FROM students s LEFT JOIN buses b ON s.bus_id=b.id`;
    const params = [], where = [];
    if (status) { where.push('s.student_status=?'); params.push(status); }
    if (bus_id) { where.push('s.bus_id=?');         params.push(bus_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY s.name';

    db.query(sql, params, (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Error retrieving students' });
      const data = results.map(({ password, reset_token, reset_token_expires, ...s }) => s);
      res.json(data);
    });
  } catch(e) {
    res.status(500).json({ success: false, message: 'Error: ' + e.message });
  }
});

// ============================
// GET single student by ID
// ============================
router.get('/get/:id', authenticateAny, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });
  db.query('SELECT s.*, b.bus_number, b.route, b.short_name, d.name as driver_name, d.phone as driver_phone FROM students s LEFT JOIN buses b ON s.bus_id=b.id LEFT JOIN drivers d ON b.driver_id=d.id WHERE s.id=?', [id],
    (err, results) => {
      if (err || !results.length) return res.status(404).json({ success: false, message: 'Student not found' });
      const s = results[0]; delete s.password; delete s.reset_token; delete s.reset_token_expires;
      res.json({ success: true, student: s });
    });
});

// ============================
// GET by identifier (username / phone / name)
// ============================
router.get('/profile/:identifier', authenticateAny, (req, res) => {
  const id = req.params.identifier.toString().trim().substring(0, 150);
  db.query('SELECT s.*, b.bus_number, b.route, b.short_name, d.name as driver_name, d.phone as driver_phone FROM students s LEFT JOIN buses b ON s.bus_id=b.id LEFT JOIN drivers d ON b.driver_id=d.id WHERE s.username=? OR s.phone=? OR s.email=? OR s.name=?',
    [id, id, id, id], (err, results) => {
      if (err || !results.length) return res.status(404).json({ success: false, message: 'Student not found' });
      const s = results[0]; delete s.password; delete s.reset_token; delete s.reset_token_expires;
      res.json({ success: true, student: s });
    });
});

// ============================
// POST add student (admin only)
// ============================
router.post('/add-student', authenticateAdmin, async (req, res) => {
  try {
    let {
      name, class_name, phone, email,
      bus_id, pick_up_point,
      old_bus_fees, current_fees, discount_amount, fees_paid,
      student_status,
      username, password
    } = req.body || {};

    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    // Auto-generate username from phone or name
    if (!username) username = phone
      ? phone.toString().trim()
      : name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '').substring(0, 30) + '.' + Date.now().toString().slice(-4);
    if (!password) password = '123456';

    const status = deriveStatus(class_name, student_status);
    const t = computeTotals(old_bus_fees, current_fees, discount_amount, fees_paid);

    // Check duplicate username
    db.query('SELECT id FROM students WHERE username=?', [username.trim()], async (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: 'DB error' });
      if (rows.length) return res.status(400).json({ success: false, message: 'Username already exists' });

      const hashed = await bcrypt.hash(password, 12);
      const sql = `INSERT INTO students
        (username, password, name, class_name, phone, email, bus_id, pick_up_point,
         old_bus_fees, current_fees, discount_amount, total_fees, fees_paid, remaining_fees,
         student_status, joining_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE())`;

      db.query(sql, [
        username.trim().substring(0, 100), hashed,
        name.trim().substring(0, 150),
        (class_name || '').trim().substring(0, 100),
        (phone || '').trim().substring(0, 20),
        (email || '').trim().substring(0, 100) || null,
        bus_id || null,
        (pick_up_point || '').trim().substring(0, 150),
        parseFloat(old_bus_fees  || 0).toFixed(2),
        parseFloat(current_fees  || 0).toFixed(2),
        parseFloat(discount_amount || 0).toFixed(2),
        t.total_fees,
        parseFloat(fees_paid || 0).toFixed(2),
        t.remaining_fees,
        status
      ], (err, result) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Username already exists' });
          return res.status(500).json({ success: false, message: 'Error adding student' });
        }
        res.json({ success: true, message: 'Student added successfully', id: result.insertId });
      });
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error: ' + e.message });
  }
});

// ============================
// PUT update student (admin only)
// ============================
router.put('/update/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

  const {
    name, class_name, phone, email, bus_id, pick_up_point,
    old_bus_fees, current_fees, discount_amount, fees_paid,
    student_status
  } = req.body;

  if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

  const status = deriveStatus(class_name, student_status);
  const t      = computeTotals(old_bus_fees, current_fees, discount_amount, fees_paid);

  db.query(`UPDATE students SET
    name=?, class_name=?, phone=?, email=?, bus_id=?, pick_up_point=?,
    old_bus_fees=?, current_fees=?, discount_amount=?,
    total_fees=?, fees_paid=?, remaining_fees=?, student_status=?
    WHERE id=?`,
    [
      name.trim().substring(0, 150),
      (class_name || '').trim().substring(0, 100),
      (phone || '').trim().substring(0, 20),
      (email || '').trim().substring(0, 100) || null,
      bus_id || null,
      (pick_up_point || '').trim().substring(0, 150),
      parseFloat(old_bus_fees  || 0).toFixed(2),
      parseFloat(current_fees  || 0).toFixed(2),
      parseFloat(discount_amount || 0).toFixed(2),
      t.total_fees,
      parseFloat(fees_paid || 0).toFixed(2),
      t.remaining_fees,
      status,
      id
    ], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Error updating student' });
      if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Student not found' });
      res.json({ success: true, message: 'Student updated' });
    });
});

// ============================
// POST pay fees (admin only)
// Records payment, updates fees_paid + remaining_fees
// ============================
router.post('/pay/:id', authenticateAdmin, (req, res) => {
  const sid = parseInt(req.params.id);
  if (isNaN(sid)) return res.status(400).json({ success: false, message: 'Invalid student ID' });

  const { amount, payment_mode, utr_number, notes } = req.body;
  if (!amount || isNaN(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Valid amount required' });
  if (!payment_mode) return res.status(400).json({ success: false, message: 'Payment mode required' });

  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');

  db.query(`INSERT INTO payments (student_id, amount, payment_mode, utr_number, receipt_number, notes)
    VALUES (?, ?, ?, ?, '', ?)`,
    [sid, parseFloat(amount).toFixed(2), payment_mode.substring(0,50), (utr_number||'').substring(0,100), (notes||'')],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Error recording payment' });

      const pid = result.insertId;
      const receipt = `REC-${dateStr}-${pid.toString().padStart(5,'0')}`;
      db.query('UPDATE payments SET receipt_number=? WHERE id=?', [receipt, pid]);

      db.query(`UPDATE students SET
          fees_paid      = fees_paid + ?,
          remaining_fees = GREATEST(0, total_fees - (fees_paid + ?))
          WHERE id=?`,
        [parseFloat(amount), parseFloat(amount), sid], (err) => {
          if (err) return res.status(500).json({ success: false, message: 'Error updating fees' });

          db.query('SELECT s.*, b.bus_number FROM students s LEFT JOIN buses b ON s.bus_id=b.id WHERE s.id=?', [sid],
            (err, rows) => {
              if (err || !rows.length) return res.status(500).json({ success: false, message: 'Error fetching student' });
              const s = rows[0]; delete s.password;
              res.json({
                success: true, message: 'Payment recorded',
                receipt_number: receipt, payment_id: pid, student: s,
                payment: { amount, payment_mode, utr_number, date: new Date(), receipt_number: receipt }
              });
            });
        });
    });
});

// ============================
// GET payment history for student
// ============================
router.get('/:id/payments', authenticateAny, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });
  db.query('SELECT * FROM payments WHERE student_id=? ORDER BY payment_date DESC', [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    res.json({ success: true, payments: results });
  });
});

// ============================
// PUT bulk reset all passwords (admin only)
// ============================
router.put('/bulk-reset-passwords', authenticateAdmin, async (req, res) => {
  try {
    const hashed = await bcrypt.hash('123456', 12);
    db.query('UPDATE students SET password=?', [hashed], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });
      res.json({ success: true, message: `Successfully reset passwords for ${result.affectedRows} students to 123456` });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================
// PUT reset student password (admin only)
// ============================
router.put('/reset-password/:id', authenticateAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });
  
  try {
    const hashed = await bcrypt.hash('123456', 12);
    db.query('UPDATE students SET password=? WHERE id=?', [hashed, id], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });
      res.json({ success: true, message: 'Password reset to 123456 successfully' });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================
// DELETE student
// ============================
router.delete('/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });
  db.query('DELETE FROM students WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Delete error' });
    res.json({ success: true, message: 'Student deleted' });
  });
});

// ============================
// Student login
// ============================
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password required' });
  db.query('SELECT * FROM students WHERE username=? OR phone=? OR email=?', [username, username, username], async (err, rows) => {
    if (err || !rows.length) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!await bcrypt.compare(password, rows[0].password)) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const { password:_, reset_token, reset_token_expires, ...data } = rows[0];
    res.json({ success: true, student: data });
  });
});

// ============================
// Reset password
// ============================
router.post('/reset-password', (req, res) => {
  const { username, phone } = req.body;
  const identifier = (username || phone || '').toString().trim();
  if (!identifier) return res.status(400).json({ success: false, message: 'Username or phone required' });
  db.query('SELECT id, username FROM students WHERE username=? OR phone=? OR email=?', [identifier, identifier, identifier], async (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ success: false, message: 'Student not found' });
    const newPass = Math.random().toString(36).slice(-8);
    await bcrypt.hash(newPass, 12).then(h => {
      db.query('UPDATE students SET password=? WHERE id=?', [h, rows[0].id]);
    });
    res.json({ success: true, message: 'Password reset', data: { username: rows[0].username, newPassword: newPass } });
  });
});

// ============================
// Change password
// ============================
router.post('/change-password', authenticateAny, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6)
    return res.status(400).json({ success: false, message: 'Valid old and new password required (min 6 chars)' });
  db.query('SELECT password FROM students WHERE id=?', [req.user.id], async (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ success: false, message: 'Student not found' });
    if (!await bcrypt.compare(oldPassword, rows[0].password))
      return res.status(401).json({ success: false, message: 'Incorrect old password' });
    db.query('UPDATE students SET password=? WHERE id=?',
      [await bcrypt.hash(newPassword, 12), req.user.id],
      (err) => err ? res.status(500).json({ success: false, message: 'Update failed' }) : res.json({ success: true, message: 'Password updated' }));
  });
});

module.exports = router;
