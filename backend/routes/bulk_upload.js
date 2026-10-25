// =========================
// 📤 Bulk Student Upload (Standard Template)
// Columns matching client Excel:
//   Name | Class | Phone | Bus Number | Pick-Up Point
//   Old Bus Fees | Current Fees (2026-27) | Discount Amount | Fees Paid
// =========================
const express = require('express');
const router  = express.Router();
const XLSX    = require('xlsx');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

function computeTotals(old_bus_fees, current_fees, discount_amount, fees_paid) {
  const total = Math.max(0, parseFloat(old_bus_fees||0) + parseFloat(current_fees||0) - parseFloat(discount_amount||0));
  return { total_fees: total.toFixed(2), remaining_fees: Math.max(0, total - parseFloat(fees_paid||0)).toFixed(2) };
}

// ============================
// GET template
// ============================
router.get('/template', authenticateAdmin, (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{
      'Name':             'AARUSH ATUL KHOT',
      'Class':            'Class - 3rd',
      'Phone':            '9860127879',
      'Email':            'aarush@example.com',
      'Bus Number':       '82',
      'Pick-Up Point':    'NIKAMWADI',
      'Old Bus Fees':     0,
      'Current Fees':     9500,
      'Discount Amount':  0,
      'Fees Paid':        0,
      'Password':         '123456'
    }]);
    ws['!cols'] = [
      {wch:28},{wch:15},{wch:15},{wch:25},{wch:12},{wch:20},
      {wch:14},{wch:14},{wch:16},{wch:12},{wch:15}
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Students');

    const instr = XLSX.utils.json_to_sheet([
      { Instructions: 'BULK UPLOAD TEMPLATE — HOLY-WOOD ACADEMY' },
      { Instructions: '' },
      { Instructions: 'Required: Name, Bus Number' },
      { Instructions: 'Optional: Class, Phone, Email, Pick-Up Point, Old Bus Fees, Current Fees, Discount Amount, Fees Paid, Password' },
      { Instructions: '' },
      { Instructions: 'total_fees = Old Bus Fees + Current Fees - Discount (auto-computed)' },
      { Instructions: 'remaining_fees = total_fees - Fees Paid (auto-computed)' },
      { Instructions: '' },
      { Instructions: 'Password defaults to "123456" if left empty' },
      { Instructions: 'Bus Number must already exist in system' },
    ]);
    instr['!cols'] = [{wch:65}];
    XLSX.utils.book_append_sheet(wb, instr, 'Instructions');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=student_upload_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error generating template: ' + e.message });
  }
});

// ============================
// GET driver template
// ============================
router.get('/template/drivers', authenticateAdmin, (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{
      'Name':             'RAMESH KUMAR',
      'Phone':            '9876543210',
      'License Number':   'MH0920230001234',
      'Address':          '123 MAIN STREET, CITY'
    }]);
    ws['!cols'] = [ {wch:25}, {wch:15}, {wch:20}, {wch:35} ];
    XLSX.utils.book_append_sheet(wb, ws, 'Drivers');

    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader('Content-Disposition', 'attachment; filename=driver_upload_template.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error generating template: ' + e.message });
  }
});

// ============================
// GET bus template
// ============================
router.get('/template/buses', authenticateAdmin, (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{
      'Bus Number':  'MH 09 AB 1234',
      'Short Name':  'Bus 1',
      'Driver Name': 'RAMESH KUMAR',
      'Capacity':    50,
      'Route':       'CITY CENTER TO COLLEGE'
    }]);
    ws['!cols'] = [ {wch:15}, {wch:12}, {wch:25}, {wch:10}, {wch:35} ];
    XLSX.utils.book_append_sheet(wb, ws, 'Buses');

    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader('Content-Disposition', 'attachment; filename=bus_upload_template.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error generating template: ' + e.message });
  }
});

