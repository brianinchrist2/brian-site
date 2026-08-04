CREATE TABLE grade_components (
  id             TEXT PRIMARY KEY,
  course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK(component_type IN ('assignment','assessment','attendance','participation','video')),
  weight         REAL NOT NULL,
  created_by     TEXT NOT NULL REFERENCES users(id),
  UNIQUE(course_id, name)
);
CREATE INDEX IF NOT EXISTS idx_grade_components_course ON grade_components(course_id);

CREATE TABLE final_grades (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  total_score  REAL,
  letter_grade TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','published')),
  breakdown    TEXT,
  calculated_at TEXT,
  approved_by  TEXT REFERENCES users(id),
  approved_at  TEXT,
  notes        TEXT,
  UNIQUE(student_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_final_grades_student ON final_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_course ON final_grades(course_id);
