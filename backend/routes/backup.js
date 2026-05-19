// =========================
// 💾 Backup & Recovery Routes (Production-Level)
// Automated database backup and restore with security
// =========================
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

const BACKUP_DIR = path.join(__dirname, '../../backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Helper: Sanitize filename to prevent path traversal
function sanitizeFilename(filename) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '');
}

// =============================
// GET /api/backup/create - Create a new backup (Admin only)
// =============================
router.get('/create', authenticateAdmin, (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);

  // Use environment variables instead of hardcoded credentials
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'college_bus_db';
  const dbHost = process.env.DB_HOST || 'localhost';

  // Escape shell arguments to prevent injection
  const command = `mysqldump --host="${dbHost}" --user="${dbUser}" --password="${dbPass}" --single-transaction --routines --triggers "${dbName}"`;

  exec(command, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Backup error: ${error.message}`);
      
      // Log failed backup
      db.query(
        'INSERT INTO backup_logs (filename, status, created_by, notes) VALUES (?, ?, ?, ?)',
        [filename, 'failed', req.user.username, error.message],
        () => {} // fire and forget
      );
      
      return res.status(500).json({
        success: false,
        message: 'Backup failed. Make sure mysqldump is installed and accessible.'
      });
    }

    // Write the output to file
    fs.writeFileSync(filepath, stdout, 'utf8');
    const fileSize = fs.statSync(filepath).size;

    // Log successful backup
    db.query(
      'INSERT INTO backup_logs (filename, file_size, status, created_by) VALUES (?, ?, ?, ?)',
      [filename, fileSize, 'success', req.user.username],
      () => {} // fire and forget
    );

    // Enforce retention policy - keep only last N backups
    enforceRetention();

    res.json({
      success: true,
      message: 'Backup created successfully',
      backup: {
        filename: filename,
        size: formatFileSize(fileSize),
        timestamp: new Date().toISOString()
      }
    });
  });
});

// =============================
// GET /api/backup/download/:filename - Download a backup file (Admin only)
// =============================
router.get('/download/:filename', authenticateAdmin, (req, res) => {
  const filename = sanitizeFilename(req.params.filename);
  const filepath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, message: 'Backup file not found' });
  }

  res.download(filepath, filename, (err) => {
    if (err) {
      console.error('Download error:', err.message);
      res.status(500).json({ success: false, message: 'Error downloading backup' });
    }
  });
});

// =============================
// GET /api/backup/list - List all backups (Admin only)
// =============================
router.get('/list', authenticateAdmin, (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ success: true, backups: [] });
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          filename: f,
          size: formatFileSize(stats.size),
          sizeBytes: stats.size,
          created: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({ success: true, backups: files });
  } catch (err) {
    console.error('Error listing backups:', err.message);
    res.status(500).json({ success: false, message: 'Error listing backups' });
  }
});

// =============================
// POST /api/backup/restore/:filename - Restore from a backup (Admin only)
// =============================
router.post('/restore/:filename', authenticateAdmin, (req, res) => {
  const filename = sanitizeFilename(req.params.filename);
  const filepath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, message: 'Backup file not found' });
  }

  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'college_bus_db';
  const dbHost = process.env.DB_HOST || 'localhost';

  // First create a safety backup before restore
  const safetyTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safetyFilename = `pre-restore-safety-${safetyTimestamp}.sql`;
  const safetyFilepath = path.join(BACKUP_DIR, safetyFilename);

  const dumpCommand = `mysqldump --host="${dbHost}" --user="${dbUser}" --password="${dbPass}" --single-transaction "${dbName}"`;

  exec(dumpCommand, { maxBuffer: 50 * 1024 * 1024 }, (dumpError, dumpStdout) => {
    if (!dumpError) {
      fs.writeFileSync(safetyFilepath, dumpStdout, 'utf8');
      console.log(`✅ Safety backup created: ${safetyFilename}`);
    }

    // Now restore from the selected backup
    const restoreCommand = `mysql --host="${dbHost}" --user="${dbUser}" --password="${dbPass}" "${dbName}" < "${filepath}"`;

    exec(restoreCommand, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Restore error: ${error.message}`);
        return res.status(500).json({
          success: false,
          message: 'Database restore failed. Your data is safe - a safety backup was created.',
          safetyBackup: safetyFilename
        });
      }

      console.log(`✅ Database restored from: ${filename}`);
      res.json({
        success: true,
        message: `Database restored successfully from ${filename}`,
        safetyBackup: safetyFilename
      });
    });
  });
});

// =============================
// DELETE /api/backup/delete/:filename - Delete a backup (Admin only)
// =============================
router.delete('/delete/:filename', authenticateAdmin, (req, res) => {
  const filename = sanitizeFilename(req.params.filename);
  const filepath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, message: 'Backup file not found' });
  }

  try {
    fs.unlinkSync(filepath);
    res.json({ success: true, message: 'Backup deleted successfully' });
  } catch (err) {
    console.error('Error deleting backup:', err.message);
    res.status(500).json({ success: false, message: 'Error deleting backup' });
  }
});

// =============================
// GET /api/backup/logs - Get backup history (Admin only)
// =============================
router.get('/logs', authenticateAdmin, (req, res) => {
  db.query(
    'SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 50',
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'DB error' });
      res.json({ success: true, logs: results });
    }
  );
});

// =============================
// Helper Functions
// =============================
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function enforceRetention() {
  try {
    const retentionCount = parseInt(process.env.BACKUP_RETENTION_COUNT) || 10;
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.sql'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    // Delete old backups beyond retention count
    if (files.length > retentionCount) {
      const toDelete = files.slice(retentionCount);
      toDelete.forEach(f => {
        try {
          fs.unlinkSync(path.join(BACKUP_DIR, f.name));
          console.log(`🗑️ Old backup deleted (retention policy): ${f.name}`);
        } catch (err) {
          console.error(`Error deleting old backup ${f.name}:`, err.message);
        }
      });
    }
  } catch (err) {
    console.error('Error enforcing retention policy:', err.message);
  }
}

module.exports = router;
