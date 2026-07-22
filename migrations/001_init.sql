-- 鐢ㄦ埛琛紙鍚堝苟鍘?KV 鏁版嵁锛?
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  nickname   TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt       TEXT NOT NULL,
  roles      TEXT NOT NULL DEFAULT '["student"]',
  avatar_url TEXT,
  bio        TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 璇剧▼琛?
CREATE TABLE courses (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  cover_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 璇剧▼鍐呭鍗曞厓

CREATE TABLE course_items (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  item_ref    TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);


CREATE INDEX idx_course_items_course ON course_items(course_id);

CREATE INDEX idx_course_items_type ON course_items(type);

-- 鐝骇琛?
CREATE TABLE classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  advisor_id  TEXT NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 鐝骇 鈫?璇剧▼

CREATE TABLE class_courses (
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, course_id)
);

-- 鐝骇 鈫?瀛︾敓

CREATE TABLE class_members (
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, student_id)
);

-- 璇剧▼娉ㄥ唽

CREATE TABLE enrollments (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  class_id    TEXT REFERENCES classes(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, course_id)
);


CREATE INDEX idx_enrollments_student ON enrollments(student_id);

CREATE INDEX idx_enrollments_course ON enrollments(course_id);

CREATE INDEX idx_class_members_student ON class_members(student_id);

-- 瀛︿範杩涘害

CREATE TABLE progress (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'started',
  score       INTEGER,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(student_id, item_id)
);


CREATE INDEX idx_progress_student ON progress(student_id);

CREATE INDEX idx_progress_course ON progress(course_id);

-- 绛旈璁板綍

CREATE TABLE answers (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question_text TEXT,
  answer_text TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, item_id, question_index)
);


CREATE INDEX idx_answers_student ON answers(student_id);

CREATE INDEX idx_answers_item ON answers(item_id);

-- 瀛︿範浼氳瘽

CREATE TABLE learning_sessions (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES course_items(id) ON DELETE SET NULL,
  duration_minutes INTEGER NOT NULL,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT NOT NULL DEFAULT (datetime('now'))
);


CREATE INDEX idx_sessions_student ON learning_sessions(student_id);

CREATE INDEX idx_sessions_course ON learning_sessions(course_id);

