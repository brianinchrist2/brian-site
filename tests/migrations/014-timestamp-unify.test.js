import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { setupTestDB } from '../helpers/setup-db.js';

// 014 依赖 001-010 的表（notifications/class_sessions/assignment_grades/assessment_submissions/final_grades 等），
// 与生产一致：014 在 001-013 全部应用之后执行。
const MIGRATIONS = ['001_init.sql', '002-attendance.sql', '003-interactions.sql', '007-assignments.sql', '008-videos.sql', '009-assessments.sql', '010-grades.sql', '014_timestamp_unify.sql'];

// setupTestDB 先应用迁移再插入数据；要验证"存量数据被转换"，需在造数后重放 014。
// 重放同时验证了幂等性（UPDATE 的 WHERE 条件天然可重复执行）。
const MIGRATION_014 = readFileSync(join(process.cwd(), 'migrations', '014_timestamp_unify.sql'), 'utf-8');

describe('014 timestamp unification', () => {
  it('converts space-format timestamps to ISO in known tables', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C','published','u1')").run();
    await db.prepare("INSERT INTO course_items (id, course_id, type, title, item_ref) VALUES ('x1','c1','lesson','X','x')").run();
    await db.prepare("INSERT INTO progress (id, student_id, course_id, item_id, status, started_at) VALUES ('p1','u1','c1','x1','started','2026-08-01 12:00:00')").run();
    await db.exec(MIGRATION_014);
    const row = await db.prepare('SELECT started_at FROM progress WHERE id = ?').bind('p1').first();
    expect(row.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(row.started_at).not.toContain(' ');
  });

  it('leaves ISO timestamps untouched', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u2','b@b.c','B','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C','published','u2')").run();
    await db.prepare("INSERT INTO course_items (id, course_id, type, title, item_ref) VALUES ('x2','c2','lesson','X','x')").run();
    await db.prepare("INSERT INTO progress (id, student_id, course_id, item_id, status, started_at) VALUES ('p2','u2','c2','x2','started','2026-08-01T12:00:00.000Z')").run();
    await db.exec(MIGRATION_014);
    const row = await db.prepare('SELECT started_at FROM progress WHERE id = ?').bind('p2').first();
    expect(row.started_at).toBe('2026-08-01T12:00:00.000Z');
  });

  it('creates required indexes', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const idx = await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_progress_item_id','idx_enrollments_class_id','idx_class_courses_course_id','idx_session_topics_session')").all();
    expect(idx.results).toHaveLength(4);
  });
});
