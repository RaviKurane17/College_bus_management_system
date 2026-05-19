// =========================
// 📩 Student Queries Route (Production-Level)
// JWT-protected
// =========================
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateAdmin, authenticateAny } = require('../middleware/auth');

// Submit a query (student - protected)
router.post('/submit', authenticateAny, (req, res) => {
  const { student_id, subject, message } = req.body;
  if (!student_id || !subject || !message) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const cleanSubject = subject.toString().trim().substring(0, 200);
  const cleanMessage = message.toString().trim().substring(0, 2000);
  const cleanId = parseInt(student_id);

  if (isNaN(cleanId)) {
    return res.status(400).json({ success: false, message: 'Invalid student ID.' });
  }

  db.query(
    'INSERT INTO student_queries (student_id, subject, message) VALUES (?, ?, ?)',
    [cleanId, cleanSubject, cleanMessage],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Failed to submit query.' });
      res.json({ success: true, message: 'Query submitted successfully!' });
    }
  );
});

// Get all queries - admin view (protected)
router.get('/all', authenticateAdmin, (req, res) => {
  db.query(
    `SELECT q.*, s.name as student_name, s.roll_no, s.phone 
     FROM student_queries q
     LEFT JOIN students s ON q.student_id = s.id
     ORDER BY q.created_at DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Failed to fetch queries.' });
      res.json({ success: true, queries: results });
    }
  );
});

// Update query status - admin replies (protected)
router.put('/update/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid query ID.' });
  }

  const { status, admin_reply } = req.body;
  
  // Validate status
  const validStatuses = ['open', 'resolved', 'in_progress'];
  const cleanStatus = validStatuses.includes(status) ? status : 'open';

  db.query(
    'UPDATE student_queries SET status = ?, admin_reply = ?, replied_at = NOW() WHERE id = ?',
    [cleanStatus, (admin_reply || '').toString().substring(0, 2000), id],
    (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Failed to update query.' });
      res.json({ success: true, message: 'Query updated successfully.' });
    }
  );
});

// Get queries for a specific student (protected)
router.get('/student/:id', authenticateAny, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid student ID.' });
  }

  db.query(
    'SELECT * FROM student_queries WHERE student_id = ? ORDER BY created_at DESC',
    [id],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Failed to fetch queries.' });
      res.json({ success: true, queries: results });
    }
  );
});

// Delete a query - admin (protected)
router.delete('/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid query ID.' });
  }

  db.query('DELETE FROM student_queries WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to delete query.' });
    res.json({ success: true, message: 'Query deleted.' });
  });
});

module.exports = router;
