-- =====================================================
-- 🗄️  College Bus Management System
-- FRESH DATABASE — Matches Client Excel Exactly
-- HOLY-WOOD ACADEMY (TRANSPORTS 26-27)
--
-- Student table columns match Excel:
--   Name | Class | Old Bus Fees | Current Fees | Discount |
--   Total | Paid | Unpaid | Bus No | Pick-Up Point
--
-- HOW TO USE ON TiDB:
--   1. Login → TiDB Cloud → SQL Editor
--   2. Paste this entire file → Run
-- =====================================================

DROP DATABASE IF EXISTS college_bus_db;
CREATE DATABASE college_bus_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE college_bus_db;

-- ─────────────────────────────────────────────────────
-- TABLE: admins
-- ─────────────────────────────────────────────────────
CREATE TABLE admins (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(50)  UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  role        ENUM('super_admin','admin') DEFAULT 'admin',
  reset_token VARCHAR(100),
  reset_token_expires DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email    (email),
  INDEX idx_username (username)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────
-- TABLE: buses
-- ─────────────────────────────────────────────────────
CREATE TABLE buses (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  bus_number   VARCHAR(20)  NOT NULL UNIQUE,
  driver_name  VARCHAR(100),
  driver_phone VARCHAR(20),
  route        VARCHAR(255),
  capacity     INT DEFAULT 50,
  INDEX idx_bus_number (bus_number)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────
-- TABLE: students
-- Columns match client Excel sheet exactly
-- ─────────────────────────────────────────────────────
CREATE TABLE students (
  id          INT AUTO_INCREMENT PRIMARY KEY,

  -- ── Login (system) ──────────────────────────────────
  username    VARCHAR(100) UNIQUE NOT NULL,   -- auto-generated or phone
  password    VARCHAR(255) NOT NULL,           -- bcrypt hashed

  -- ── Excel: "Name of Students" ───────────────────────
  name        VARCHAR(150) NOT NULL,

  -- ── Excel: "Class" ──────────────────────────────────
  class_name  VARCHAR(100),                    -- e.g. "Class - 3rd", "Class - 10th (Passout)"

  -- ── Contact ─────────────────────────────────────────
  phone       VARCHAR(20),

  -- ── Excel: "Bus No." ────────────────────────────────
  bus_id      INT,                             -- FK → buses.id

  -- ── Excel: "Pick-Up Point" ──────────────────────────
  pick_up_point VARCHAR(150),                  -- e.g. "NIKAMWADI", "SARUD"

  -- ── Excel: "Old Bus Fees" ───────────────────────────
  old_bus_fees  DECIMAL(10,2) DEFAULT 0,       -- carry-forward dues from previous years

  -- ── Excel: "Currents Bus Fees" (2026-27) ────────────
  current_fees  DECIMAL(10,2) DEFAULT 0,       -- current academic year fees

  -- ── Excel: "Discount Amount" ────────────────────────
  discount_amount DECIMAL(10,2) DEFAULT 0,

  -- ── Excel: "Total Amount" (computed) ────────────────
  -- total_fees = old_bus_fees + current_fees - discount_amount
  total_fees    DECIMAL(10,2) DEFAULT 0,

  -- ── Excel: "Paid" ───────────────────────────────────
  fees_paid     DECIMAL(10,2) DEFAULT 0,

  -- ── Excel: "Unpaid Fees" (computed) ─────────────────
  -- remaining_fees = total_fees - fees_paid
  remaining_fees DECIMAL(10,2) DEFAULT 0,

  -- ── Status (from last section in Excel) ─────────────
  -- active       = currently enrolled
  -- passout      = completed 10th/12th, old dues pending
  -- school_left  = left school, old dues pending
  student_status ENUM('active','passout','school_left') DEFAULT 'active',

  -- ── System ──────────────────────────────────────────
  joining_date   DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_updated   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  reset_token    VARCHAR(100),
  reset_token_expires DATETIME,

  FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE SET NULL,
  INDEX idx_name          (name),
  INDEX idx_bus_id        (bus_id),
  INDEX idx_pick_up_point (pick_up_point),
  INDEX idx_remaining     (remaining_fees),
  INDEX idx_status        (student_status)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────
-- TABLE: payments  (one row per transaction)
-- ─────────────────────────────────────────────────────
CREATE TABLE payments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  student_id     INT NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,
  payment_mode   VARCHAR(50) NOT NULL,    -- Cash / Online / Cheque
  utr_number     VARCHAR(100),
  receipt_number VARCHAR(50),
  payment_date   DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes          TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_student_id  (student_id),
  INDEX idx_payment_date(payment_date)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────
-- TABLE: settings
-- ─────────────────────────────────────────────────────
CREATE TABLE settings (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  setting_key   VARCHAR(50) UNIQUE NOT NULL,
  setting_value VARCHAR(255),
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO settings (setting_key, setting_value) VALUES
  ('school_name',   'HOLY-WOOD ACADEMY'),
  ('academic_year', '2026-27'),
  ('fee_year',      '2026-27');

-- ─────────────────────────────────────────────────────
-- Default super admin
-- Login: superadmin / SuperAdmin@2024
-- (password gets re-hashed on first server start)
-- ─────────────────────────────────────────────────────
INSERT INTO admins (username, password, email, role)
VALUES ('superadmin', 'REHASH_ON_START', 'ravikurane12@gmail.com', 'super_admin');

-- ─────────────────────────────────────────────────────
-- VERIFY
-- ─────────────────────────────────────────────────────
SELECT 'Database created successfully!' AS status;
SHOW TABLES;
DESCRIBE students;
