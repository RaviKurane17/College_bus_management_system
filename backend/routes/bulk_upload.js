// =========================
// 📤 Bulk Student Upload Routes
// Parse Excel files and batch-insert students
// =========================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// (Multer removed - using base64 JSON for Vercel Serverless compatibility)

// ============================
// Download Excel template
// ============================
router.get('/template', authenticateAdmin, (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    
    // Create template data with sample row
    const templateData = [
      {
        'Name': 'John Doe',
        'Roll No': 'CSE-2024-001',
        'Email': 'john@example.com',
        'Password': 'Pass@123',
        'Department': 'Degree - CSE',
        'Course Year': '1st Year',
        'Section': 'A',
        'Phone': '9876543210',
        'Address': '123 Main Street',
        'Bus Number': 'KA-01-1234',
        'Total Fees': 15000,
        'Fees Paid': 5000,
        'Pass Valid From': '2024-06-01',
        'Pass Valid To': '2025-05-31'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);

    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, // Name
      { wch: 18 }, // Roll No
      { wch: 25 }, // Email
      { wch: 15 }, // Password
      { wch: 18 }, // Department
      { wch: 12 }, // Course Year
      { wch: 10 }, // Section
      { wch: 15 }, // Phone
      { wch: 30 }, // Address
      { wch: 15 }, // Bus Number
      { wch: 12 }, // Total Fees
      { wch: 12 }, // Fees Paid
      { wch: 15 }, // Pass Valid From
      { wch: 15 }, // Pass Valid To
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Students');

    // Add instructions sheet
    const instructions = [
      { 'Instructions': 'BULK STUDENT UPLOAD TEMPLATE' },
      { 'Instructions': '' },
      { 'Instructions': 'Required Fields (marked with *):' },
      { 'Instructions': '  * Name - Student full name (letters and spaces only)' },
      { 'Instructions': '  * Roll No - Unique roll number (letters, numbers, hyphens)' },
      { 'Instructions': '  * Email - Valid email address (used as login username)' },
      { 'Instructions': '  * Password - Minimum 6 characters' },
      { 'Instructions': '  * Phone - Contact number' },
      { 'Instructions': '  * Department - e.g., Degree - CSE, Poly - MECH' },
      { 'Instructions': '  * Address - Home/Hostel address' },
      { 'Instructions': '' },
      { 'Instructions': 'Optional Fields:' },
      { 'Instructions': '  - Course Year (1st Year, 2nd Year, 3rd Year, 4th Year)' },
      { 'Instructions': '  - Section (A, B, C)' },
      { 'Instructions': '  - Bus Number (must match existing bus in the system)' },
      { 'Instructions': '  - Total Fees (numeric)' },
      { 'Instructions': '  - Fees Paid (numeric)' },
      { 'Instructions': '  - Pass Valid From (YYYY-MM-DD format)' },
      { 'Instructions': '  - Pass Valid To (YYYY-MM-DD format)' },
      { 'Instructions': '' },
      { 'Instructions': 'NOTES:' },
      { 'Instructions': '  1. Delete the sample row before uploading' },
      { 'Instructions': '  2. Do not change column headers' },
      { 'Instructions': '  3. Duplicate roll numbers or emails will be skipped' },
    ];

    const wsInstructions = XLSX.utils.json_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=student_upload_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('❌ Template generation error:', error.message);
    res.status(500).json({ success: false, message: 'Error generating template' });
  }
});

