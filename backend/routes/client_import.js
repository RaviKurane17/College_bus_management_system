// =========================
// 📥 Client Import Route
// Reads HOLY-WOOD ACADEMY Excel format (Bus Fees Record 26-27.xlsx)
//
// Excel columns → DB columns:
//   Name of Students  → name
//   Class             → class_name
//   Old Bus Fees      → old_bus_fees
//   26-27 Fees → current_fees
//   Discount Amount   → discount_amount
//   Total Amount      → total_fees (computed)
//   Paid              → fees_paid
//   Unpaid Fees       → remaining_fees (computed)
//   Bus No.           → bus_id
//   Pick-Up Point     → pick_up_point
//   (Mobile col 15)   → phone
//
// student_status auto-detected from class_name:
//   "Class - 10th (Passout)" → passout
//   "Class - School Left"    → school_left
//   everything else          → active
//
// Import order:
//   1. POST /auto-create-buses  (do this first)
//   2. POST /preview            (check before inserting)
//   3. POST /upload             (final import)
// =========================

const express = require('express');
const router  = express.Router();
const XLSX    = require('xlsx');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// ─── Derive student_status from class_name ────────────────────────────────────
function deriveStatus(class_name) {
  if (!class_name) return 'active';
  const c = class_name.toLowerCase();
  if (c.includes('passout'))     return 'passout';
  if (c.includes('school left')) return 'school_left';
  return 'active';
}

// ─── Parse full Excel → { active[], left[] } ─────────────────────────────────
function parseExcel(buffer) {
  const ws      = XLSX.read(buffer, { type: 'buffer' }).Sheets;
  const raw     = XLSX.utils.sheet_to_json(ws[Object.keys(ws)[0]], { header: 1, defval: '' });

  const active = [], left = [];
  let inLeftSection = false;

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row.some(c => c !== '')) continue;

    // Detect left/passout section header
    if (row.join('').includes('SCHOOL LEFT STUDENTS')) { inLeftSection = true; continue; }

    // Skip column-header row
    if (row[3] && row[3].toString().toLowerCase().includes('old bus') &&
        row[4] && row[4].toString().toLowerCase().includes('current')) continue;

    // Skip non-numeric first column (school name, date rows)
    if (typeof row[0] === 'string' && row[0].trim() !== '' && isNaN(row[0])) continue;

    const srNo = parseInt(row[0]);
    if (!srNo || srNo <= 0) continue;

    const name          = (row[1] || '').toString().trim();
    const class_name    = (row[2] || '').toString().trim();
    const old_bus_fees  = parseFloat(row[3]) || 0;
    const current_fees  = parseFloat(row[4]) || 0;
    const discount      = parseFloat(row[5]) || 0;
    const fees_paid     = parseFloat(row[7]) || 0;
    const bus_number    = (row[9] || '').toString().trim();
    const pick_up_point = (row[10] || '').toString().trim();
    // Column 15 = Mobile No. (only in right-side bus info)
    const rawPhone      = (row[15] || '').toString().trim();
    const phone         = /^\d{7,15}$/.test(rawPhone) ? rawPhone : '';

    if (!name) continue;

    const total_fees    = Math.max(0, old_bus_fees + current_fees - discount);
    const remaining     = Math.max(0, total_fees - fees_paid);
    const status        = inLeftSection ? deriveStatus(class_name) : 'active';

    const s = {
      srNo, name, class_name, status,
      old_bus_fees, current_fees, discount_amount: discount,
      total_fees, fees_paid, remaining_fees: remaining,
      bus_number, pick_up_point, phone, raw_row: i + 1
    };

    if (inLeftSection) left.push(s);
    else               active.push(s);
  }

  return { active, left };
}

// ─── Generate username from name + bus + srNo ─────────────────────────────────
function genUsername(name, bus, srNo) {
  return (name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '').substring(0, 20)
    + '.' + bus + '.' + srNo).substring(0, 100);
}

