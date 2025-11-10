const express = require('express');
const router = express.Router();
const db = require('../db');

// Debug: log incoming requests
router.use((req, res, next) => {
  console.log('🔔 /api/login called', req.method, req.path);
  next();
});

// login API for admin or student
router.post('/', (req, res) => {
  const { username, password, role } = req.body;
  console.log('🟡 Login attempt:', { username, role, hasPassword: !!password });
  
  if (!username || !password || !role) {
    console.log('❌ Missing required fields:', { username: !!username, password: !!password, role: !!role });
    return res.status(400).json({ success: false, message: 'Username, password and role are required' });
  }

  if (role === 'admin') {
    console.log('🔍 Checking admin login with:', { username, password });
    
    // First verify admin table
    db.query('SELECT * FROM admins', (err, allAdmins) => {
      if (err) {
        console.error('❌ Error checking admin table:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      console.log('📊 Current admin accounts:', allAdmins);
      
      // Now try to login
      db.query(
        'SELECT * FROM admins WHERE username = ? AND password = ?',
        [username, password],
        (err, result) => {
          if (err) {
            console.error('❌ DB Error (admin login):', err);
            return res.status(500).json({ success: false, message: 'Database error' });
          }
          
          console.log('🔍 Admin login query result:', result);
          
          if (result && result.length > 0) {
            console.log('✅ Admin login success:', username);
            return res.json({ 
              success: true, 
              role: 'admin',
              message: 'Login successful'
            });
          } else {
            console.log('❌ Invalid admin credentials for', username);
            return res.json({ 
              success: false, 
              message: 'Invalid admin credentials' 
            });
          }
        }
      );
    });
  } else if (role === 'student') {
    console.log('🔍 Checking student login with:', { username, hasPassword: !!password });
    
    // First try username/password
    if (username && password) {
      db.query(
        'SELECT * FROM students WHERE username = ? AND password = ?',
        [username, password],
        (err, result) => {
          if (err) {
            console.error('❌ DB Error (student login by username):', err);
            return res.status(500).json({ success: false, message: 'Database error' });
          }
          if (result.length > 0) {
            console.log('✅ Student login success (username):', username);
            return res.json({ 
              success: true, 
              role: 'student', 
              student: result[0],
              message: 'Login successful'
            });
          }
          
          // If username/password failed, try roll_no as fallback
          db.query('SELECT * FROM students WHERE roll_no = ? AND password = ?', 
            [username, password], 
            (err2, res2) => {
              if (err2) {
                console.error('❌ DB Error (student login by roll_no):', err2);
                return res.status(500).json({ success: false, message: 'Database error' });
              }
              if (res2.length > 0) {
                console.log('✅ Student login success (roll_no):', username);
                return res.json({ 
                  success: true, 
                  role: 'student', 
                  student: res2[0],
                  message: 'Login successful'
                });
              }
              console.log('❌ Invalid student credentials for', username);
              return res.json({ 
                success: false, 
                message: 'Invalid student credentials' 
              });
            });
        }
      );
    } else {
      // No password provided, respond with error
      console.log('❌ No password provided for student login');
      return res.status(400).json({ 
        success: false, 
        message: 'Password is required' 
      });
    }
  } else {
    console.log('⚠️ Invalid role provided:', role);
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid role' 
    });
  }
});

module.exports = router;