// ─── Intelligent Student Row Extractor ─────────────────────────
function extractStudentRows(sheet) {
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rawRows.length) return [];

  // Find header row by keywords
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
    const row = rawRows[r].map(c => String(c).trim().toLowerCase());
    const hasName = row.some(c => c.includes('name'));
    const hasBusOrClass = row.some(c => c.includes('bus') || c.includes('class') || c.includes('fee'));
    if (hasName && hasBusOrClass) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx === -1) headerRowIdx = 0;
  const headerRow = rawRows[headerRowIdx].map(c => String(c).trim());

  function getField(raw, aliases) {
    for (const a of aliases) {
      const idx = headerRow.findIndex(h => {
        const cleanH = h.toLowerCase().trim();
        const cleanA = a.toLowerCase().trim();
        return cleanH === cleanA || cleanH.replace(/[^a-z0-9]/g, '') === cleanA.replace(/[^a-z0-9]/g, '');
      });
      if (idx !== -1 && raw[idx] !== undefined && raw[idx] !== null && String(raw[idx]).trim() !== '') {
        return raw[idx];
      }
    }
    return '';
  }

  const students = [];
  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const raw = rawRows[r];
    if (!raw || !raw.length) continue;

    const name = String(getField(raw, ['Name of Students', 'Name of Student', 'Student Name', 'Name'])).trim();
    if (!name) continue;

    const lower = name.toLowerCase();
    if (lower === 'name of students' || lower === 'student name' || lower === 'sr. no.' ||
        lower.includes('fee receivable') || lower.includes('holy-wood') ||
        lower === 'total' || lower === 'grand total') {
      continue;
    }

    const class_name = String(getField(raw, ['Class', 'Class Name', 'Standard'])).trim();
    const phone = String(getField(raw, ['Phone', 'Phone Number', 'Mobile', 'Mobile No', 'Contact'])).trim();
    const email = String(getField(raw, ['Email', 'Email ID'])).trim();
    const bus_number = String(getField(raw, ['Bus No.', 'Bus No', 'Bus Number', 'Bus'])).trim();
    const pick_up_point = String(getField(raw, ['Pick-Up Point', 'Pick-up Point', 'Pickup Point', 'Pick-Up', 'Pickup', 'Pick up point', 'Stop'])).trim();
    const old_bus_fees = parseFloat(getField(raw, ['Old Bus Fees', 'Old Fees', 'Old Bus Fee', 'Previous Fees'])) || 0;
    const current_fees = parseFloat(getField(raw, ['Currents Bus Fees', 'Current Bus Fees', 'Current Fees', '26-27 Fees', '26-27 Fees (Apr-Mar)'])) || 0;
    const discount_amount = parseFloat(getField(raw, ['Discount Amount', 'Discount', 'Concession', 'Concession Amount'])) || 0;
    const fees_paid = parseFloat(getField(raw, ['Paid ', 'Paid', 'Fees Paid', 'Paid Amount'])) || 0;
    const password = String(getField(raw, ['Password'])).trim() || '123456';

    students.push({
      rowNum: r + 1,
      name, class_name, phone, email, bus_number, pick_up_point,
      old_bus_fees, current_fees, discount_amount, fees_paid, password
    });
  }
  return students;
}

function findBusId(busNumber, busMap) {
  if (!busNumber) return null;
  const raw = busNumber.toString().trim().toLowerCase();
  if (busMap[raw]) return busMap[raw];
  const alpha = raw.replace(/[^a-z0-9]/g, '');
  if (busMap[alpha]) return busMap[alpha];
  for (const b in busMap) {
    if (b.endsWith(alpha) || alpha.endsWith(b)) return busMap[b];
  }
  return null;
}

function generateUsername(name, phone, index, existingSet) {
  let base = '';
  if (phone && phone.trim().length >= 6) {
    base = phone.trim().replace(/[^0-9]/g, '');
  } else {
    base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    if (!base) base = 'student';
  }
  let candidate = base;
  let counter = 1;
  while (existingSet.has(candidate.toLowerCase())) {
    candidate = `${base}.${index + counter}`;
    counter++;
  }
  existingSet.add(candidate.toLowerCase());
  return candidate;
}

