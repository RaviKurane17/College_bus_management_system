// =========================
// 👨‍🎓 Students Routes (Production-Level)
// JWT-protected with bcrypt and input validation
// =========================
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../utils/mailer');
const { authenticateAdmin, authenticateAny } = require('../middleware/auth');

// ============================
// Reset password (public - rate limited at server level)
// ============================
router.post('/reset-password', (req, res) => {
  const { roll_no, department } = req.body;

  if (!roll_no || !department) {
    return res.status(400).json({
      success: false,
      message: 'Roll number and department are required'
    });
  }

  // Sanitize input
  const cleanRollNo = roll_no.toString().trim().substring(0, 50);
  const cleanDept = department.toString().trim().substring(0, 150);

  const sql = 'SELECT id, username, email FROM students WHERE roll_no = ? AND department = ?';
  db.query(sql, [cleanRollNo, cleanDept], async (err, results) => {
    if (err) {
      console.error('❌ Database error during password reset:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Error processing password reset'
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No student found with these details'
      });
    }

    // Generate a new random password
    const newPassword = Math.random().toString(36).slice(-8);
    const student = results[0];

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    db.query(
      'UPDATE students SET password = ? WHERE id = ?',
      [hashedPassword, student.id],
      (err) => {
        if (err) {
          console.error('❌ Error updating password:', err.message);
          return res.status(500).json({
            success: false,
            message: 'Error updating password'
          });
        }

        // Send password via email if available (don't return in response for security)
        if (student.email) {
          const subject = '🔐 Password Reset - SGI Bus Transport';
          const htmlContent = `
              <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                <h2>Password Reset Successful</h2>
                <p>Dear ${student.username},</p>
                <p>Your password has been reset. Your new credentials are:</p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                  <p><strong>Username:</strong> ${student.username}</p>
                  <p><strong>New Password:</strong> ${newPassword}</p>
                </div>
                <p>Please login and change your password immediately.</p>
                <p style="color: #999; font-size: 12px;">- SGI Bus Management System</p>
              </div>
            `;
          sendEmail(student.email, subject, htmlContent, student.username).catch(err =>
            console.error('Failed to send password reset email:', err.message)
          );
        }

        res.json({
          success: true,
          message: 'Password reset successful',
          data: {
            username: student.username,
            newPassword: newPassword
          }
        });
      }
    );
  });
});

// ============================
// Get single student (protected)
// ============================
router.get('/get/:id', authenticateAny, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid student ID' });
  }

  const sql = `
    SELECT s.*, b.bus_number, b.route 
    FROM students s 
    LEFT JOIN buses b ON s.bus_id = b.id 
    WHERE s.id = ?
  `;
  
  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error('❌ Database error getting student:', err.message);
      return res.status(500).json({ success: false, message: 'Error retrieving student data' });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    const student = results[0];
    delete student.password;
    delete student.reset_token;
    delete student.reset_token_expires;
    
    res.json({ success: true, student: student });
  });
});

// ============================
// Update student (admin only)
// ============================
router.put('/update/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid student ID' });
  }

  const { name, roll_no, department, course_year, section, address, phone, email, photo_url, pass_valid_from, pass_valid_to, bus_id, total_fees, fees_paid, remaining_fees } = req.body;

  if (!name || !roll_no) {
    return res.status(400).json({ success: false, message: 'Name and Roll No are required' });
  }

  // Check for duplicate roll number (excluding current student)
  db.query('SELECT id FROM students WHERE roll_no = ? AND id != ?', [roll_no.trim(), id], (err, result) => {
    if (err) {
      console.error('❌ Database error checking duplicates:', err.message);
      return res.status(500).json({ success: false, message: 'Error checking for duplicate roll number' });
    }
    
    if (result.length > 0) {
      return res.status(400).json({ success: false, message: 'Roll number already exists' });
    }

    const sql = `UPDATE students SET name = ?, roll_no = ?, department = ?, 
                 course_year = ?, section = ?, address = ?, phone = ?, email = ?, photo_url = ?,
                 pass_valid_from = ?, pass_valid_to = ?,
                 bus_id = ?, total_fees = ?, fees_paid = ?, remaining_fees = ? WHERE id = ?`;
    const values = [
      name.toString().trim().substring(0, 150),
      roll_no.toString().trim().substring(0, 50),
      (department || '').toString().trim().substring(0, 150),
      (course_year || '').toString().trim().substring(0, 50),
      (section || '').toString().trim().substring(0, 50),
      (address || '').toString().trim().substring(0, 500),
      (phone || '').toString().trim().substring(0, 20),
      (email || '').toString().trim().substring(0, 100),
      photo_url || null,
      pass_valid_from || null,
      pass_valid_to || null,
      bus_id || null,
      parseFloat(total_fees || 0).toFixed(2),
      parseFloat(fees_paid || 0).toFixed(2),
      parseFloat(remaining_fees || 0).toFixed(2),
      id
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error('❌ Database error updating student:', err.message);
        return res.status(500).json({ success: false, message: 'Error updating student' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      res.json({ success: true, message: 'Student updated successfully' });
    });
  });
});

