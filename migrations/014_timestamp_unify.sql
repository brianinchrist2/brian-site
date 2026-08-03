-- 统一时间戳格式：空格格式 (datetime('now')) → ISO 8601 (2026-08-01T12:00:00.000Z)
-- 幂等：WHERE 条件天然可重复执行
-- 执行前请先备份: wrangler d1 export DB_NAME --output backup.sql
-- 列名核对（本地, 依据 migrations/001-013 定义）：
--   已移除: video_watch_logs.watched_at（实际列为 updated_at, 008-videos.sql:28）
--   已移除: session_topics.created_at（无该列, 002-attendance.sql:38-43）
--   已移除: class_sessions.updated_at（仅 created_at, 002-attendance.sql:5-19）
--   已移除: certificates.approved_at（实际列为 applied_at/reviewed_at/issued_at, 003-interactions.sql:67-78）

UPDATE class_members SET joined_at = REPLACE(joined_at, ' ', 'T') || 'Z'
  WHERE joined_at NOT LIKE '%T%' AND joined_at <> '';

UPDATE answers SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE answers SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE progress SET started_at = REPLACE(started_at, ' ', 'T') || 'Z'
  WHERE started_at NOT LIKE '%T%' AND started_at <> '';
UPDATE progress SET completed_at = REPLACE(completed_at, ' ', 'T') || 'Z'
  WHERE completed_at NOT LIKE '%T%' AND completed_at <> '';

UPDATE notifications SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE users SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE users SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE courses SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE courses SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE course_items SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE classes SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE classes SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE class_courses SET assigned_at = REPLACE(assigned_at, ' ', 'T') || 'Z'
  WHERE assigned_at NOT LIKE '%T%' AND assigned_at <> '';

UPDATE enrollments SET enrolled_at = REPLACE(enrolled_at, ' ', 'T') || 'Z'
  WHERE enrolled_at NOT LIKE '%T%' AND enrolled_at <> '';

UPDATE class_sessions SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE attendance_records SET recorded_at = REPLACE(recorded_at, ' ', 'T') || 'Z'
  WHERE recorded_at NOT LIKE '%T%' AND recorded_at <> '';

UPDATE assessment_submissions SET started_at = REPLACE(started_at, ' ', 'T') || 'Z'
  WHERE started_at NOT LIKE '%T%' AND started_at <> '';
UPDATE assessment_submissions SET submitted_at = REPLACE(submitted_at, ' ', 'T') || 'Z'
  WHERE submitted_at NOT LIKE '%T%' AND submitted_at <> '';

UPDATE assignment_submissions SET submitted_at = REPLACE(submitted_at, ' ', 'T') || 'Z'
  WHERE submitted_at NOT LIKE '%T%' AND submitted_at <> '';

UPDATE assignment_grades SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE questions SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE questions SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE question_answers SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE certificates SET applied_at = REPLACE(applied_at, ' ', 'T') || 'Z'
  WHERE applied_at NOT LIKE '%T%' AND applied_at <> '';

UPDATE reports SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE video_lessons SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

-- 索引补齐（M9）
CREATE INDEX IF NOT EXISTS idx_progress_item_id ON progress(item_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_courses_course_id ON class_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_session_topics_session ON session_topics(class_session_id);
