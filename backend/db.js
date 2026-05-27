// =========================
// 🗄️ Database Connection (Production-Level)
// Uses mysql2 connection pool with prepared statements
// =========================
require('dotenv').config();
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'college_bus_db',
  port: process.env.DB_PORT || 3306,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
}

// Create connection pool (much better than single connection)
const pool = mysql.createPool(poolConfig);

// Get a promisified version for async/await usage
const promisePool = pool.promise();

// Test the connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ MySQL connection pool error:', err.message);
    // Removed process.exit(1) so Vercel does not crash with a generic 500 error!
    return;
  }
  console.log('✅ MySQL connection pool established');
  connection.release();

  // Initialize database schema
  initializeDatabase();
});

async function initializeDatabase() {
  try {
    // Create base tables if they don't exist
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        role ENUM('super_admin', 'admin') DEFAULT 'admin',
        reset_token VARCHAR(100),
        reset_token_expires DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_username (username)
      ) ENGINE=InnoDB;
    `);

    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        license_number VARCHAR(50),
        address TEXT,
        joined_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_phone (phone)
      ) ENGINE=InnoDB;
    `);

    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS buses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bus_number VARCHAR(20) NOT NULL UNIQUE,
        driver_name VARCHAR(100),
        driver_phone VARCHAR(20),
        driver_id INT,
        capacity INT NOT NULL DEFAULT 0,
        route VARCHAR(255),
        FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
        INDEX idx_bus_number (bus_number)
      ) ENGINE=InnoDB;
    `);

    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(150) NOT NULL,
        roll_no VARCHAR(50) UNIQUE NOT NULL,
        department VARCHAR(150),
        course_year VARCHAR(50),
        section VARCHAR(50),
        address TEXT,
        phone VARCHAR(20),
        email VARCHAR(100),
        photo_url VARCHAR(500),
        pass_valid_from DATE,
        pass_valid_to DATE,
        bus_id INT,
        total_fees DECIMAL(10,2) DEFAULT 0,
        fees_paid DECIMAL(10,2) DEFAULT 0,
        remaining_fees DECIMAL(10,2) DEFAULT 0,
        joining_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        reset_token VARCHAR(100),
        reset_token_expires DATETIME,
        FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE SET NULL,
        INDEX idx_roll_no (roll_no),
        INDEX idx_email (email),
        INDEX idx_department (department),
        INDEX idx_remaining_fees (remaining_fees)
      ) ENGINE=InnoDB;
    `);

    // Ensure role column exists in admins table (migration)
    try {
      await promisePool.query("ALTER TABLE admins ADD COLUMN role ENUM('super_admin', 'admin') DEFAULT 'admin'");
      console.log('✅ Added role column to admins table');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.error('Schema migration error (role column):', err.message);
      }
    }

    // Verify admin table and credentials
    const [admins] = await promisePool.query('SELECT * FROM admins');
    
    // Check if super admin exists
    const superAdminExists = admins.some(a => a.role === 'super_admin');
    if (!superAdminExists) {
      console.log('⚠️ No super admin found, creating default super admin...');
      const hashedPassword = await bcrypt.hash('SuperAdmin@2024', 12);
      try {
        await promisePool.query(
          'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
          ['superadmin', hashedPassword, process.env.EMAIL_USER || 'ravikurane12@gmail.com', 'super_admin']
        );
        console.log('✅ Default super admin created (username: superadmin, password: SuperAdmin@2024)');
      } catch (dupErr) {
        // If superadmin username exists but role isn't set, update it
        if (dupErr.code === 'ER_DUP_ENTRY') {
          await promisePool.query('UPDATE admins SET role = ? WHERE username = ?', ['super_admin', 'superadmin']);
          console.log('✅ Updated existing superadmin to super_admin role');
        }
      }
    }
    
    if (admins.length === 0) {
      console.log('⚠️ No admin users found, creating default admin...');
      const hashedPassword = await bcrypt.hash('admin123', 12);
      await promisePool.query(
        'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
        ['admin', hashedPassword, process.env.EMAIL_USER || 'ravikurane12@gmail.com', 'admin']
      );
      console.log('✅ Default admin created (username: admin, password: admin123)');
    } else {
      console.log('✅ Admin table verified with', admins.length, 'users');
      
      // Check if passwords need hashing (migration from plaintext)
      for (const admin of admins) {
        if (!admin.password.startsWith('$2a$') && !admin.password.startsWith('$2b$')) {
          const hashed = await bcrypt.hash(admin.password, 12);
          await promisePool.query('UPDATE admins SET password = ? WHERE id = ?', [hashed, admin.id]);
          console.log(`✅ Migrated admin "${admin.username}" password to bcrypt hash`);
        }
      }
    }

    // Migrate student passwords to hashed versions
    const [students] = await promisePool.query('SELECT id, password FROM students');
    for (const student of students) {
      if (student.password && !student.password.startsWith('$2a$') && !student.password.startsWith('$2b$')) {
        const hashed = await bcrypt.hash(student.password, 12);
        await promisePool.query('UPDATE students SET password = ? WHERE id = ?', [hashed, student.id]);
      }
    }
    if (students.length > 0) {
      console.log(`✅ Verified/migrated ${students.length} student passwords`);
    }

    // Ensure new columns exist for student grouping
    const alterQueries = [
      "ALTER TABLE students ADD COLUMN course_year VARCHAR(50)",
      "ALTER TABLE students ADD COLUMN section VARCHAR(50)",
      "ALTER TABLE students ADD COLUMN address TEXT",
      "ALTER TABLE students ADD COLUMN total_fees DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE students ADD COLUMN phone VARCHAR(20)",
      "ALTER TABLE students ADD COLUMN email VARCHAR(100)",
      "ALTER TABLE students ADD COLUMN photo_url VARCHAR(500)",
      "ALTER TABLE students ADD COLUMN pass_valid_from DATE",
      "ALTER TABLE students ADD COLUMN pass_valid_to DATE",
      "ALTER TABLE students ADD COLUMN reset_token VARCHAR(100)",
      "ALTER TABLE students ADD COLUMN reset_token_expires DATETIME"
    ];

    for (const query of alterQueries) {
      try {
        await promisePool.query(query);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
          console.error('Schema migration error:', err.message);
        }
      }
    }

    // Create payments table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_mode VARCHAR(50) NOT NULL,
        utr_number VARCHAR(100),
        receipt_number VARCHAR(50),
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Add receipt_number to payments if missing
    try {
      await promisePool.query("ALTER TABLE payments ADD COLUMN receipt_number VARCHAR(50)");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') { /* already exists */ }
    }

    // Create student_queries table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS student_queries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        subject VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        status ENUM('open','resolved','in_progress') DEFAULT 'open',
        admin_reply TEXT,
        replied_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Create drivers table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        license_number VARCHAR(50),
        address TEXT,
        joined_date DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Add driver_id to buses table
    try {
      await promisePool.query("ALTER TABLE buses ADD COLUMN driver_id INT, ADD FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        // May already exist, that's fine
      }
    }

    // Create backup_logs table for tracking backups
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS backup_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        file_size BIGINT DEFAULT 0,
        status ENUM('success', 'failed') DEFAULT 'success',
        created_by VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      ) ENGINE=InnoDB;
    `);

    console.log('✅ Database schema verified and up to date');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
  }
}

// Export pool for query usage (backward compatible with .query())
module.exports = pool;
module.exports.promise = promisePool;
