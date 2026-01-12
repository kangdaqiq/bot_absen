-- Alternative Migration: Simpler approach without foreign key constraint
-- Use this if the foreign key constraint continues to fail
-- Date: 2026-01-12

-- Add column to track which teacher performed manual check-in
ALTER TABLE attendance 
ADD COLUMN checked_in_by_teacher_id BIGINT UNSIGNED NULL 
COMMENT 'ID guru yang melakukan absen masuk manual';

-- Add index for better query performance
CREATE INDEX idx_attendance_teacher_checkout 
ON attendance(checked_in_by_teacher_id, tanggal, jam_pulang);

-- Note: Foreign key constraint omitted due to compatibility issues
-- Application code will handle referential integrity
