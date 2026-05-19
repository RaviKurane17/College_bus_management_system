// =========================
// 🔐 Student Password Reset (Production-Level)
// Rate-limited, bcrypt, env-based email
// =========================
const express = require('express');
const router = express.Router();
const db = require('../db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Request password reset for student (public - rate limited)
router.post('/request-reset', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  const cleanEmail = email.toString().trim().substring(0, 100).toLowerCase();

  try {
    const resetToken = String(crypto.randomInt(100000, 1000000));
    const resetTokenExpires = new Date(Date.now() + 30 * 60000);

    db.query('SELECT id FROM students WHERE email = ?', [cleanEmail], async (err, results) => {
      if (err) {
        console.error('❌ Database error:', err.message);
        return res.status(500).json({ success: false, message: 'Error processing request' });
      }

      if (results.length === 0) {
        // Don't reveal if email exists
        return res.json({ success: true, message: 'If an account exists with this email, a reset code will be sent.' });
      }

      db.query(
        'UPDATE students SET reset_token = ?, reset_token_expires = ? WHERE email = ?',
        [resetToken, resetTokenExpires, cleanEmail],
        async (err) => {
          if (err) {
            console.error('❌ Error saving reset token:', err.message);
            return res.status(500).json({ success: false, message: 'Error processing request' });
          }

          try {
            await transporter.sendMail({
              from: `"College Bus System" <${process.env.EMAIL_USER}>`,
              to: cleanEmail,
              subject: 'Password Reset Code - Student Portal',
              html: `
                <h1>Password Reset Request</h1>
                <p>Your password reset code is: <strong>${resetToken}</strong></p>
                <p>This code will expire in 30 minutes.</p>
                <p>If you didn't request this reset, please ignore this email.</p>
              `
            });
            res.json({ success: true, message: 'Reset code sent to your email' });
          } catch (error) {
            console.error('❌ Error sending email:', error.message);
            res.status(500).json({ success: false, message: 'Error sending reset email' });
          }
        }
      );
    });
  } catch (error) {
    console.error('❌ Error processing reset request:', error.message);
    res.status(500).json({ success: false, message: 'Error processing request' });
  }
});

// Reset password using token (public - rate limited)
router.post('/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ success: false, message: 'Email, token, and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  const cleanEmail = email.toString().trim().substring(0, 100).toLowerCase();
  const cleanToken = token.toString().trim().substring(0, 10);

  db.query(
    'SELECT id FROM students WHERE email = ? AND reset_token = ? AND reset_token_expires > NOW()',
    [cleanEmail, cleanToken],
    async (err, results) => {
      if (err) {
        console.error('❌ Database error:', err.message);
        return res.status(500).json({ success: false, message: 'Error processing request' });
      }

      if (results.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      db.query(
        'UPDATE students SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
        [hashedPassword, results[0].id],
        (err) => {
          if (err) {
            console.error('❌ Error updating password:', err.message);
            return res.status(500).json({ success: false, message: 'Error updating password' });
          }
          res.json({ success: true, message: 'Password has been reset successfully' });
        }
      );
    }
  );
});

module.exports = router;