// ============================
// GET /api/client-import/template
// ============================
router.get('/template', authenticateAdmin, (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{
      'Sr. No.': 1, 'Name of Students': 'AARUSH ATUL KHOT',
      'Class': 'Class - 3rd', 'Old Bus Fees': 0,
      'Currents Bus Fees': 9500, 'Discount Amount': 0,
      'Total Amount': 9500, 'Paid': 0, 'Unpaid Fees': 9500,
      'Bus No.': 82, 'Pick-Up Point': 'NIKAMWADI', 'NIL': '',
      'BUS NUMBER': 'MH-09-FL-0082', 'DRIVER NAME': 'BABASO RABADE',
      'BUS ROUTE': 'SAROOD', 'MOBILE NO.': '9860127879'
    }]);
    ws['!cols'] = Array(16).fill({ wch: 18 });
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=client_bus_fees_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error generating template: ' + e.message });
  }
});

// ============================
// POST /api/client-import/preview
// ============================
router.post('/preview', authenticateAdmin, async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ success: false, message: 'No file' });

    const { active, left }    = parseExcel(Buffer.from(fileData, 'base64'));
    const all                 = [...active, ...left];
    if (!all.length) return res.status(400).json({ success: false, message: 'No student data found in file' });

    const promisePool         = db.promise;
    const [existingStudents]  = await promisePool.query('SELECT username FROM students');
    const [existingBuses]     = await promisePool.query('SELECT id, bus_number FROM buses');

    const existingUsernames   = new Set(existingStudents.map(s => s.username.toLowerCase()));
    const busMap              = {};
    existingBuses.forEach(b => { busMap[b.bus_number.toString()] = b.id; });

    const fileUsernames = new Set();

    function validate(s) {
      const errors   = [];
      const username = genUsername(s.name, s.bus_number, s.srNo);
      const bus_id   = busMap[s.bus_number.toString()] || null;
      if (!s.name)      errors.push('Name required');
      if (!s.bus_number) errors.push('Bus No. required');
      if (s.bus_number && !bus_id) errors.push(`Bus "${s.bus_number}" not in system — run auto-create-buses first`);
      if (existingUsernames.has(username.toLowerCase())) errors.push('Already imported');
      if (fileUsernames.has(username.toLowerCase())) errors.push('Duplicate in file');
      fileUsernames.add(username.toLowerCase());
      return { ...s, username, bus_id, valid: errors.length === 0, errors };
    }

    const activeRows = active.map(validate);
    const leftRows   = left.map(validate);
    const allRows    = [...activeRows, ...leftRows];

    // Bus-wise summary
    const busGroups = {};
    allRows.forEach(r => {
      if (!busGroups[r.bus_number]) busGroups[r.bus_number] = { count: 0, valid: 0, invalid: 0 };
      busGroups[r.bus_number].count++;
      r.valid ? busGroups[r.bus_number].valid++ : busGroups[r.bus_number].invalid++;
    });

    res.json({
      success: true,
      totalRows: allRows.length,
      activeCount: activeRows.length,
      leftCount: leftRows.length,
      validCount: allRows.filter(r => r.valid).length,
      invalidCount: allRows.filter(r => !r.valid).length,
      busGroups,
      activeRows,
      leftRows
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Parse error: ' + e.message });
  }
});