// ============================
// POST /preview
// ============================
router.post('/preview', authenticateAdmin, async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ success: false, message: 'No file' });

    const wb = XLSX.read(Buffer.from(fileData, 'base64'), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawStudents = extractStudentRows(sheet);

    if (!rawStudents.length) return res.status(400).json({ success: false, message: 'No student data rows found in file' });

    const promisePool = db.promise;
    const [existingStudents] = await promisePool.query('SELECT username FROM students');
    const [existingBuses]    = await promisePool.query('SELECT id, bus_number FROM buses');

    const usernameSet = new Set(existingStudents.map(s => s.username.toLowerCase()));
    const busMap = {};
    existingBuses.forEach(b => {
      const bn = b.bus_number.toString().toLowerCase().trim();
      busMap[bn] = b.id;
      busMap[bn.replace(/[^a-z0-9]/g, '')] = b.id;
    });

    const rows = rawStudents.map((s, i) => {
      const bus_id = findBusId(s.bus_number, busMap);
      const t = computeTotals(s.old_bus_fees, s.current_fees, s.discount_amount, s.fees_paid);
      const username = generateUsername(s.name, s.phone, i + 1, usernameSet);

      const errors = [];
      if (!s.name) errors.push('Name required');
      if (s.bus_number && !bus_id) errors.push(`Bus "${s.bus_number}" not found`);

      return {
        row: s.rowNum,
        name: s.name,
        class_name: s.class_name,
        phone: s.phone,
        email: s.email,
        bus_number: s.bus_number,
        bus_id,
        pick_up_point: s.pick_up_point,
        old_bus_fees: s.old_bus_fees,
        current_fees: s.current_fees,
        discount_amount: s.discount_amount,
        fees_paid: s.fees_paid,
        ...t,
        username,
        password: s.password,
        valid: errors.length === 0,
        errors
      };
    });

    res.json({
      success: true,
      totalRows: rows.length,
      validCount: rows.filter(r => r.valid).length,
      invalidCount: rows.filter(r => !r.valid).length,
      rows
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Parse error: ' + e.message });
  }
});

// ============================
// POST /upload
// ============================
router.post('/upload', authenticateAdmin, async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ success: false, message: 'No file' });

    const wb = XLSX.read(Buffer.from(fileData, 'base64'), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawStudents = extractStudentRows(sheet);

    if (!rawStudents.length) return res.status(400).json({ success: false, message: 'No student records found in file' });

    const promisePool = db.promise;
    const [existingStudents] = await promisePool.query('SELECT username FROM students');
    const [existingBuses]    = await promisePool.query('SELECT id, bus_number FROM buses');

    const usernameSet = new Set(existingStudents.map(s => s.username.toLowerCase()));
    const busMap = {};
    existingBuses.forEach(b => {
      const bn = b.bus_number.toString().toLowerCase().trim();
      busMap[bn] = b.id;
      busMap[bn.replace(/[^a-z0-9]/g, '')] = b.id;
    });

    const results = [];
    let successCount = 0, failCount = 0;

    for (let i = 0; i < rawStudents.length; i++) {
      const s = rawStudents[i];
      const bus_id = findBusId(s.bus_number, busMap);
      const t = computeTotals(s.old_bus_fees, s.current_fees, s.discount_amount, s.fees_paid);
      const username = generateUsername(s.name, s.phone, i + 1, usernameSet);

      const errors = [];
      if (!s.name) errors.push('Name required');
      if (s.bus_number && !bus_id) errors.push(`Bus "${s.bus_number}" not found`);

      if (errors.length) {
        failCount++;
        results.push({ row: s.rowNum, name: s.name, success: false, errors });
        continue;
      }

      // Check student_status
      let student_status = 'active';
      const classLower = s.class_name.toLowerCase();
      if (classLower.includes('passout')) student_status = 'passout';
      else if (classLower.includes('cancel') || classLower.includes('left')) student_status = 'school_left';

      try {
        const hashed = await bcrypt.hash(s.password || '123456', 12);
        await promisePool.query(`INSERT INTO students
          (username, password, name, class_name, phone, email, bus_id, pick_up_point,
           old_bus_fees, current_fees, discount_amount, total_fees, fees_paid, remaining_fees,
           student_status, joining_date)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE())`,
          [
            username.substring(0, 100), hashed,
            s.name.substring(0, 150), s.class_name.substring(0, 100), s.phone.substring(0, 20), (s.email || '').substring(0, 100),
            bus_id, (s.pick_up_point || '').substring(0, 150),
            s.old_bus_fees.toFixed(2), s.current_fees.toFixed(2), s.discount_amount.toFixed(2),
            t.total_fees, s.fees_paid.toFixed(2), t.remaining_fees,
            student_status
          ]);
        usernameSet.add(username.toLowerCase());
        successCount++;
        results.push({ row: s.rowNum, name: s.name, success: true, errors: [] });
      } catch (e) {
        failCount++;
        results.push({ row: s.rowNum, name: s.name, success: false, errors: [e.code === 'ER_DUP_ENTRY' ? 'Duplicate username' : e.message] });
      }
    }

    res.json({
      success: true,
      message: `Upload complete: ${successCount} added, ${failCount} skipped/failed`,
      successCount,
      failCount,
      totalRows: rawStudents.length,
      results
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Upload error: ' + e.message });
  }
});

module.exports = router;
