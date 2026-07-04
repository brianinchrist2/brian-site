-- Phase 3: 提问模块

-- 问题表
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  item_id TEXT,  -- 可为空（通用提问）
  title TEXT NOT NULL,
  body TEXT,
  status TEXT DEFAULT 'open',  -- open, answered, closed
  has_official INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES course_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_student ON questions(student_id);
CREATE INDEX IF NOT EXISTS idx_questions_course ON questions(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_item ON questions(item_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);

-- 问题回答表
CREATE TABLE IF NOT EXISTS question_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_official INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_question_answers_question ON question_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_question_answers_user ON question_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_question_answers_official ON question_answers(is_official);
