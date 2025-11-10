-- Create DB and use it
CREATE DATABASE IF NOT EXISTS college_bus_db;
USE college_bus_db;

-- Admins
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  reset_token VARCHAR(100),
  reset_token_expires DATETIME
) ENGINE=InnoDB;

-- Buses
CREATE TABLE IF NOT EXISTS buses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bus_number VARCHAR(50) NOT NULL,
  driver_name VARCHAR(100),
  driver_phone VARCHAR(20),
  capacity INT DEFAULT 0,
  route VARCHAR(150)
) ENGINE=InnoDB;

-- Students
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  roll_no VARCHAR(50) UNIQUE NOT NULL,
  department VARCHAR(150),
  bus_id INT,
  fees_paid DECIMAL(10,2) DEFAULT 0,
  remaining_fees DECIMAL(10,2) DEFAULT 0,
  joining_date DATE NOT NULL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Insert default admin (if not exists)
-- WARNING: This will replace any existing admin named 'admin' in the SQL import only.
DELETE FROM admins WHERE username = 'admin';
INSERT INTO admins (username, password, email)
VALUES ('admin', 'admin123', 'ravikurane12@gmail.com');
