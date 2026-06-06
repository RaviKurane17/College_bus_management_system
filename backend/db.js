// =========================
// 🗄️ Database Connection
// Student columns match client Excel exactly:
//   name | class_name | phone | bus_id | pick_up_point
//   old_bus_fees | current_fees | discount_amount
//   total_fees | fees_paid | remaining_fees | student_status
// =========================
require('dotenv').config();
const mysql  = require('mysql2');
const bcrypt = require('bcryptjs');

const poolConfig = {
  host:             process.env.DB_HOST     || 'localhost',
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  database:         process.env.DB_NAME     || 'college_bus_db',
  port:             parseInt(process.env.DB_PORT) || 3306,
  connectionLimit:  parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};
if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
}

const pool        = mysql.createPool(poolConfig);
const promisePool = pool.promise();

pool.getConnection((err, conn) => {
  if (err) { console.error('❌ MySQL connection error:', err.message); return; }
  console.log('✅ MySQL connection pool established');
  conn.release();
  initializeDatabase();
});

// Silently ignore "column already exists" errors (safe for re-runs)
async function safeAlter(sql) {
  try { await promisePool.query(sql); }
  catch (e) {
    if (!e.message.includes('Duplicate column') && e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') {
      console.warn('Migration warning:', e.message);
    }
  }
}

async function initializeDatabase() {
  try {

    // ── Admins ──────────────────────────────────────────────────────
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        username    VARCHAR(50)  UNIQUE NOT NULL,
        password    VARCHAR(255) NOT NULL,
        email       VARCHAR(100) UNIQUE NOT NULL,
        role        ENUM('super_admin','admin') DEFAULT 'admin',
        reset_token VARCHAR(100),
        reset_token_expires DATETIME,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email), INDEX idx_username (username)
      ) ENGINE=InnoDB
    `);

    // ── Buses ────────────────────────────────────────────────────────
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS buses (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        bus_number   VARCHAR(20) NOT NULL UNIQUE,
        driver_name  VARCHAR(100),
        driver_phone VARCHAR(20),
        route        VARCHAR(255),
        capacity     INT DEFAULT 50,
        INDEX idx_bus_number (bus_number)
      ) ENGINE=InnoDB
    `);

    // ── Students — matches client Excel columns ──────────────────────
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        username       VARCHAR(100) UNIQUE NOT NULL,
        password       VARCHAR(255) NOT NULL,
        name           VARCHAR(150) NOT NULL,
        class_name     VARCHAR(100),
        phone          VARCHAR(20),
        bus_id         INT,
        pick_up_point  VARCHAR(150),
        old_bus_fees   DECIMAL(10,2) DEFAULT 0,
        current_fees   DECIMAL(10,2) DEFAULT 0,
        discount_amount DECIMAL(10,2) DEFAULT 0,
        total_fees     DECIMAL(10,2) DEFAULT 0,
        fees_paid      DECIMAL(10,2) DEFAULT 0,
        remaining_fees DECIMAL(10,2) DEFAULT 0,
        student_status ENUM('active','passout','school_left') DEFAULT 'active',
        joining_date   DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        reset_token    VARCHAR(100),
        reset_token_expires DATETIME,
        FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE SET NULL,
        INDEX idx_name    (name),
        INDEX idx_bus_id  (bus_id),
        INDEX idx_status  (student_status),
        INDEX idx_remain  (remaining_fees)
      ) ENGINE=InnoDB
    `);

    // Safe migrations (if upgrading existing DB)
    const migrations = [
      "ALTER TABLE students ADD COLUMN class_name VARCHAR(100)",
      "ALTER TABLE students ADD COLUMN phone VARCHAR(20)",
      "ALTER TABLE students ADD COLUMN pick_up_point VARCHAR(150)",
      "ALTER TABLE students ADD COLUMN old_bus_fees DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE students ADD COLUMN current_fees DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE students ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE students ADD COLUMN total_fees DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE students ADD COLUMN fees_paid DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE students ADD COLUMN remaining_fees DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE students ADD COLUMN student_status ENUM('active','passout','school_left') DEFAULT 'active'",
      "ALTER TABLE students ADD COLUMN reset_token VARCHAR(100)",
      "ALTER TABLE students ADD COLUMN reset_token_expires DATETIME",
    ];
    for (const q of migrations) await safeAlter(q);

    // ── Payments ─────────────────────────────────────────────────────
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        student_id     INT NOT NULL,
        amount         DECIMAL(10,2) NOT NULL,
        payment_mode   VARCHAR(50) NOT NULL,
        utr_number     VARCHAR(100),
        receipt_number VARCHAR(50),
        payment_date   DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes          TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        INDEX idx_student_id  (student_id),
        INDEX idx_payment_date(payment_date)
      ) ENGINE=InnoDB
    `);
    await safeAlter("ALTER TABLE payments ADD COLUMN receipt_number VARCHAR(50)");
    await safeAlter("ALTER TABLE payments ADD COLUMN notes TEXT");

    // ── Settings ─────────────────────────────────────────────────────
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        setting_key   VARCHAR(50) UNIQUE NOT NULL,
        setting_value VARCHAR(255),
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    for (const [k, v] of [
      ['school_name','HOLY-WOOD ACADEMY'],
      ['academic_year','2026-27'],
      ['fee_year','2026-27']
    ]) { await promisePool.query('INSERT IGNORE INTO settings (setting_key,setting_value) VALUES (?,?)', [k,v]); }

    // ── Student Queries ───────────────────────────────────────────────
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS student_queries (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        student_id  INT NOT NULL,
        subject     VARCHAR(200) NOT NULL,
        message     TEXT NOT NULL,
        status      ENUM('open','resolved','in_progress') DEFAULT 'open',
        admin_reply TEXT,
        replied_at  DATETIME,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        INDEX idx_student_id(student_id),
        INDEX idx_status    (status)
      ) ENGINE=InnoDB
    `);

    // ── Backup Logs ───────────────────────────────────────────────────
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS backup_logs (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        filename   VARCHAR(255) NOT NULL,
        file_size  BIGINT DEFAULT 0,
        status     ENUM('success','failed') DEFAULT 'success',
        created_by VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // ── Create super admin ────────────────────────────────────────────
    const [admins] = await promisePool.query('SELECT * FROM admins');
    if (!admins.some(a => a.role === 'super_admin')) {
      const hashed = await bcrypt.hash('SuperAdmin@2024', 12);
      try {
        await promisePool.query(
          'INSERT INTO admins (username,password,email,role) VALUES (?,?,?,?)',
          ['superadmin', hashed, process.env.EMAIL_USER || 'ravikurane12@gmail.com', 'super_admin']
        );
        console.log('✅ Super admin created — username: superadmin | password: SuperAdmin@2024');
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY')
          await promisePool.query("UPDATE admins SET role='super_admin' WHERE username='superadmin'");
      }
    }

    // Rehash any plaintext admin passwords
    for (const a of admins) {
      if (!a.password.startsWith('$2')) {
        await promisePool.query('UPDATE admins SET password=? WHERE id=?',
          [await bcrypt.hash(a.password, 12), a.id]);
      }
    }

    console.log('✅ Database ready — student columns: name, class_name, bus_id, pick_up_point, old_bus_fees, current_fees, discount_amount, total_fees, fees_paid, remaining_fees, student_status');

  } catch (err) {
    console.error('❌ DB init error:', err.message);
  }
}

module.exports = pool;
module.exports.promise = promisePool;
