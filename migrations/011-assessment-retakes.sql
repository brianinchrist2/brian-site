-- 011-assessment-retakes.sql
-- Add retake capability: track attempt numbers, mark latest submission
-- Must rebuild table because SQLite ALTER TABLE cannot drop constraints

CREATE TABLE IF NOT EXISTS _assessment_submissions_new (
  id            TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at  TEXT,
  status        TEXT NOT NULL DEFAULT 'in_progress',
  total_score   REAL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  is_latest     INTEGER NOT NULL DEFAULT 1,
  UNIQUE(assessment_id, student_id, attempt_number)
);

INSERT INTO _assessment_submissions_new (id, assessment_id, student_id, started_at, submitted_at, status, total_score, attempt_number, is_latest)
SELECT id, assessment_id, student_id, started_at, submitted_at, status, total_score, 1, 1 FROM assessment_submissions;

DROP TABLE assessment_submissions;
ALTER TABLE _assessment_submissions_new RENAME TO assessment_submissions;

CREATE INDEX IF NOT EXISTS idx_submissions_assessment ON assessment_submissions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assessment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_latest ON assessment_submissions(assessment_id, student_id, is_latest);