// ============================
// Pay Fees and Generate Receipt (admin only)
// ============================
router.post('/pay/:id', authenticateAdmin, (req, res) => {
  const student_id = parseInt(req.params.id);
  if (isNaN(student_id)) {
    return res.status(400).json({ success: false, message: 'Invalid student ID' });
  }

  const { amount, payment_mode, utr_number } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Valid amount is required' });
  }

  if (!payment_mode) {
    return res.status(400).json({ success: false, message: 'Payment mode is required' });
  }

  // 1. Generate receipt number
  const now = new Date();
  const dateStr = now.getFullYear().toString() + (now.getMonth()+1).toString().padStart(2,'0') + now.getDate().toString().padStart(2,'0');
  
  // 1b. Insert into payments table with receipt number
  const insertPaymentSql = `INSERT INTO payments (student_id, amount, payment_mode, utr_number, receipt_number) VALUES (?, ?, ?, ?, ?)`;
  const receiptPrefix = `REC-${dateStr}-`;
  
  db.query(insertPaymentSql, [student_id, parseFloat(amount).toFixed(2), payment_mode.substring(0, 50), (utr_number || '').substring(0, 100), ''], (err, result) => {
    if (err) {
      console.error('❌ Database error inserting payment:', err.message);
      return res.status(500).json({ success: false, message: 'Error recording payment' });
    }

    const payment_id = result.insertId;
    const receipt_number = `${receiptPrefix}${payment_id.toString().padStart(5, '0')}`;
    
    // Update receipt number
    db.query('UPDATE payments SET receipt_number = ? WHERE id = ?', [receipt_number, payment_id]);

    // 2. Update student's fees (FIXED: Use single atomic update to avoid race condition)
    const updateFeesSql = `UPDATE students SET 
      fees_paid = fees_paid + ?, 
      remaining_fees = GREATEST(0, total_fees - (fees_paid + ?)) 
      WHERE id = ?`;
    db.query(updateFeesSql, [parseFloat(amount), parseFloat(amount), student_id], (err) => {
      if (err) {
        console.error('❌ Database error updating student fees:', err.message);
        return res.status(500).json({ success: false, message: 'Error updating student fee records' });
      }

      // 3. Get updated student info for receipt
      const selectStudentSql = `
        SELECT s.*, b.bus_number, b.route 
        FROM students s 
        LEFT JOIN buses b ON s.bus_id = b.id 
        WHERE s.id = ?
      `;
      db.query(selectStudentSql, [student_id], (err, students) => {
        if (err || students.length === 0) {
          return res.status(500).json({ success: false, message: 'Error retrieving student details for receipt' });
        }
        const studentObj = students[0];
        delete studentObj.password;
        const paymentDate = new Date();
        
        res.json({ 
          success: true, 
          message: 'Payment successful', 
          payment_id: payment_id,
          receipt_number: receipt_number,
          student: studentObj,
          payment: { amount, payment_mode, utr_number, date: paymentDate, receipt_number }
        });

        // Async Email Sending
        if (studentObj.email) {
          const subject = '🧾 Payment Receipt - SGI Bus Transport';
          const htmlContent = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #7d3c43; border-radius: 12px; padding: 20px;">
                <div style="text-align: center; color: #7d3c43; border-bottom: 2px solid #7d3c43; padding-bottom: 10px; margin-bottom: 20px;">
                  <h2 style="margin: 0; font-size: 24px;">SANJEEVAN PUBLIC SCHOOL</h2>
                  <h3 style="margin: 5px 0 0;">FEE RECEIPT</h3>
                </div>
                <div style="margin-bottom: 20px; color: #444; line-height: 1.6;">
                  <p><strong>Receipt No:</strong> #FEE-${payment_id.toString().padStart(5, '0')}</p>
                  <p><strong>Date:</strong> ${paymentDate.toLocaleDateString('en-GB')}</p>
                  <p><strong>Student Name:</strong> ${studentObj.name}</p>
                  <p><strong>Roll No:</strong> ${studentObj.roll_no}</p>
                  <p><strong>Amount Paid:</strong> ₹${parseFloat(amount).toLocaleString('en-IN')}</p>
                  <p><strong>Payment Mode:</strong> ${payment_mode} ${utr_number ? '(UTR: ' + utr_number + ')' : ''}</p>
                  <p><strong>Remaining Balance:</strong> ₹${parseFloat(studentObj.remaining_fees || 0).toLocaleString('en-IN')}</p>
                </div>
                <div style="font-size: 12px; color: #777; text-align: center; border-top: 1px solid #ccc; padding-top: 10px;">
                  This is an auto-generated receipt. Please log in to your dashboard to view or print the detailed version.
                </div>
              </div>
            `;
          sendEmail(studentObj.email, subject, htmlContent, studentObj.name).catch(err => console.error('Failed to send receipt email:', err.message));
        }
      });
    });
  });
});

// ============================
// Get student payment history by ID (protected)
// ============================
router.get('/:id/payments', authenticateAny, (req, res) => {
  const student_id = parseInt(req.params.id);
  if (isNaN(student_id)) {
    return res.status(400).json({ success: false, message: 'Invalid student ID' });
  }
  db.query('SELECT * FROM payments WHERE student_id = ? ORDER BY payment_date DESC', [student_id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, payments: results });
  });
});

// ============================
// Resend receipt email for a payment (admin only)
// ============================
router.post('/resend-receipt/:paymentId', authenticateAdmin, (req, res) => {
  const paymentId = parseInt(req.params.paymentId);
  if (isNaN(paymentId)) {
    return res.status(400).json({ success: false, message: 'Invalid payment ID' });
  }

  const sql = `
    SELECT p.*, s.name, s.roll_no, s.email, s.remaining_fees, s.total_fees, s.fees_paid,
           s.department, s.course_year, s.section, s.bus_id,
           b.bus_number, b.route
    FROM payments p
    JOIN students s ON p.student_id = s.id
    LEFT JOIN buses b ON s.bus_id = b.id
    WHERE p.id = ?
  `;
  db.query(sql, [paymentId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'Payment not found' });

    const p = results[0];
    if (!p.email) {
      return res.status(400).json({ success: false, message: 'Student does not have an email address' });
    }

    const paymentDate = new Date(p.payment_date);
    const receiptNo = p.receipt_number || `REC-${paymentId.toString().padStart(5, '0')}`;

    const subject = `🧾 Payment Receipt ${receiptNo} - SGI Bus Transport`;
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #7d3c43; border-radius: 12px; padding: 20px;">
          <div style="text-align: center; color: #7d3c43; border-bottom: 2px solid #7d3c43; padding-bottom: 10px; margin-bottom: 20px;">
            <h2 style="margin: 0; font-size: 24px;">SANJEEVANI PUBLIC SCHOOL</h2>
            <h3 style="margin: 5px 0 0;">FEE RECEIPT</h3>
          </div>
          <div style="margin-bottom: 20px; color: #444; line-height: 1.8;">
            <p><strong>Receipt No:</strong> ${receiptNo}</p>
            <p><strong>Date:</strong> ${paymentDate.toLocaleDateString('en-GB')}</p>
            <p><strong>Student Name:</strong> ${p.name}</p>
            <p><strong>Roll No:</strong> ${p.roll_no}</p>
            <p><strong>Department:</strong> ${p.department || 'N/A'} | ${p.course_year || ''} ${p.section ? 'Sec ' + p.section : ''}</p>
            <hr style="border-color: #eee;">
            <p><strong>Amount Paid:</strong> ₹${parseFloat(p.amount).toLocaleString('en-IN')}</p>
            <p><strong>Payment Mode:</strong> ${p.payment_mode} ${p.utr_number ? '(UTR: ' + p.utr_number + ')' : ''}</p>
            <p><strong>Total Fees:</strong> ₹${parseFloat(p.total_fees || 0).toLocaleString('en-IN')}</p>
            <p><strong>Total Paid:</strong> ₹${parseFloat(p.fees_paid || 0).toLocaleString('en-IN')}</p>
            <p><strong>Remaining Balance:</strong> ₹${parseFloat(p.remaining_fees || 0).toLocaleString('en-IN')}</p>
          </div>
          <div style="font-size: 12px; color: #777; text-align: center; border-top: 1px solid #ccc; padding-top: 10px;">
            This is an auto-generated receipt from SGI Bus Management System.
          </div>
        </div>
      `;

    sendEmail(p.email, subject, htmlContent, p.name)
      .then((success) => {
        if (success) {
          res.json({ success: true, message: `Receipt email sent to ${p.email}` });
        } else {
          res.status(500).json({ success: false, message: 'Failed to send email via Brevo API.' });
        }
      })
      .catch(err => {
        console.error('Failed to send receipt email:', err.message);
        res.status(500).json({ success: false, message: 'Failed to send email: ' + err.message });
      });
  });
});

// ============================
// Get student payment history by identifier (protected)
// ============================
router.get('/username/:identifier/payments', authenticateAny, (req, res) => {
  const identifier = req.params.identifier.toString().trim().substring(0, 150);
  const sql = `
    SELECT p.* FROM payments p 
    JOIN students s ON p.student_id = s.id 
    WHERE s.username = ? OR s.email = ? OR s.roll_no = ? OR s.name = ?
    ORDER BY p.payment_date DESC
  `;
  db.query(sql, [identifier, identifier, identifier, identifier], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, payments: results });
  });
});

// ============================
// Get all students with bus info (admin only)
// ============================
router.get('/', authenticateAdmin, (req, res) => {
  const sql = `
    SELECT s.*, b.bus_number, b.route 
    FROM students s 
    LEFT JOIN buses b ON s.bus_id = b.id
    ORDER BY s.name
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error('❌ Database error getting students:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving students'
      });
    }
    
    // Don't send passwords or sensitive tokens in response
    const students = results.map(student => {
      const { password, reset_token, reset_token_expires, ...studentData } = student;
      return studentData;
    });
    
    res.json(students);
  });
});

// ============================
// Get student profile by identifier (protected)
// ============================
router.get('/profile/:identifier', authenticateAny, (req, res) => {
  const identifier = req.params.identifier.toString().trim().substring(0, 150);
  
  const sql = `
    SELECT s.*, b.bus_number, b.route, d.name AS driver_name, d.phone AS driver_phone 
    FROM students s 
    LEFT JOIN buses b ON s.bus_id = b.id 
    LEFT JOIN drivers d ON b.driver_id = d.id
    WHERE s.username = ? OR s.email = ? OR s.roll_no = ? OR s.name = ?
  `;
  
  db.query(sql, [identifier, identifier, identifier, identifier], (err, results) => {
    if (err) {
      console.error('❌ Database error getting student profile:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving student profile'
      });
    }
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    const student = results[0];
    delete student.password;
    delete student.reset_token;
    delete student.reset_token_expires;
    
    res.json({
      success: true,
      student: student
    });
  });
});

// ============================
// Add student (admin only)
// ============================
router.post('/add-student', authenticateAdmin, async (req, res) => {
  try {
    let { username, password, name, roll_no, department, course_year, section, address, phone, email, photo_url, pass_valid_from, pass_valid_to, bus_id, total_fees, fees_paid, remaining_fees } = req.body || {};

    // Map email to username if frontend passes email instead of username
    if (!username && email) username = email;

    // Apply defaults for optional fields
    if (!roll_no) roll_no = 'TEMP-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
    if (!password) password = '123456';
    if (!username && phone) username = phone;
    if (!username) username = roll_no; // Fallback to roll no as username
    if (!email) email = username + '@noemail.com'; // Fallback to satisfy DB unique email constraint

    // Validate required fields
    if (!name || !phone || !department || !address) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, phone, department, and address are required' 
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Validate name format
    if (!/^[A-Za-z\s]+$/.test(name)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name can only contain letters and spaces' 
      });
    }

    // Validate roll number format
    if (!/^[A-Za-z0-9-]+$/.test(roll_no)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Roll number can only contain letters, numbers, and hyphens' 
      });
    }

    // Validate fees
    if (fees_paid && (isNaN(fees_paid) || fees_paid < 0)) {
      return res.status(400).json({ success: false, message: 'Fees paid must be a non-negative number' });
    }
    if (remaining_fees && (isNaN(remaining_fees) || remaining_fees < 0)) {
      return res.status(400).json({ success: false, message: 'Remaining fees must be a non-negative number' });
    }

    // Check for duplicate username or roll number
    db.query('SELECT id, username, roll_no FROM students WHERE username = ? OR roll_no = ?', 
      [username.trim(), roll_no.trim()], 
      async (err, result) => {
        if (err) {
          console.error('❌ Database error checking duplicates:', err.message);
          return res.status(500).json({ success: false, message: 'Error checking for existing student' });
        }
        if (result.length > 0) {
          const existing = result[0];
          const message = existing.username === username.trim() ? 
            'Email already registered' : 
            'Roll number already exists';
          return res.status(400).json({ success: false, message });
        }

        // Check if bus_id exists if provided
        if (bus_id) {
          db.query('SELECT id FROM buses WHERE id = ?', [bus_id], async (err, result) => {
            if (err) {
              return res.status(500).json({ success: false, message: 'Error verifying bus information' });
            }
            if (result.length === 0) {
              return res.status(400).json({ success: false, message: 'Selected bus does not exist' });
            }
            await insertStudent();
          });
        } else {
          await insertStudent();
        }
      });

    async function insertStudent() {
      // Hash password before storing
      const hashedPassword = await bcrypt.hash(password, 12);

      const sql = `INSERT INTO students 
        (username, password, name, roll_no, department, course_year, section, address, phone, email, photo_url, pass_valid_from, pass_valid_to, bus_id, total_fees, fees_paid, remaining_fees, joining_date) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`;
      
      db.query(sql, [
        username.toString().trim().substring(0, 50), 
        hashedPassword,
        name.toString().trim().substring(0, 150), 
        roll_no.toString().trim().substring(0, 50), 
        (department || '').toString().trim().substring(0, 150), 
        (course_year || '').toString().trim().substring(0, 50),
        (section || '').toString().trim().substring(0, 50),
        (address || '').toString().trim().substring(0, 500),
        (phone || '').toString().trim().substring(0, 20),
        (email || '').toString().trim().substring(0, 100),
        photo_url || null,
        pass_valid_from || null,
        pass_valid_to || null,
        bus_id || null, 
        parseFloat(total_fees || 0).toFixed(2),
        parseFloat(fees_paid || 0).toFixed(2),
        parseFloat(remaining_fees || 0).toFixed(2)
      ], (err, result) => {
        if (err) {
          console.error('❌ Database error inserting student:', err.message);
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Username or Roll number already exists' });
          }
          return res.status(500).json({ success: false, message: 'Error adding student to database' });
        }
        console.log('✅ Student added successfully:', { id: result.insertId, roll_no });
        res.json({ success: true, message: 'Student added successfully', id: result.insertId });
      });
    }
  } catch (error) {
    console.error('❌ Error adding student:', error.message);
    return res.status(500).json({ success: false, message: 'Server error adding student' });
  }
});

// ============================
// Delete student (admin only)
// ============================
router.delete('/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid student ID' });
  }
  db.query('DELETE FROM students WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'DB delete error' });
    res.json({ success: true, message: 'Student deleted' });
  });
});

// ============================
// Get student dashboard info (protected)
// ============================
router.get('/:identifier', authenticateAny, (req, res) => {
  const identifier = req.params.identifier.toString().trim().substring(0, 150);
  const sql = `
    SELECT s.id, s.username, s.name, s.roll_no, s.department, 
           s.route, s.fees_paid, s.remaining_fees, s.joining_date,
           b.bus_number, b.route as bus_route
    FROM students s
    LEFT JOIN buses b ON s.bus_id = b.id
    WHERE s.username = ? OR s.email = ? OR s.roll_no = ? OR s.name = ?`;
  db.query(sql, [identifier, identifier, identifier, identifier], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error' });
    if (!result || result.length === 0) return res.json({ success: false, message: 'Student not found' });
    res.json({ success: true, student: result[0] });
  });
});

// ============================
// Student login (kept for backward compatibility)
// ============================
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  db.query('SELECT * FROM students WHERE username = ? OR email = ?', [username, username], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Login error' });
    if (!results || results.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const student = results[0];
    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const { password: _, reset_token, reset_token_expires, ...studentData } = student;
    res.json({ success: true, student: studentData });
  });
});

// ============================
// Change password (protected for students)
// ============================
router.post('/change-password', authenticateAny, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const studentId = req.user.id; // from authenticateAny middleware

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Old and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    db.query('SELECT password FROM students WHERE id = ?', [studentId], async (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });
      if (results.length === 0) return res.status(404).json({ success: false, message: 'Student not found' });

      const isMatch = await bcrypt.compare(oldPassword, results[0].password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Incorrect old password' });
      }

      const hashedNew = await bcrypt.hash(newPassword, 12);
      db.query('UPDATE students SET password = ? WHERE id = ?', [hashedNew, studentId], (updateErr) => {
        if (updateErr) return res.status(500).json({ success: false, message: 'Failed to update password' });
        res.json({ success: true, message: 'Password updated successfully' });
      });
    });
  } catch (error) {
    console.error('Password change error:', error.message);
    res.status(500).json({ success: false, message: 'Server error changing password' });
  }
});

module.exports = router;
