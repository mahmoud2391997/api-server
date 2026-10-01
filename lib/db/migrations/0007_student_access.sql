-- Create student_access table for student authentication
-- This table stores hashed passwords for student access to the library system

CREATE TABLE IF NOT EXISTS student_access (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    mode TEXT NOT NULL DEFAULT 'shared' CHECK (mode IN ('shared', 'per_student')),
    password_hash TEXT NOT NULL,
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(school_id, mode, student_id)
);

-- Create index for quick lookup by school
CREATE INDEX IF NOT EXISTS student_access_school_id_idx ON student_access(school_id);

-- Create index for active access entries
CREATE INDEX IF NOT EXISTS student_access_is_active_idx ON student_access(is_active) WHERE is_active = TRUE;
