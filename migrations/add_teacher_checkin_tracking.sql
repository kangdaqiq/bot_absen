-- Migration: Add teacher tracking for manual check-ins
-- Date: 2026-01-12

-- Step 1: Drop column if it already exists (in case of retry)
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = DATABASE() 
               AND TABLE_NAME = 'attendance' 
               AND COLUMN_NAME = 'checked_in_by_teacher_id');
SET @sqlstmt := IF(@exist > 0, 'ALTER TABLE attendance DROP COLUMN checked_in_by_teacher_id', 'SELECT ''Column does not exist''');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Add column to track which teacher performed manual check-in
ALTER TABLE attendance 
ADD COLUMN checked_in_by_teacher_id BIGINT UNSIGNED NULL 
COMMENT 'ID guru yang melakukan absen masuk manual';

-- Step 3: Add index for better query performance
CREATE INDEX idx_attendance_teacher_checkout 
ON attendance(checked_in_by_teacher_id, tanggal, jam_pulang);

-- Note: Foreign key constraint omitted due to MySQL compatibility issues
-- Application code will handle referential integrity

