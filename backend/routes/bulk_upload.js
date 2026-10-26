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
    if (!fileData) return res.status(400).json({ success: false, message: 'No file provided' });

    const wb = XLSX.read(Buffer.from(fileData, 'base64'), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawStudents = extractStudentRows(sheet);

    if (!rawStudents.length) return res.status(400).json({ success: false, message: 'No student data rows found in file' });

    const promisePool = db.promise;
    const [existingStudents] = await promisePool.query('SELECT id, name, class_name, bus_id, username, phone FROM students');
    const [existingBuses]    = await promisePool.query('SELECT id, bus_number, short_name FROM buses');

    const usernameSet = new Set(existingStudents.map(s => (s.username || '').toLowerCase()));
    
    // Quick lookup maps to detect existing students
    const mapNameClass = new Map();
    const mapNameOnly = new Map();
    for (const s of existingStudents) {
      const n = (s.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const c = (s.class_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (n) {
        mapNameClass.set(n + ':::' + c, s);
        if (!mapNameOnly.has(n)) mapNameOnly.set(n, s);
      }
    }

    const busMap = {};
    existingBuses.forEach(b => {
      const bn = b.bus_number.toString().toLowerCase().trim();
      busMap[bn] = b.id;
      busMap[bn.replace(/[^a-z0-9]/g, '')] = b.id;
      if (b.short_name) {
        const sn = b.short_name.toString().toLowerCase().trim();
        busMap[sn] = b.id;
        busMap[sn.replace(/[^a-z0-9]/g, '')] = b.id;
        const num = parseInt(sn.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num)) {
          busMap[String(num)] = b.id;
          busMap[String(num).padStart(4, '0')] = b.id;
        }
      }
    });

    let updateCount = 0;
    let newCount = 0;

    const rows = rawStudents.map((s, i) => {
      const bus_id = findBusId(s.bus_number, busMap);
      const t = computeTotals(s.old_bus_fees, s.current_fees, s.discount_amount, s.fees_paid);
      
      const cleanN = (s.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const cleanC = (s.class_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const existingMatch = mapNameClass.get(cleanN + ':::' + cleanC) || mapNameOnly.get(cleanN);

      const isUpdate = !!existingMatch;
      const username = isUpdate ? existingMatch.username : generateUsername(s.name, s.phone, i + 1, usernameSet);

      const errors = [];
      if (!s.name) errors.push('Name required');
      if (s.bus_number && !bus_id) errors.push(`Bus "${s.bus_number}" not found`);

      const valid = errors.length === 0;
      if (valid) {
        if (isUpdate) updateCount++;
        else newCount++;
      }

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
        action: isUpdate ? 'update' : 'insert',
        matchedId: isUpdate ? existingMatch.id : null,
        valid,
        errors
      };
    });

    res.json({
      success: true,
      totalRows: rows.length,
      validCount: rows.filter(r => r.valid).length,
      invalidCount: rows.filter(r => !r.valid).length,
      updateCount,
      newCount,
      rows
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Parse error: ' + e.message });
  }
});

// ============================
// POST /upload (Optimized Fast Bulk Import / Upsert)
// ============================
router.post('/upload', authenticateAdmin, async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ success: false, message: 'No file provided' });

    const wb = XLSX.read(Buffer.from(fileData, 'base64'), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawStudents = extractStudentRows(sheet);

    if (!rawStudents.length) return res.status(400).json({ success: false, message: 'No student records found in file' });

    const promisePool = db.promise;
    const [existingStudents] = await promisePool.query('SELECT id, name, class_name, bus_id, username, phone FROM students');
    const [existingBuses]    = await promisePool.query('SELECT id, bus_number, short_name FROM buses');

    const usernameSet = new Set(existingStudents.map(s => (s.username || '').toLowerCase()));
    
    // Quick lookup maps
    const mapNameClass = new Map();
    const mapNameOnly = new Map();
    for (const s of existingStudents) {
      const n = (s.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const c = (s.class_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (n) {
        mapNameClass.set(n + ':::' + c, s);
        if (!mapNameOnly.has(n)) mapNameOnly.set(n, s);
      }
    }

    const busMap = {};
    existingBuses.forEach(b => {
      const bn = b.bus_number.toString().toLowerCase().trim();
      busMap[bn] = b.id;
      busMap[bn.replace(/[^a-z0-9]/g, '')] = b.id;
      if (b.short_name) {
        const sn = b.short_name.toString().toLowerCase().trim();
        busMap[sn] = b.id;
        busMap[sn.replace(/[^a-z0-9]/g, '')] = b.id;
        const num = parseInt(sn.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num)) {
          busMap[String(num)] = b.id;
          busMap[String(num).padStart(4, '0')] = b.id;
        }
      }
    });

    // 🚀 ULTRA-OPTIMIZATION: Pre-hash default password ONCE
    // This turns 543 hashes (270 seconds) into a single 0.1s operation!
    const passwordHashCache = new Map();
    const defaultPassword = '123456';
    const defaultHash = await bcrypt.hash(defaultPassword, 10);
    passwordHashCache.set(defaultPassword, defaultHash);

    const toInsert = [];
    const toUpdate = [];
    const results = [];
    let failCount = 0;

    for (let i = 0; i < rawStudents.length; i++) {
      const s = rawStudents[i];
      const bus_id = findBusId(s.bus_number, busMap);
      const t = computeTotals(s.old_bus_fees, s.current_fees, s.discount_amount, s.fees_paid);

      const errors = [];
      if (!s.name) errors.push('Name required');
      if (s.bus_number && !bus_id) errors.push(`Bus "${s.bus_number}" not found`);

      if (errors.length) {
        failCount++;
        results.push({ row: s.rowNum, name: s.name, success: false, errors });
        continue;
      }

      let student_status = 'active';
      const classLower = (s.class_name || '').toLowerCase();
      if (classLower.includes('passout')) student_status = 'passout';
      else if (classLower.includes('cancel') || classLower.includes('left')) student_status = 'school_left';

      const cleanN = (s.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const cleanC = (s.class_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const existingMatch = mapNameClass.get(cleanN + ':::' + cleanC) || mapNameOnly.get(cleanN);

      if (existingMatch) {
        // UPDATE existing student record with latest fee data
        toUpdate.push({
          id: existingMatch.id,
          rowNum: s.rowNum,
          name: s.name,
          class_name: s.class_name || existingMatch.class_name,
          phone: s.phone || existingMatch.phone || '',
          bus_id: bus_id || existingMatch.bus_id,
          pick_up_point: s.pick_up_point || '',
          old_bus_fees: s.old_bus_fees.toFixed(2),
          current_fees: s.current_fees.toFixed(2),
          discount_amount: s.discount_amount.toFixed(2),
          total_fees: t.total_fees,
          fees_paid: s.fees_paid.toFixed(2),
          remaining_fees: t.remaining_fees,
          student_status
        });
      } else {
        // INSERT brand new student
        const pwd = s.password || defaultPassword;
        let hashed = passwordHashCache.get(pwd);
        if (!hashed) {
          hashed = await bcrypt.hash(pwd, 10);
          passwordHashCache.set(pwd, hashed);
        }

        const username = generateUsername(s.name, s.phone, i + 1, usernameSet);

        toInsert.push({
          rowNum: s.rowNum,
          name: s.name.substring(0, 150),
          class_name: (s.class_name || '').substring(0, 100),
          phone: (s.phone || '').substring(0, 20),
          email: (s.email || '').substring(0, 100),
          username: username.substring(0, 100),
          hashed,
          bus_id,
          pick_up_point: (s.pick_up_point || '').substring(0, 150),
          old_bus_fees: s.old_bus_fees.toFixed(2),
          current_fees: s.current_fees.toFixed(2),
          discount_amount: s.discount_amount.toFixed(2),
          total_fees: t.total_fees,
          fees_paid: s.fees_paid.toFixed(2),
          remaining_fees: t.remaining_fees,
          student_status
        });
      }
    }

    let updatedCount = 0;
    let insertedCount = 0;

    // 🚀 Fast parallel updates in chunks of 30
    const updateChunkSize = 30;
    for (let i = 0; i < toUpdate.length; i += updateChunkSize) {
      const chunk = toUpdate.slice(i, i + updateChunkSize);
      await Promise.all(chunk.map(async (u) => {
        try {
          await promisePool.query(`
            UPDATE students SET
              class_name = COALESCE(?, class_name),
              phone = CASE WHEN ? != '' THEN ? ELSE phone END,
              bus_id = COALESCE(?, bus_id),
              pick_up_point = COALESCE(?, pick_up_point),
              old_bus_fees = ?,
              current_fees = ?,
              discount_amount = ?,
              total_fees = ?,
              fees_paid = ?,
              remaining_fees = ?,
              student_status = ?
            WHERE id = ?`,
            [
              u.class_name,
              u.phone, u.phone,
              u.bus_id,
              u.pick_up_point,
              u.old_bus_fees,
              u.current_fees,
              u.discount_amount,
              u.total_fees,
              u.fees_paid,
              u.remaining_fees,
              u.student_status,
              u.id
            ]
          );
          updatedCount++;
          results.push({ row: u.rowNum, name: u.name, success: true, action: 'updated', errors: [] });
        } catch (err) {
          failCount++;
          results.push({ row: u.rowNum, name: u.name, success: false, errors: [err.message] });
        }
      }));
    }

    // 🚀 Fast batch inserts in chunks of 50
    const insertChunkSize = 50;
    for (let i = 0; i < toInsert.length; i += insertChunkSize) {
      const chunk = toInsert.slice(i, i + insertChunkSize);
      const values = [];
      const flatParams = [];

      for (const item of chunk) {
        values.push('(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE())');
        flatParams.push(
          item.username, item.hashed, item.name, item.class_name, item.phone,
          item.email || null, item.bus_id, item.pick_up_point,
          item.old_bus_fees, item.current_fees, item.discount_amount,
          item.total_fees, item.fees_paid, item.remaining_fees,
          item.student_status
        );
      }

      try {
        const sql = `INSERT INTO students
          (username, password, name, class_name, phone, email, bus_id, pick_up_point,
           old_bus_fees, current_fees, discount_amount, total_fees, fees_paid, remaining_fees,
           student_status, joining_date) VALUES ${values.join(',')}`;
        await promisePool.query(sql, flatParams);
        insertedCount += chunk.length;
        chunk.forEach(item => {
          results.push({ row: item.rowNum, name: item.name, success: true, action: 'inserted', errors: [] });
        });
      } catch (err) {
        // Fallback row-by-row if a unique constraint or other error occurs in batch
        for (const item of chunk) {
          try {
            await promisePool.query(`INSERT INTO students
              (username, password, name, class_name, phone, email, bus_id, pick_up_point,
               old_bus_fees, current_fees, discount_amount, total_fees, fees_paid, remaining_fees,
               student_status, joining_date)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE())`,
              [
                item.username, item.hashed, item.name, item.class_name, item.phone,
                item.email || null, item.bus_id, item.pick_up_point,
                item.old_bus_fees, item.current_fees, item.discount_amount,
                item.total_fees, item.fees_paid, item.remaining_fees,
                item.student_status
              ]
            );
            insertedCount++;
            results.push({ row: item.rowNum, name: item.name, success: true, action: 'inserted', errors: [] });
          } catch (e) {
            failCount++;
            results.push({ row: item.rowNum, name: item.name, success: false, errors: [e.message] });
          }
        }
      }
    }

    res.json({
      success: true,
      message: `Upload complete: ${insertedCount} new added, ${updatedCount} existing updated, ${failCount} failed`,
      insertedCount,
      updatedCount,
      successCount: insertedCount + updatedCount,
      failCount,
      totalRows: rawStudents.length,
      results
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Upload error: ' + e.message });
  }
});

module.exports = router;
