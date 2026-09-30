-- Production hardening migration. Run each statement through the Neon migration workflow.
ALTER TABLE students ADD COLUMN IF NOT EXISTS academic_year_id integer NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS academic_year_id integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS attendance (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year_id integer NOT NULL,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS attendance_year_date_idx ON attendance (academic_year_id, attendance_date);
CREATE INDEX IF NOT EXISTS attendance_student_idx ON attendance (student_id);
CREATE INDEX IF NOT EXISTS students_academic_year_idx ON students (academic_year_id);
CREATE INDEX IF NOT EXISTS teachers_academic_year_idx ON teachers (academic_year_id);
-- Remove the legacy teachers.password column only after authentication migration is deployed.
ALTER TABLE borrows ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE borrows ADD COLUMN IF NOT EXISTS borrower_type text NOT NULL DEFAULT 'student';
ALTER TABLE borrows ADD COLUMN IF NOT EXISTS borrower_id integer;
UPDATE borrows SET borrower_id = student_id WHERE borrower_id IS NULL;
CREATE INDEX IF NOT EXISTS borrows_book_active_idx ON borrows (book_id, returned_at);
