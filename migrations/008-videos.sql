CREATE TABLE IF NOT EXISTS video_lessons (
  id               TEXT PRIMARY KEY,
  course_id        TEXT REFERENCES courses(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_videos_course ON video_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_videos_class ON video_lessons(class_id);

CREATE TABLE video_watch_logs (
  id                     TEXT PRIMARY KEY,
  video_lesson_id        TEXT NOT NULL REFERENCES video_lessons(id) ON DELETE CASCADE,
  student_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watch_duration_seconds INTEGER NOT NULL DEFAULT 0,
  last_position_seconds  INTEGER NOT NULL DEFAULT 0,
  completed              INTEGER NOT NULL DEFAULT 0,
  first_watched_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_watched_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(video_lesson_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_watchlogs_video ON video_watch_logs(video_lesson_id);
CREATE INDEX IF NOT EXISTS idx_watchlogs_student ON video_watch_logs(student_id);
