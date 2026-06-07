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
      { Instructions: 'Required: Name, Phone, Bus Number' },
      { Instructions: 'Optional: Class, Email, Pick-Up Point, Old Bus Fees, Current Fees, Discount Amount, Fees Paid, Password' },
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

// ============================
// POST /preview
// ============================
router.post('/preview', authenticateAdmin, async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ success: false, message: 'No file' });

    const data = XLSX.utils.sheet_to_json(
      XLSX.read(Buffer.from(fileData, 'base64'), { type: 'buffer' }).Sheets[
        XLSX.read(Buffer.from(fileData, 'base64'), { type: 'buffer' }).SheetNames[0]
      ], { defval: '' }
    );
    if (!data.length) return res.status(400).json({ success: false, message: 'File is empty' });

    const promisePool        = db.promise;
    const [existingStudents] = await promisePool.query('SELECT username FROM students');
    const [existingBuses]    = await promisePool.query('SELECT id, bus_number FROM buses');

    const existingUsernames  = new Set(existingStudents.map(s => s.username.toLowerCase()));
    const busMap             = {};
    existingBuses.forEach(b => { busMap[b.bus_number.toString().toLowerCase()] = b.id; });

    const fileUsernames = new Set();

    const rows = data.map((row, i) => {
      const name           = (row['Name']           || '').toString().trim();
      const class_name     = (row['Class']           || '').toString().trim();
      const phone          = (row['Phone']           || '').toString().trim();
      const email          = (row['Email']           || '').toString().trim();
      const bus_number     = (row['Bus Number']      || '').toString().trim();
      const pick_up_point  = (row['Pick-Up Point']   || '').toString().trim();
      const old_bus_fees   = parseFloat(row['Old Bus Fees'])    || 0;
      const current_fees   = parseFloat(row['Current Fees'])    || 0;
      const discount_amount= parseFloat(row['Discount Amount']) || 0;
      const fees_paid      = parseFloat(row['Fees Paid'])       || 0;
      const password       = (row['Password'] || '123456').toString().trim() || '123456';

      const username = phone
        ? phone.substring(0, 30) + '.' + (i + 1)
        : name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '').substring(0, 20) + '.' + (i+1);

      const bus_id = busMap[bus_number.toLowerCase()] || null;
      const t      = computeTotals(old_bus_fees, current_fees, discount_amount, fees_paid);

      const errors = [];
      if (!name)                           errors.push('Name required');
      if (!phone)                          errors.push('Phone required');
      if (!bus_number)                     errors.push('Bus Number required');
      if (bus_number && !bus_id)           errors.push(`Bus "${bus_number}" not found`);
      if (existingUsernames.has(username.toLowerCase())) errors.push('Username already exists');
      if (fileUsernames.has(username.toLowerCase()))     errors.push('Duplicate in file');
      fileUsernames.add(username.toLowerCase());

      return {
        row: i + 2, name, class_name, phone, email, bus_number, bus_id, pick_up_point,
        old_bus_fees, current_fees, discount_amount, fees_paid,
        ...t, username, password,
        valid: errors.length === 0, errors
      };
    });

    res.json({
      success: true, totalRows: rows.length,
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

    const data = XLSX.utils.sheet_to_json(
      XLSX.read(Buffer.from(fileData, 'base64'), { type: 'buffer' }).Sheets[
        XLSX.read(Buffer.from(fileData, 'base64'), { type: 'buffer' }).SheetNames[0]
      ], { defval: '' }
    );
    if (!data.length) return res.status(400).json({ success: false, message: 'File is empty' });

    const promisePool        = db.promise;
    const [existingStudents] = await promisePool.query('SELECT username FROM students');
    const [existingBuses]    = await promisePool.query('SELECT id, bus_number FROM buses');

    const existingUsernames  = new Set(existingStudents.map(s => s.username.toLowerCase()));
    const busMap             = {};
    existingBuses.forEach(b => { busMap[b.bus_number.toString().toLowerCase()] = b.id; });

    const fileUsernames = new Set();
    const results = [];
    let successCount = 0, failCount = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const name           = (row['Name']           || '').toString().trim();
      const class_name     = (row['Class']           || '').toString().trim();
      const phone          = (row['Phone']           || '').toString().trim();
      const email          = (row['Email']           || '').toString().trim();
      const bus_number     = (row['Bus Number']      || '').toString().trim();
      const pick_up_point  = (row['Pick-Up Point']   || '').toString().trim();
      const old_bus_fees   = parseFloat(row['Old Bus Fees'])    || 0;
      const current_fees   = parseFloat(row['Current Fees'])    || 0;
      const discount_amount= parseFloat(row['Discount Amount']) || 0;
      const fees_paid      = parseFloat(row['Fees Paid'])       || 0;
      const password       = (row['Password'] || '123456').toString().trim() || '123456';

      const username = phone
        ? phone.substring(0, 30) + '.' + (i + 1)
        : name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '').substring(0, 20) + '.' + (i+1);

      const bus_id = busMap[bus_number.toLowerCase()] || null;
      const t      = computeTotals(old_bus_fees, current_fees, discount_amount, fees_paid);
      const errors = [];

      if (!name)             errors.push('Name required');
      if (!phone)            errors.push('Phone required');
      if (bus_number && !bus_id) errors.push(`Bus "${bus_number}" not found`);
      if (existingUsernames.has(username.toLowerCase())) errors.push('Username exists');
      if (fileUsernames.has(username.toLowerCase()))     errors.push('Duplicate in file');
      fileUsernames.add(username.toLowerCase());

      if (errors.length) { failCount++; results.push({ row: i+2, name, success: false, errors }); continue; }

      try {
        const hashed = await bcrypt.hash(password, 12);
        await promisePool.query(`INSERT INTO students
          (username, password, name, class_name, phone, email, bus_id, pick_up_point,
           old_bus_fees, current_fees, discount_amount, total_fees, fees_paid, remaining_fees,
           student_status, joining_date)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',CURDATE())`,
          [
            username.substring(0, 100), hashed,
            name.substring(0, 150), class_name.substring(0, 100), phone.substring(0, 20), email.substring(0, 100),
            bus_id, pick_up_point.substring(0, 150),
            old_bus_fees.toFixed(2), current_fees.toFixed(2), discount_amount.toFixed(2),
            t.total_fees, fees_paid.toFixed(2), t.remaining_fees
          ]);
        existingUsernames.add(username.toLowerCase());
        successCount++;
        results.push({ row: i+2, name, success: true, errors: [] });
      } catch (e) {
        failCount++;
        results.push({ row: i+2, name, success: false, errors: [e.code === 'ER_DUP_ENTRY' ? 'Duplicate' : e.message] });
      }
    }

    res.json({
      success: true,
      message: `Upload done: ${successCount} added, ${failCount} failed`,
      successCount, failCount, totalRows: data.length, results
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Upload error: ' + e.message });
  }
});

module.exports = router;
