const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDrivers() {
  const conn = await mysql.createConnection({
    host: 'gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com',
    user: 'EAodbPo6cLdTdgW.root',
    password: 'qe093ISz4OmKuH7B',
    database: 'college_bus_db',
    port: 4000,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });

  console.log('Creating drivers table...');
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS drivers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      license_number VARCHAR(50),
      address VARCHAR(500),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  console.log('Adding driver_id to buses...');
  try {
    await conn.execute(`ALTER TABLE buses ADD COLUMN driver_id INT DEFAULT NULL;`);
    await conn.execute(`ALTER TABLE buses ADD CONSTRAINT fk_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;`);
  } catch (e) {
    console.log('driver_id already exists or constraint exists:', e.message);
  }
  
  try {
    await conn.execute(`ALTER TABLE buses DROP COLUMN driver_name;`);
    await conn.execute(`ALTER TABLE buses DROP COLUMN driver_phone;`);
  } catch (e) {
    console.log('driver_name already dropped:', e.message);
  }

  console.log('Done fixing schema!');
  await conn.end();
}
fixDrivers();
