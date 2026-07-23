-- 013-submission-versions.sql
-- Add versioning to assignment_submissions: attempt tracking with latest flag
-- Must rebuild table because SQLite ALTER TABLE cannot drop constraints

CREATE TABLE IF NOT EXISTS _assignment_submissions_new (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT,
  status        TEXT NOT NULL DEFAULT 'submitted',
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  is_latest     INTEGER NOT NULL DEFAULT 1,
  UNIQUE(assignment_id, student_id, attempt_number)
);

INSERT INTO _assignment_submissions_new (id, assignment_id, student_id, content, status, submitted_at, attempt_number, is_latest)
SELECT id, assignment_id, student_id, content, status, submitted_at, 1, 1 FROM assignment_submissions;

DROP TABLE assignment_submissions;
ALTER TABLE _assignment_submissions_new RENAME TO assignment_submissions;

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_latest ON assignment_submissions(assignment_id, student_id, is_latest);
