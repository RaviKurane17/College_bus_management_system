const express = require('express');
const router = express.Router();
const db = require('../db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Create email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',  // Replace with your email service
  auth: {
    user: 'ravikurane12@gmail.com',  // Replace with your email
    pass: 'Oneplus@17'      // Replace with your email app password
  }
});

// Request password reset
router.post('/request-reset', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  try {
  // Generate a random 6-digit reset token using Node's crypto
  const resetToken = String(crypto.randomInt(100000, 1000000));
    const resetTokenExpires = new Date(Date.now() + 30 * 60000); // Token expires in 30 minutes

    // Check if admin exists with this email
    db.query('SELECT id FROM admins WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('❌ Database error:', err);
        return res.status(500).json({
          success: false,
          message: 'Error processing request'
        });
      }

      if (results.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No admin account found with this email'
        });
      }

      // Update admin with reset token
      db.query(
        'UPDATE admins SET reset_token = ?, reset_token_expires = ? WHERE email = ?',
        [resetToken, resetTokenExpires, email],
        async (err) => {
          if (err) {
            console.error('❌ Error saving reset token:', err);
            return res.status(500).json({
              success: false,
              message: 'Error processing request'
            });
          }

          // Send reset email
          try {
            await transporter.sendMail({
              from: '"College Bus System" <your-email@gmail.com>',
              to: email,
              subject: 'Password Reset Code',
              html: `
                <h1>Password Reset Request</h1>
                <p>Your password reset code is: <strong>${resetToken}</strong></p>
                <p>This code will expire in 30 minutes.</p>
                <p>If you didn't request this reset, please ignore this email.</p>
              `
            });

            res.json({
              success: true,
              message: 'Reset code sent to your email'
            });
          } catch (error) {
            console.error('❌ Error sending email:', error);
            res.status(500).json({
              success: false,
              message: 'Error sending reset email'
            });
          }
        }
      );
    });
  } catch (error) {
    console.error('❌ Error processing reset request:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing request'
    });
  }
});

// Reset password using token
router.post('/reset-password', (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Email, token, and new password are required'
    });
  }

  // Verify token and update password
  db.query(
    'SELECT id FROM admins WHERE email = ? AND reset_token = ? AND reset_token_expires > NOW()',
    [email, token],
    (err, results) => {
      if (err) {
        console.error('❌ Database error:', err);
        return res.status(500).json({
          success: false,
          message: 'Error processing request'
        });
      }

      if (results.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset code'
        });
      }

      // Update password and clear reset token
      db.query(
        'UPDATE admins SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
        [newPassword, results[0].id],
        (err) => {
          if (err) {
            console.error('❌ Error updating password:', err);
            return res.status(500).json({
              success: false,
              message: 'Error updating password'
            });
          }

          res.json({
            success: true,
            message: 'Password has been reset successfully'
          });
        }
      );
    }
  );
});

module.exports = router;