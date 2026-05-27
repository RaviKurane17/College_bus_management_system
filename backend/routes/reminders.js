// =========================
// 📧 Reminders Routes (Production-Level)
// JWT-protected email reminders
// =========================
const express = require('express');
const router = express.Router();
const { sendEmail } = require('../utils/mailer');
const db = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// Get all overdue students (protected)
router.get('/overdue-students', authenticateAdmin, (req, res) => {
  const sql = `
    SELECT s.*, b.bus_number, b.route 
    FROM students s 
    LEFT JOIN buses b ON s.bus_id = b.id 
    WHERE s.remaining_fees > 0 
    ORDER BY s.remaining_fees DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    const students = results.map(s => { 
      delete s.password; 
      delete s.reset_token;
      delete s.reset_token_expires;
      return s; 
    });
    res.json({ success: true, students });
  });
});

// Send fee reminder email to a student (protected)
router.post('/send-email-reminder/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid student ID' });
  }

  db.query('SELECT * FROM students WHERE id = ?', [id], async (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const student = results[0];

    if (!student.email) {
      return res.status(400).json({ success: false, message: 'Student has no email address registered' });
    }

    const subject = '⚠️ Bus Fee Payment Reminder - SGI Bus Transport';
    const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 30px; text-align: center;">
            <span style="background: #ffb703; color: white; padding: 5px 15px; border-radius: 8px; font-weight: 800; font-size: 20px;">SGI</span>
            <h2 style="color: #ffb703; margin: 15px 0 5px;">Sanjeevan Engineering & Technology Institute</h2>
            <p style="color: #94a3b8; margin: 0;">Bus Transport Management Department</p>
          </div>
          <div style="padding: 30px;">
            <h3 style="color: #0f172a;">Dear ${student.name},</h3>
            <p style="color: #475569;">This is a friendly reminder that you have an outstanding bus transport fee balance.</p>
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; color: #64748b;">Roll No</td><td style="padding: 8px; font-weight: 600;">${student.roll_no}</td></tr>
                <tr><td style="padding: 8px; color: #64748b;">Department</td><td style="padding: 8px; font-weight: 600;">${student.department || 'N/A'}</td></tr>
                <tr><td style="padding: 8px; color: #64748b;">Total Fees</td><td style="padding: 8px; font-weight: 600;">₹${parseFloat(student.total_fees || 0).toLocaleString('en-IN')}</td></tr>
                <tr><td style="padding: 8px; color: #64748b;">Fees Paid</td><td style="padding: 8px; font-weight: 600; color: #22c55e;">₹${parseFloat(student.fees_paid || 0).toLocaleString('en-IN')}</td></tr>
                <tr style="background: #fef2f2;"><td style="padding: 8px; color: #64748b; font-weight: 600;">Remaining Balance</td><td style="padding: 8px; font-weight: 700; color: #ef4444; font-size: 18px;">₹${parseFloat(student.remaining_fees || 0).toLocaleString('en-IN')}</td></tr>
              </table>
            </div>
            <p style="color: #475569;">Please make the payment at the earliest to avoid any inconvenience.</p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">This is an auto-generated email from SGI Bus Management System. Please do not reply.</p>
          </div>
        </div>
      `;

    try {
      const success = await sendEmail(student.email, subject, htmlContent, student.name);
      if (success) {
        res.json({ success: true, message: `Reminder email sent to ${student.email}` });
      } else {
        throw new Error('Brevo API failed to send email');
      }
    } catch (error) {
      console.error('Email send error:', error.message);
      res.json({ success: false, message: 'Failed to send email. Check email config.' });
    }
  });
});

// Send bulk reminders to all overdue students (protected)
router.post('/send-bulk-reminders', authenticateAdmin, (req, res) => {
  db.query('SELECT * FROM students WHERE remaining_fees > 0 AND email IS NOT NULL AND email != ""', async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });

    let sent = 0, failed = 0;
    for (const student of results) {
      try {
        const subject = '⚠️ Bus Fee Payment Reminder - SGI Bus Transport';
        const htmlContent = `<p>Dear ${student.name}, your pending bus fee is ₹${parseFloat(student.remaining_fees || 0).toLocaleString('en-IN')}. Please pay at the earliest.</p><p>- SGI Bus Transport</p>`;
        const success = await sendEmail(student.email, subject, htmlContent, student.name);
        if (success) sent++;
        else failed++;
      } catch (e) {
        failed++;
      }
    }
    res.json({ success: true, message: `Sent: ${sent}, Failed: ${failed}, Total Overdue: ${results.length}` });
  });
});

module.exports = router;
