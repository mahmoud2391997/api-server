CREATE TABLE IF NOT EXISTS student_accounts (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id integer NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  username text NOT NULL,
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT student_accounts_school_username_unique UNIQUE (school_id, username),
  CONSTRAINT student_accounts_student_unique UNIQUE (school_id, student_id)
);
ALTER TABLE students ADD COLUMN IF NOT EXISTS local_id integer;
ALTER TABLE books ADD COLUMN IF NOT EXISTS local_id integer;
ALTER TABLE borrows ADD COLUMN IF NOT EXISTS local_id integer;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS local_id integer;
CREATE INDEX IF NOT EXISTS student_accounts_school_idx ON student_accounts (school_id);
CREATE INDEX IF NOT EXISTS students_school_local_idx ON students (school_id, local_id);
CREATE INDEX IF NOT EXISTS books_school_local_idx ON books (school_id, local_id);
CREATE INDEX IF NOT EXISTS borrows_school_local_idx ON borrows (school_id, local_id);
CREATE INDEX IF NOT EXISTS attendance_school_local_idx ON attendance (school_id, local_id);