// ============================
// POST /api/client-import/upload
// ============================
router.post('/upload', authenticateAdmin, async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ success: false, message: 'No file' });

    const { active, left }   = parseExcel(Buffer.from(fileData, 'base64'));
    const all                = [...active, ...left];
    if (!all.length) return res.status(400).json({ success: false, message: 'No student data found' });

    const promisePool        = db.promise;
    const [existingStudents] = await promisePool.query('SELECT username FROM students');
    const [existingBuses]    = await promisePool.query('SELECT id, bus_number FROM buses');

    const existingUsernames  = new Set(existingStudents.map(s => s.username.toLowerCase()));
    const busMap             = {};
    existingBuses.forEach(b => { busMap[b.bus_number.toString()] = b.id; });

    const fileUsernames = new Set();
    const results = [];
    let successCount = 0, failCount = 0, skipCount = 0;

    for (const s of all) {
      const username = genUsername(s.name, s.bus_number, s.srNo);
      const bus_id   = busMap[s.bus_number.toString()] || null;
      const errors   = [];

      if (!s.name) errors.push('Name required');
      if (s.bus_number && !bus_id) errors.push(`Bus "${s.bus_number}" not found`);

      if (existingUsernames.has(username.toLowerCase())) {
        skipCount++;
        results.push({ row: s.raw_row, name: s.name, status: s.status, skipped: true, success: false, errors: ['Already exists'] });
        continue;
      }
      if (fileUsernames.has(username.toLowerCase())) errors.push('Duplicate in file');
      fileUsernames.add(username.toLowerCase());

      if (errors.length) {
        failCount++;
        results.push({ row: s.raw_row, name: s.name, status: s.status, success: false, errors });
        continue;
      }

      try {
        // Default password = phone number (if available), else '123456'
        const pwd    = s.phone && s.phone.length >= 6 ? s.phone.substring(0, 20) : '123456';
        const hashed = await bcrypt.hash(pwd, 12);

        await promisePool.query(`INSERT INTO students
          (username, password, name, class_name, phone, bus_id, pick_up_point,
           old_bus_fees, current_fees, discount_amount,
           total_fees, fees_paid, remaining_fees,
           student_status, joining_date)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE())`,
          [
            username, hashed,
            s.name.substring(0, 150),
            s.class_name.substring(0, 100),
            s.phone.substring(0, 20),
            bus_id,
            s.pick_up_point.substring(0, 150),
            s.old_bus_fees.toFixed(2),
            s.current_fees.toFixed(2),
            s.discount_amount.toFixed(2),
            s.total_fees.toFixed(2),
            s.fees_paid.toFixed(2),
            s.remaining_fees.toFixed(2),
            s.status
          ]);

        existingUsernames.add(username.toLowerCase());
        successCount++;
        results.push({ row: s.raw_row, name: s.name, bus_number: s.bus_number, status: s.status, success: true, errors: [] });

      } catch (dbErr) {
        failCount++;
        results.push({
          row: s.raw_row, name: s.name, status: s.status, success: false,
          errors: [dbErr.code === 'ER_DUP_ENTRY' ? 'Duplicate — skipped' : dbErr.message]
        });
      }
    }

    console.log(`📥 Import done: ${successCount} imported, ${skipCount} skipped, ${failCount} failed`);
    res.json({
      success: true,
      message: `Import complete: ${successCount} students added, ${skipCount} already existed, ${failCount} failed`,
      successCount, skipCount, failCount, totalRows: all.length,
      activeImported:     results.filter(r => r.success && r.status === 'active').length,
      passoutImported:    results.filter(r => r.success && r.status === 'passout').length,
      schoolLeftImported: results.filter(r => r.success && r.status === 'school_left').length,
      results
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Import error: ' + e.message });
  }
});

// ============================
// POST /api/client-import/auto-create-buses
// Create all buses found in client Excel
// ============================
router.post('/auto-create-buses', authenticateAdmin, async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ success: false, message: 'No file' });

    const raw = XLSX.utils.sheet_to_json(
      XLSX.read(Buffer.from(fileData, 'base64'), { type: 'buffer' }).Sheets[
        Object.keys(XLSX.read(Buffer.from(fileData, 'base64'), { type: 'buffer' }).Sheets)[0]
      ], { header: 1, defval: '' }
    );

    const promisePool = db.promise;
    const [existing]  = await promisePool.query('SELECT bus_number FROM buses');
    const existingSet = new Set(existing.map(b => b.bus_number.toString()));

    const busMap = {};
    raw.forEach(row => {
      const bus = row[9] ? row[9].toString().trim() : '';
      if (bus && !isNaN(parseInt(bus))) {
        if (!busMap[bus]) busMap[bus] = {};
        // Right-side bus info: col 12=reg, 13=driver, 14=route, 15=phone
        if (row[12] && row[12].toString().includes('MH-')) {
          busMap[bus] = {
            driver_name:  (row[13] || '').toString().trim(),
            route:        (row[14] || '').toString().trim(),
            driver_phone: /^\d{7,15}$/.test((row[15]||'').toString().trim()) ? row[15].toString().trim() : ''
          };
        }
      }
    });

    const created = [], skipped = [];
    for (const [busNum, info] of Object.entries(busMap)) {
      if (existingSet.has(busNum)) { skipped.push(busNum); continue; }
      try {
        await promisePool.query(
          'INSERT INTO buses (bus_number, driver_name, driver_phone, route, capacity) VALUES (?,?,?,?,?)',
          [busNum, info.driver_name || '', info.driver_phone || '', info.route || '', 50]
        );
        created.push({ bus_number: busNum, ...info });
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') skipped.push(busNum);
        else console.error('Bus insert error:', e.message);
      }
    }

    res.json({
      success: true,
      message: `Created ${created.length} buses, ${skipped.length} already existed`,
      created, skipped
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error: ' + e.message });
  }
});

module.exports = router;
