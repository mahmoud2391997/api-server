-- Multi-school support migration
-- This migration adds support for multiple schools with isolated data

-- Create schools table
CREATE TABLE IF NOT EXISTS schools (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name TEXT NOT NULL UNIQUE,
    name_arabic TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    principal_name TEXT NOT NULL DEFAULT '',
    established_date DATE,
    api_key TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add school_id to academic_years
ALTER TABLE academic_years ADD COLUMN IF NOT EXISTS school_id INTEGER NOT NULL DEFAULT 1 REFERENCES schools(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_school_label_idx ON academic_years(school_id, label);

-- Add school_id to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_id INTEGER NOT NULL DEFAULT 1 REFERENCES schools(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS students_student_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS students_school_student_number_idx ON students(school_id, student_number);

-- Add school_id to teachers
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS school_id INTEGER NOT NULL DEFAULT 1 REFERENCES schools(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS teachers_employee_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS teachers_school_employee_code_idx ON teachers(school_id, employee_code);

-- Add school_id to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS school_id INTEGER NOT NULL DEFAULT 1 REFERENCES schools(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS employees_employee_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS employees_school_employee_number_idx ON employees(school_id, employee_number);

-- Add school_id to books
ALTER TABLE books ADD COLUMN IF NOT EXISTS school_id INTEGER NOT NULL DEFAULT 1 REFERENCES schools(id) ON DELETE CASCADE;

-- Add school_id to attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS school_id INTEGER NOT NULL DEFAULT 1 REFERENCES schools(id) ON DELETE CASCADE;

-- Add school_id to borrows
ALTER TABLE borrows ADD COLUMN IF NOT EXISTS school_id INTEGER NOT NULL DEFAULT 1 REFERENCES schools(id) ON DELETE CASCADE;

-- Insert default school for existing data
INSERT INTO schools (name, name_arabic, code, api_key)
VALUES ('Default School', 'المدرسة الافتراضية', 'DEFAULT', 'sk-default-school-api-key-change-me')
ON CONFLICT (code) DO NOTHING;

-- Update existing records to reference the default school
UPDATE academic_years SET school_id = 1 WHERE school_id = 1;
UPDATE students SET school_id = 1 WHERE school_id = 1;
UPDATE teachers SET school_id = 1 WHERE school_id = 1;
UPDATE employees SET school_id = 1 WHERE school_id = 1;
UPDATE books SET school_id = 1 WHERE school_id = 1;
UPDATE attendance SET school_id = 1 WHERE school_id = 1;
UPDATE borrows SET school_id = 1 WHERE school_id = 1;
