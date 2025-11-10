const express = require('express');
const router = express.Router();
const db = require('../db');

// Reset password
router.post('/reset-password', (req, res) => {
  const { roll_no, department } = req.body;

  if (!roll_no || !department) {
    return res.status(400).json({
      success: false,
      message: 'Roll number and department are required'
    });
  }

  // First verify the student exists with given roll number and department
  const sql = 'SELECT id, username FROM students WHERE roll_no = ? AND department = ?';
  db.query(sql, [roll_no, department], (err, results) => {
    if (err) {
      console.error('❌ Database error during password reset:', err);
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

    // Update the password
    db.query(
      'UPDATE students SET password = ? WHERE id = ?',
      [newPassword, student.id],
      (err) => {
        if (err) {
          console.error('❌ Error updating password:', err);
          return res.status(500).json({
            success: false,
            message: 'Error updating password'
          });
        }

        // Return the new credentials
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

// Get single student
router.get('/get/:id', (req, res) => {
  const id = req.params.id;
  const sql = `
    SELECT s.*, b.bus_number, b.route 
    FROM students s 
    LEFT JOIN buses b ON s.bus_id = b.id 
    WHERE s.id = ?
  `;
  
  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error('❌ Database error getting student:', err);
      return res.status(500).json({ success: false, message: 'Error retrieving student data' });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    const student = results[0];
    delete student.password; // Don't send password
    
    res.json({ success: true, student: student });
  });
});

// Update student
router.put('/update/:id', (req, res) => {
  const id = req.params.id;
  const { name, roll_no, department, bus_id, fees_paid, remaining_fees } = req.body;

  // Validate required fields
  if (!name || !roll_no) {
    return res.status(400).json({ success: false, message: 'Name and Roll No are required' });
  }

  // Check for duplicate roll number (excluding current student)
  db.query('SELECT id FROM students WHERE roll_no = ? AND id != ?', [roll_no, id], (err, result) => {
    if (err) {
      console.error('❌ Database error checking duplicates:', err);
      return res.status(500).json({ success: false, message: 'Error checking for duplicate roll number' });
    }
    
    if (result.length > 0) {
      return res.status(400).json({ success: false, message: 'Roll number already exists' });
    }

    // Update student
    const sql = `UPDATE students SET name = ?, roll_no = ?, department = ?, 
                 bus_id = ?, fees_paid = ?, remaining_fees = ? WHERE id = ?`;
    const values = [
      name.trim(),
      roll_no.trim(),
      (department || '').trim(),
      bus_id || null,
      parseFloat(fees_paid || 0).toFixed(2),
      parseFloat(remaining_fees || 0).toFixed(2),
      id
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error('❌ Database error updating student:', err);
        return res.status(500).json({ success: false, message: 'Error updating student' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      res.json({ success: true, message: 'Student updated successfully' });
    });
  });
});

// Get all students with bus info
router.get('/', (req, res) => {
  const sql = `
    SELECT s.*, b.bus_number, b.route 
    FROM students s 
    LEFT JOIN buses b ON s.bus_id = b.id
    ORDER BY s.name
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error('❌ Database error getting students:', err);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving students'
      });
    }
    
    // Don't send passwords in response
    const students = results.map(student => {
      const { password, ...studentData } = student;
      return studentData;
    });
    
    res.json(students);
  });
});

// Get student profile
router.get('/profile/:username', (req, res) => {
  const username = req.params.username;
  
  const sql = `
    SELECT s.*, b.bus_number, b.route 
    FROM students s 
    LEFT JOIN buses b ON s.bus_id = b.id 
    WHERE s.username = ?
  `;
  
  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error('❌ Database error getting student profile:', err);
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
    
    // Don't send password in response
    const student = results[0];
    delete student.password;
    
    res.json({
      success: true,
      student: student
    });
  });
});

// Add student
router.post('/add-student', (req, res) => {
  console.log('📝 Add student request received:', req.body);
  
  const { username, password, name, roll_no, department, bus_id, fees_paid, remaining_fees } = req.body || {};

  // Validate required fields
  if (!username || !password || !name || !roll_no) {
    return res.status(400).json({ 
      success: false, 
      message: 'Username, password, name and roll number are required' 
    });
  }

  // Validate username format
  if (!/^[A-Za-z0-9_]+$/.test(username)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Username can only contain letters, numbers, and underscore' 
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

  // Validate fees (if provided)
  if (fees_paid && (isNaN(fees_paid) || fees_paid < 0)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Fees paid must be a non-negative number' 
    });
  }
  if (remaining_fees && (isNaN(remaining_fees) || remaining_fees < 0)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Remaining fees must be a non-negative number' 
    });
  }

  // Check for duplicate username or roll number
  db.query('SELECT id, username, roll_no FROM students WHERE username = ? OR roll_no = ?', 
    [username, roll_no], 
    (err, result) => {
      if (err) {
        console.error('❌ Database error checking duplicates:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Error checking for existing student' 
        });
      }
      if (result.length > 0) {
        const existing = result[0];
        const message = existing.username === username ? 
          'Username already exists' : 
          'Roll number already exists';
        return res.status(400).json({ success: false, message });
      }

      // Check if bus_id exists if provided
      if (bus_id) {
        db.query('SELECT id FROM buses WHERE id = ?', [bus_id], (err, result) => {
          if (err) {
            console.error('❌ Database error checking bus:', err);
            return res.status(500).json({ 
              success: false, 
              message: 'Error verifying bus information' 
            });
          }
          if (result.length === 0) {
            return res.status(400).json({ 
              success: false, 
              message: 'Selected bus does not exist' 
            });
          }
          insertStudent();
        });
      } else {
        insertStudent();
      }
    });

  function insertStudent() {
    const sql = `INSERT INTO students 
      (username, password, name, roll_no, department, bus_id, fees_paid, remaining_fees, joining_date) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`;
    
    db.query(sql, [
      username.trim(), 
      password,  // Don't trim password as it might contain meaningful spaces
      name.trim(), 
      roll_no.trim(), 
      (department || '').trim(), 
      bus_id || null, 
      parseFloat(fees_paid || 0).toFixed(2),
      parseFloat(remaining_fees || 0).toFixed(2)
    ], (err, result) => {
      if (err) {
        console.error('❌ Database error inserting student:', err);
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ 
            success: false, 
            message: 'Username or Roll number already exists' 
          });
        }
        return res.status(500).json({ 
          success: false, 
          message: 'Error adding student to database' 
        });
      }
      console.log('✅ Student added successfully:', { 
        id: result.insertId, 
        username, 
        roll_no 
      });
      res.json({ 
        success: true, 
        message: 'Student added successfully', 
        id: result.insertId 
      });
    });
  }
});

// Get students with bus info
router.get('/', (req, res) => {
  const sql = `SELECT s.id, s.name, s.roll_no, s.department, s.bus_id, b.bus_number
               FROM students s
               LEFT JOIN buses b ON s.bus_id = b.id
               ORDER BY s.id DESC`;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    res.json(results);
  });
});

// Delete student
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.query('DELETE FROM students WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'DB delete error' });
    res.json({ success: true, message: 'Student deleted' });
  });
});

// Get student dashboard info
router.get('/:username', (req, res) => {
  const username = req.params.username;
  const sql = `
    SELECT s.id, s.username, s.name, s.roll_no, s.department, 
           s.route, s.fees_paid, s.remaining_fees, s.joining_date,
           b.bus_number, b.route as bus_route
    FROM students s
    LEFT JOIN buses b ON s.bus_id = b.id
    WHERE s.username = ?`;
  db.query(sql, [username], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'DB Error' });
    if (!result || result.length === 0) return res.json({ success: false, message: 'Student not found' });
    res.json({ success: true, student: result[0] });
  });
});

// Student login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  const sql = 'SELECT id, username FROM students WHERE username = ? AND password = ?';
  db.query(sql, [username, password], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Login error' });
    if (!result || result.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    res.json({ success: true, student: result[0] });
  });
});

// Update student
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const { name, roll_no, department, bus_id, route, fees_paid, remaining_fees } = req.body;
  
  if (!name || !roll_no) {
    return res.status(400).json({ success: false, message: 'Name and roll_no are required' });
  }

  const sql = `UPDATE students 
    SET name = ?, roll_no = ?, department = ?, bus_id = ?, 
        route = ?, fees_paid = ?, remaining_fees = ?
    WHERE id = ?`;
    
  db.query(sql, [
    name, 
    roll_no, 
    department || '', 
    bus_id || null, 
    route || '',
    fees_paid || 0,
    remaining_fees || 0,
    id
  ], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Update error' });
    res.json({ success: true, message: 'Student updated' });
  });
});

module.exports = router;

