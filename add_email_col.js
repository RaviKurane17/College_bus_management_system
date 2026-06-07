const db = require('./backend/db');

async function migrate() {
  try {
    const pool = db.promise;
    await pool.query("ALTER TABLE students ADD COLUMN email VARCHAR(100) DEFAULT NULL;");
    console.log("Column 'email' added successfully!");
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log("Column 'email' already exists.");
    } else {
      console.error("Migration error:", err);
    }
  } finally {
    process.exit(0);
  }
}

migrate();
