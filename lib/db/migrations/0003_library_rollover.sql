ALTER TABLE academic_years ADD COLUMN IF NOT EXISTS promoted_at timestamptz;
ALTER TABLE books ADD COLUMN IF NOT EXISTS subtitle text NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN IF NOT EXISTS publisher text NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN IF NOT EXISTS topic text NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN IF NOT EXISTS barcode text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS book_copies (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  book_id integer NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  copy_number integer NOT NULL,
  barcode text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_copies_copy_number_unique UNIQUE (book_id, copy_number)
);

CREATE INDEX IF NOT EXISTS book_copies_book_id_idx ON book_copies(book_id);
CREATE INDEX IF NOT EXISTS book_copies_status_idx ON book_copies(status);

UPDATE books SET barcode = CONCAT('LIB-', LPAD(id::text, 8, '0')) WHERE barcode = '';
INSERT INTO book_copies (book_id, copy_number, barcode)
SELECT b.id, n, CONCAT(b.barcode, '-', LPAD(n::text, 3, '0'))
FROM books b
CROSS JOIN LATERAL generate_series(1, GREATEST(b.copies, 1)) AS n
WHERE NOT EXISTS (SELECT 1 FROM book_copies c WHERE c.book_id = b.id);

UPDATE books b SET available_copies = COALESCE((SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.id AND c.status = 'available'), b.available_copies);
UPDATE books SET status = CASE WHEN available_copies > 0 THEN 'available' ELSE 'unavailable' END;
CREATE UNIQUE INDEX IF NOT EXISTS books_barcode_unique ON books(barcode) WHERE barcode <> '';
CREATE INDEX IF NOT EXISTS books_isbn_idx ON books(isbn);
CREATE INDEX IF NOT EXISTS students_search_idx ON students(full_name, student_number);
COMMIT;
