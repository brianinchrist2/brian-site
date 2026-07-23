-- 012-cascade-fixes.sql
-- Fix orphaned data: change ON DELETE SET NULL to ON DELETE CASCADE for
-- video_lessons.course_id and questions.item_id
-- Must rebuild tables because SQLite ALTER TABLE cannot change constraints

-- === video_lessons: course_id ON DELETE CASCADE ===

CREATE TABLE IF NOT EXISTS _video_lessons_new (
  id               TEXT PRIMARY KEY,
  course_id        TEXT REFERENCES courses(id) ON DELETE CASCADE,
  class_id         TEXT REFERENCES classes(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  video_type       TEXT NOT NULL DEFAULT 'video',
  video_url        TEXT NOT NULL,
  thumbnail_url    TEXT,
  duration_minutes INTEGER,
  scheduled_at     TEXT,
  status           TEXT NOT NULL DEFAULT 'published',
  meeting_link     TEXT,
  meeting_password TEXT,
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO _video_lessons_new (id, course_id, class_id, title, video_type, video_url, thumbnail_url, duration_minutes, scheduled_at, status, meeting_link, meeting_password, created_by, created_at, updated_at)
SELECT id, course_id, class_id, title, video_type, video_url, thumbnail_url, duration_minutes, scheduled_at, status, meeting_link, meeting_password, created_by, created_at, updated_at FROM video_lessons;

DROP TABLE video_lessons;
ALTER TABLE _video_lessons_new RENAME TO video_lessons;

CREATE INDEX IF NOT EXISTS idx_videos_course ON video_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_videos_class ON video_lessons(class_id);

-- === questions: item_id ON DELETE CASCADE ===

CREATE TABLE IF NOT EXISTS _questions_new (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES course_items(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  has_official INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO _questions_new (id, student_id, course_id, item_id, title, body, status, has_official, created_at, updated_at)
SELECT id, student_id, course_id, item_id, title, body, status, has_official, created_at, updated_at FROM questions;

DROP TABLE questions;
ALTER TABLE _questions_new RENAME TO questions;

CREATE INDEX IF NOT EXISTS idx_questions_course ON questions(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_student ON questions(student_id);
