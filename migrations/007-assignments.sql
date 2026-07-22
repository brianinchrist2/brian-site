CREATE TABLE IF NOT EXISTS assignments (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'homework',
  description   TEXT,
  due_date      TEXT,
  max_score     REAL NOT NULL DEFAULT 100,
  late_penalty  REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft',
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT,
  status        TEXT NOT NULL DEFAULT 'submitted',
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_id);

CREATE TABLE IF NOT EXISTS assignment_grades (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  teacher_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score         REAL NOT NULL,
  feedback      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(submission_id)
);
CREATE INDEX IF NOT EXISTS idx_grades_submission ON assignment_grades(submission_id);
