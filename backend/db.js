const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',     // ✅ your actual MySQL password
  database: 'college_bus_db'
});

// Test the connection
db.connect((err) => {
  if (err) {
    console.error('❌ MySQL connection error:', err.message);
    process.exit(1);
  }
  console.log('✅ MySQL connected');
  
  // Verify admin table and credentials
  db.query('SELECT * FROM admins', (err, results) => {
    if (err) {
      console.error('❌ Error checking admin table:', err.message);
      return;
    }
    if (results.length === 0) {
      console.log('⚠️ No admin users found, creating default admin...');
      db.query(
        'INSERT INTO admins (username, password, email) VALUES (?, ?, ?)',
        ['admin', 'admin123', 'ravikurane12@gmail.com'],
        (err) => {
          if (err) {
            console.error('❌ Error creating default admin:', err.message);
          } else {
            console.log('✅ Default admin created successfully');
          }
        }
      );
    } else {
      console.log('✅ Admin table verified with', results.length, 'users');
    }
  });
});

module.exports = db;
