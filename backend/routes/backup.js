// =========================
// 💾 Backup & Recovery Routes (Production-Level)
// Automated database backup and restore with security
// Modified for Vercel Serverless Architecture using mysqldump npm package
// =========================
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const mysqldump = require('mysqldump');
const cloudinary = require('cloudinary').v2;
const { sendEmail } = require('../utils/mailer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function uploadSqlToCloudinary(sqlString, filename) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { resource_type: "raw", public_id: `backups/${filename}`, format: "sql" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(Buffer.from(sqlString, 'utf-8'));
  });
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// =============================
// GET /api/backup/create - Create a new backup (Admin only)
// =============================
router.get('/create', authenticateAdmin, async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.sql`;

  try {
    // Generate dump in memory using pure JS package
    const result = await mysqldump({
      connection: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'college_bus_db',
        port: process.env.DB_PORT || 3306,
      },
      dumpToFile: false // Return as string
    });

    const sqlString = `${result.dump.schema}\n\n${result.dump.data}`;
    const fileSize = Buffer.byteLength(sqlString, 'utf8');

    // Upload to Cloudinary to persist beyond Vercel ephemeral /tmp
    const cloudinaryResult = await uploadSqlToCloudinary(sqlString, filename);
    const downloadUrl = cloudinaryResult.secure_url;

    // Log to Database to populate the Backup Manager list
    db.query(
      'INSERT INTO backup_logs (filename, file_size, status, created_by, notes) VALUES (?, ?, ?, ?, ?)',
      [filename, fileSize, 'success', req.user.username, downloadUrl],
      () => {
        // Send email to admin
        db.query('SELECT email FROM admins WHERE id = ?', [req.user.id], (err, rows) => {
          if (!err && rows.length > 0 && rows[0].email) {
            sendEmail(
              rows[0].email,
              `Database Backup Successful - ${filename}`,
              `<p>A new database backup has been successfully generated.</p>
               <p><strong>File:</strong> ${filename}</p>
               <p><strong>Size:</strong> ${formatFileSize(fileSize)}</p>
               <p><a href="${downloadUrl}" style="padding:10px 15px; background:#10b981; color:white; text-decoration:none; border-radius:5px; display:inline-block; margin-top:10px;">Download Backup</a></p>`
            ).catch(e => console.error('Failed to send backup email:', e));
          }
        });
      }
    );

    res.json({
      success: true,
      message: 'Backup created successfully',
      backup: {
        filename: filename,
        size: formatFileSize(fileSize),
        url: downloadUrl,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Backup generation error:', error);
    let errorMessage = error.message;
    if (errorMessage && errorMessage.toLowerCase().includes('limit')) {
      errorMessage = 'Cloud Storage Limit Exceeded on Cloudinary.';
    }
    db.query(
      'INSERT INTO backup_logs (filename, status, created_by, notes) VALUES (?, ?, ?, ?)',
      [filename, 'failed', req.user.username, errorMessage],
      () => {}
    );
    res.status(500).json({ success: false, message: 'Backup failed: ' + errorMessage });
  }
});

// =============================
// GET /api/backup/list - List all backups (Admin only)
// =============================
router.get('/list', authenticateAdmin, (req, res) => {
  // Read from database instead of local disk for Vercel compatibility
  db.query('SELECT * FROM backup_logs WHERE status="success" ORDER BY created_at DESC LIMIT 20', (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to fetch backups' });
    
    const files = results.map(row => ({
      filename: row.filename,
      size: formatFileSize(row.file_size),
      sizeBytes: row.file_size,
      created: row.created_at,
      url: row.notes // Cloudinary URL is stored here
    }));
    
    res.json({ success: true, backups: files });
  });
});

// =============================
// GET /api/backup/download/:filename - Get Backup URL
// =============================
router.get('/download/:filename', authenticateAdmin, (req, res) => {
  const filename = req.params.filename;
  db.query('SELECT notes FROM backup_logs WHERE filename = ? AND status="success"', [filename], (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ success: false, message: 'Backup not found' });
    
    const url = results[0].notes;
    res.json({ success: true, url: url });
  });
});

// =============================
// POST /api/backup/restore/:filename
// =============================
router.post('/restore/:filename', authenticateAdmin, (req, res) => {
  res.status(400).json({ 
    success: false, 
    message: 'Automated restore is disabled on Vercel due to execution time limits. Please download the backup and import it manually via phpMyAdmin or your database host provider.' 
  });
});

// =============================
// DELETE /api/backup/delete/:filename
// =============================
router.delete('/delete/:filename', authenticateAdmin, async (req, res) => {
  const filename = req.params.filename;
  
  db.query('SELECT notes FROM backup_logs WHERE filename = ?', [filename], async (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ success: false, message: 'Backup not found' });
    
    // Cloudinary raw resources are deleted using the public_id
    try {
      const publicId = `backups/${filename}`;
      await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
      
      db.query('DELETE FROM backup_logs WHERE filename = ?', [filename]);
      res.json({ success: true, message: 'Backup deleted successfully' });
    } catch (error) {
      console.error('Error deleting from Cloudinary:', error);
      res.status(500).json({ success: false, message: 'Failed to delete backup from cloud storage' });
    }
  });
});

// =============================
// GET /api/backup/logs
// =============================
router.get('/logs', authenticateAdmin, (req, res) => {
  db.query('SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 50', (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    res.json({ success: true, logs: results });
  });
});

module.exports = router;