// ============================
// Preview uploaded Excel (parse & validate without inserting)
// ============================
router.post('/preview', authenticateAdmin, async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const buffer = Buffer.from(fileData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (data.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel file is empty' });
    }

    if (data.length > 2000) {
      return res.status(400).json({ success: false, message: 'Maximum 2000 students per upload' });
    }

    // Fetch existing data for validation
    const promisePool = db.promise ? db.promise : require('../db').promise;
    const [existingStudents] = await promisePool.query('SELECT username, roll_no FROM students');
    const [existingBuses] = await promisePool.query('SELECT id, bus_number FROM buses');

    const existingEmails = new Set(existingStudents.map(s => s.username.toLowerCase()));
    const existingRolls = new Set(existingStudents.map(s => s.roll_no.toLowerCase()));
    const busMap = {};
    existingBuses.forEach(b => { busMap[b.bus_number.toLowerCase()] = b.id; });

    // Track duplicates within the file itself
    const fileEmails = new Set();
    const fileRolls = new Set();

    const rows = data.map((row, index) => {
      const errors = [];
      const name = (row['Name'] || '').toString().trim();
      let roll_no = (row['Roll No'] || '').toString().trim();
      let email = (row['Email'] || '').toString().trim();
      let password = (row['Password'] || '').toString().trim();
      const department = (row['Department'] || '').toString().trim();
      const course_year = (row['Course Year'] || '').toString().trim();
      const section = (row['Section'] || '').toString().trim();
      const phone = (row['Phone'] || '').toString().trim();
      const address = (row['Address'] || '').toString().trim();

      // Apply defaults for optional fields
      if (!roll_no) roll_no = 'TEMP-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000) + index;
      if (!password) password = '123456';
      if (!email && phone) email = phone;
      if (!email) email = roll_no;
      const bus_number = (row['Bus Number'] || '').toString().trim();
      const total_fees = parseFloat(row['Total Fees']) || 0;
      const fees_paid = parseFloat(row['Fees Paid']) || 0;
      const pass_valid_from = (row['Pass Valid From'] || '').toString().trim();
      const pass_valid_to = (row['Pass Valid To'] || '').toString().trim();

      // Required field checks
      if (!name) errors.push('Name is required');
      else if (!/^[A-Za-z\s]+$/.test(name)) errors.push('Name: letters and spaces only');
      
      if (!phone) errors.push('Phone is required');
      if (!department) errors.push('Department is required');
      if (!address) errors.push('Address is required');

      // Duplicate checks
      if (email && existingEmails.has(email.toLowerCase())) errors.push('Email already registered');
      if (roll_no && existingRolls.has(roll_no.toLowerCase())) errors.push('Roll No already exists');
      if (email && fileEmails.has(email.toLowerCase())) errors.push('Duplicate email in file');
      if (roll_no && fileRolls.has(roll_no.toLowerCase())) errors.push('Duplicate roll no in file');

      // Bus validation
      let bus_id = null;
      if (bus_number) {
        bus_id = busMap[bus_number.toLowerCase()] || null;
        if (!bus_id) errors.push(`Bus "${bus_number}" not found`);
      }

      if (email) fileEmails.add(email.toLowerCase());
      if (roll_no) fileRolls.add(roll_no.toLowerCase());

      return {
        row: index + 2, // +2 because Excel is 1-indexed and header is row 1
        name, roll_no, email, password, department, course_year, section,
        phone, address, bus_number, bus_id, total_fees, fees_paid,
        pass_valid_from, pass_valid_to,
        remaining_fees: Math.max(0, total_fees - fees_paid),
        valid: errors.length === 0,
        errors
      };
    });

    const validCount = rows.filter(r => r.valid).length;
    const invalidCount = rows.filter(r => !r.valid).length;

    res.json({
      success: true,
      totalRows: rows.length,
      validCount,
      invalidCount,
      rows
    });

  } catch (error) {
    console.error('❌ Preview error:', error.message);
    res.status(500).json({ success: false, message: 'Error parsing Excel file: ' + error.message });
  }
});

