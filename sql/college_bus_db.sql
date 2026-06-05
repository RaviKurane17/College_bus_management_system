-- =================================
-- 🗄️ College Bus Management System
-- Complete Database Schema (Production-Level)
-- =================================

CREATE DATABASE IF NOT EXISTS college_bus_db;
USE college_bus_db;

-- Admins
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,  -- bcrypt hashed
  email VARCHAR(100) UNIQUE NOT NULL,
  reset_token VARCHAR(100),
  reset_token_expires DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_username (username)
) ENGINE=InnoDB;

-- Drivers
CREATE TABLE IF NOT EXISTS drivers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  license_number VARCHAR(50),
  address TEXT,
  joined_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone (phone)
) ENGINE=InnoDB;

-- Buses
CREATE TABLE IF NOT EXISTS buses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bus_number VARCHAR(20) NOT NULL UNIQUE,
  driver_name VARCHAR(100),  -- Legacy column
  driver_phone VARCHAR(20),  -- Legacy column
  driver_id INT,
  capacity INT NOT NULL DEFAULT 0,
  route VARCHAR(255),
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
  INDEX idx_bus_number (bus_number)
) ENGINE=InnoDB;

-- Students
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,  -- bcrypt hashed
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
  concession DECIMAL(10,2) DEFAULT 0,
  concession_reason VARCHAR(255),
  payment_cycle VARCHAR(100),
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

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_mode VARCHAR(50) NOT NULL,
  utr_number VARCHAR(100),
  receipt_url VARCHAR(500),
  payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_student_id (student_id),
  INDEX idx_payment_date (payment_date)
) ENGINE=InnoDB;

-- Student Queries
CREATE TABLE IF NOT EXISTS student_queries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  attachment_url VARCHAR(500),
  status ENUM('open','resolved','in_progress') DEFAULT 'open',
  admin_reply TEXT,
  replied_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_student_id (student_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- Backup Logs
CREATE TABLE IF NOT EXISTS backup_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  file_size BIGINT DEFAULT 0,
  status ENUM('success', 'failed') DEFAULT 'success',
  created_by VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
) ENGINE=InnoDB;

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Insert default admin (password will be hashed on first server start)
-- Default credentials: admin / admin123
INSERT IGNORE INTO admins (username, password, email)
VALUES ('admin', 'admin123', 'ravikurane12@gmail.com');
