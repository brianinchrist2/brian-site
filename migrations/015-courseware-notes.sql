-- 015-courseware-notes.sql
-- 课件笔记：按用户隔离，跨设备同步（last-write-wins）

CREATE TABLE IF NOT EXISTS courseware_notes (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id        TEXT NOT NULL,
  chapter_id     TEXT NOT NULL,          -- 课件 cw id，如 "introduction"
  question_type  TEXT NOT NULL,          -- 'guided' | 'exploratory' | 'practical'
  question_index INTEGER NOT NULL,       -- 0-based
  content        TEXT NOT NULL DEFAULT '',
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, book_id, chapter_id, question_type, question_index)
);
CREATE INDEX IF NOT EXISTS idx_courseware_notes_user
  ON courseware_notes(user_id, book_id, chapter_id);
