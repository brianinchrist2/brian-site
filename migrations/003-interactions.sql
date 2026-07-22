-- Migration 003: Interactions, Reports, Certificates, Notifications (7 tables)

CREATE TABLE IF NOT EXISTS highlights (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  anchor_data TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'yellow',
  comment     TEXT,
  visibility  TEXT NOT NULL DEFAULT 'private',
  class_ids   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_highlights_item ON highlights(item_id);
CREATE INDEX IF NOT EXISTS idx_highlights_user ON highlights(user_id);

CREATE TABLE IF NOT EXISTS highlight_replies (
  id           TEXT PRIMARY KEY,
  highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_replies_highlight ON highlight_replies(highlight_id);

CREATE TABLE IF NOT EXISTS questions (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES course_items(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  has_official INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_questions_course ON questions(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_student ON questions(student_id);

CREATE TABLE IF NOT EXISTS question_answers (
  id           TEXT PRIMARY KEY,
  question_id  TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  is_official  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_qa_question ON question_answers(question_id);

CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  rating     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, course_id, teacher_id, title)
);
CREATE INDEX IF NOT EXISTS idx_reports_student ON reports(student_id);

CREATE TABLE IF NOT EXISTS certificates (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  progress_pct REAL NOT NULL,
  applied_at   TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at  TEXT,
  issued_at    TEXT,
  UNIQUE(student_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT,
  entity_type TEXT,
  entity_id   TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);