// ============================
// Bulk upload (insert validated students)
// ============================
router.post('/upload', authenticateAdmin, async (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const buffer = Buffer.from(fileData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (data.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel file is empty' });
    }

    if (data.length > 2000) {
      return res.status(400).json({ success: false, message: 'Maximum 2000 students per upload' });
    }

    const promisePool = db.promise ? db.promise : require('../db').promise;
    const [existingStudents] = await promisePool.query('SELECT username, roll_no FROM students');
    const [existingBuses] = await promisePool.query('SELECT id, bus_number FROM buses');

    const existingEmails = new Set(existingStudents.map(s => s.username.toLowerCase()));
    const existingRolls = new Set(existingStudents.map(s => s.roll_no.toLowerCase()));
    const busMap = {};
    existingBuses.forEach(b => { busMap[b.bus_number.toLowerCase()] = b.id; });

    const fileEmails = new Set();
    const fileRolls = new Set();
    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2;
      const name = (row['Name'] || '').toString().trim();
      let roll_no = (row['Roll No'] || '').toString().trim();
      let email = (row['Email'] || '').toString().trim();
      let password = (row['Password'] || '').toString().trim();
      const department = (row['Department'] || '').toString().trim();
      const course_year = (row['Course Year'] || '').toString().trim();
      const section = (row['Section'] || '').toString().trim();
      const phone = (row['Phone'] || '').toString().trim();
      const address = (row['Address'] || '').toString().trim();

      // Apply defaults for optional fields
      if (!roll_no) roll_no = 'TEMP-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000) + rowNum;
      if (!password) password = '123456';
      if (!email && phone) email = phone;
      if (!email) email = roll_no;

      const bus_number = (row['Bus Number'] || '').toString().trim();
      const total_fees = parseFloat(row['Total Fees']) || 0;
      const fees_paid = parseFloat(row['Fees Paid']) || 0;
      const remaining_fees = Math.max(0, total_fees - fees_paid);
      const pass_valid_from = (row['Pass Valid From'] || '').toString().trim() || null;
      const pass_valid_to = (row['Pass Valid To'] || '').toString().trim() || null;

      // Validation
      const errors = [];
      if (!name || !/^[A-Za-z\s]+$/.test(name)) errors.push('Invalid name');
      
      if (!phone) errors.push('Phone is required');
      if (!department) errors.push('Department is required');
      if (!address) errors.push('Address is required');
      if (existingEmails.has(email.toLowerCase()) || fileEmails.has(email.toLowerCase())) errors.push('Duplicate email');
      if (existingRolls.has(roll_no.toLowerCase()) || fileRolls.has(roll_no.toLowerCase())) errors.push('Duplicate roll no');

      let bus_id = null;
      if (bus_number) {
        bus_id = busMap[bus_number.toLowerCase()] || null;
        if (!bus_id) errors.push(`Bus not found`);
      }

      if (errors.length > 0) {
        failCount++;
        results.push({ row: rowNum, name, roll_no, success: false, errors });
        continue;
      }

      try {
        const hashedPassword = await bcrypt.hash(password, 12);
        const sql = `INSERT INTO students 
          (username, password, name, roll_no, department, course_year, section, address, phone, email, 
           pass_valid_from, pass_valid_to, bus_id, total_fees, fees_paid, remaining_fees, joining_date) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`;

        await promisePool.query(sql, [
          email.substring(0, 50),
          hashedPassword,
          name.substring(0, 150),
          roll_no.substring(0, 50),
          department.substring(0, 150),
          course_year.substring(0, 50),
          section.substring(0, 50),
          address.substring(0, 500),
          phone.substring(0, 20),
          email.substring(0, 100),
          pass_valid_from,
          pass_valid_to,
          bus_id,
          total_fees.toFixed(2),
          fees_paid.toFixed(2),
          remaining_fees.toFixed(2)
        ]);

        successCount++;
        fileEmails.add(email.toLowerCase());
        fileRolls.add(roll_no.toLowerCase());
        results.push({ row: rowNum, name, roll_no, success: true, errors: [] });

      } catch (dbErr) {
        failCount++;
        const errMsg = dbErr.code === 'ER_DUP_ENTRY' ? 'Duplicate entry' : dbErr.message;
        results.push({ row: rowNum, name, roll_no, success: false, errors: [errMsg] });
      }
    }

    console.log(`📤 Bulk upload complete: ${successCount} success, ${failCount} failed out of ${data.length} rows`);

    res.json({
      success: true,
      message: `Upload complete: ${successCount} students added, ${failCount} failed`,
      totalRows: data.length,
      successCount,
      failCount,
      results
    });

  } catch (error) {
    console.error('❌ Bulk upload error:', error.message);
    res.status(500).json({ success: false, message: 'Error processing upload: ' + error.message });
  }
});

// Removed Multer error handler

module.exports = router;
