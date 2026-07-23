-- Migration 002: Attendance System
-- Creates class_sessions, attendance_records, session_topics
-- Depends on: classes, courses, users, course_items tables existing

CREATE TABLE IF NOT EXISTS class_sessions (
  id           TEXT PRIMARY KEY,
  class_id     TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  session_date TEXT NOT NULL,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  location     TEXT,
  session_type TEXT NOT NULL DEFAULT 'in_person',
  meeting_url  TEXT,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_class_sessions_class ON class_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_date ON class_sessions(session_date);

CREATE TABLE IF NOT EXISTS attendance_records (
  id                TEXT PRIMARY KEY,
  class_session_id  TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'absent'
    CHECK(status IN ('present', 'absent', 'late', 'excused')),
  check_in_time     TEXT,
  notes             TEXT,
  recorded_by       TEXT NOT NULL REFERENCES users(id),
  recorded_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(class_session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(class_session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);

CREATE TABLE IF NOT EXISTS session_topics (
  id               TEXT PRIMARY KEY,
  class_session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  course_item_id   TEXT REFERENCES course_items(id) ON DELETE SET NULL,
  notes            TEXT
);
