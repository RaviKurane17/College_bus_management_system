-- =================================
-- 🔄 Migration: Add Client-Wise Fee Columns
-- Run this ONCE on existing databases
-- Safe — uses IF NOT EXISTS pattern via try-catch in db.js
-- Or run manually on MySQL CLI
-- =================================

USE college_bus_db;

-- Add pick_up_point
ALTER TABLE students ADD COLUMN IF NOT EXISTS pick_up_point VARCHAR(150) DEFAULT NULL;

-- Add class_name (school class like "Class - 3rd")
ALTER TABLE students ADD COLUMN IF NOT EXISTS class_name VARCHAR(100) DEFAULT NULL;

-- Add old_bus_fees (carry-forward from previous years)
ALTER TABLE students ADD COLUMN IF NOT EXISTS old_bus_fees DECIMAL(10,2) DEFAULT 0;

-- Add 2025-26 year fees
ALTER TABLE students ADD COLUMN IF NOT EXISTS fees_2526 DECIMAL(10,2) DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS fees_paid_2526 DECIMAL(10,2) DEFAULT 0;

-- Add 2026-27 year fees (CURRENT YEAR from client file)
ALTER TABLE students ADD COLUMN IF NOT EXISTS fees_2627 DECIMAL(10,2) DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS fees_paid_2627 DECIMAL(10,2) DEFAULT 0;

-- Add discount column
ALTER TABLE students ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;

-- Add academic_year to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS academic_year VARCHAR(20) DEFAULT '2026-27';

-- Add indexes for new columns
ALTER TABLE students ADD INDEX IF NOT EXISTS idx_pick_up_point (pick_up_point);
ALTER TABLE students ADD INDEX IF NOT EXISTS idx_bus_id (bus_id);

-- Add school_name / academic settings
INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
  ('current_academic_year', '2026-27'),
  ('school_name', 'HOLY-WOOD ACADEMY'),
  ('fee_period_start', '2026-04-01'),
  ('fee_period_end', '2027-03-31');

SELECT 'Migration complete!' AS status;
