ALTER TABLE courses ADD COLUMN start_date TEXT;
ALTER TABLE courses ADD COLUMN end_date TEXT;
ALTER TABLE course_items ADD COLUMN book_id TEXT REFERENCES books(id) ON DELETE SET NULL;
ALTER TABLE course_items ADD COLUMN book_chapter_id TEXT REFERENCES book_chapters(id) ON DELETE SET NULL;
