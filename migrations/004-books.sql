CREATE TABLE IF NOT EXISTS books (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  author      TEXT,
  description TEXT,
  cover_url   TEXT,
  language    TEXT NOT NULL DEFAULT 'zh',
  status      TEXT NOT NULL DEFAULT 'draft',
  source_path TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);

CREATE TABLE IF NOT EXISTS book_chapters (
  id             TEXT PRIMARY KEY,
  book_id        TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title          TEXT NOT NULL,
  content_path   TEXT NOT NULL,
  summary        TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_book_chapters_book ON book_chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_book_chapters_sort ON book_chapters(book_id, sort_order);
