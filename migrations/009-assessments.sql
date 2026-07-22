CREATE TABLE IF NOT EXISTS assessments (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'quiz',
  total_score     REAL NOT NULL DEFAULT 100,
  passing_score   REAL NOT NULL DEFAULT 60,
  duration_minutes INTEGER,
  available_from  TEXT,
  available_until TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assessments_course ON assessments(course_id);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id            TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice',
  options       TEXT,
  correct_answer TEXT,
  explanation   TEXT,
  points        REAL NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_questions_assessment ON assessment_questions(assessment_id);

CREATE TABLE IF NOT EXISTS assessment_submissions (
  id            TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at  TEXT,
  status        TEXT NOT NULL DEFAULT 'in_progress',
  total_score   REAL,
  UNIQUE(assessment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_submissions_assessment ON assessment_submissions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assessment_submissions(student_id);

CREATE TABLE IF NOT EXISTS assessment_answers (
  id                    TEXT PRIMARY KEY,
  submission_id         TEXT NOT NULL REFERENCES assessment_submissions(id) ON DELETE CASCADE,
  assessment_question_id TEXT NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  answer_text           TEXT,
  selected_option       TEXT,
  score                 REAL,
  feedback              TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON assessment_answers(submission_id);
