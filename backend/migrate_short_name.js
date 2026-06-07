const db = require('./db');

async function migrate() {
  try {
    const promisePool = db.promise;
    console.log('Connected to TiDB. Running migration...');
    try {
      await promisePool.query('ALTER TABLE buses ADD COLUMN short_name VARCHAR(50)');
      console.log('Successfully added short_name column to buses table.');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('short_name column already exists. Skipping.');
      } else {
        throw e;
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
