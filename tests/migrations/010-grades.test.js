import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 010-grades.sql', () => {
  let db;
  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql','002-attendance.sql','003-interactions.sql','004-books.sql','005-course-extend.sql','007-assignments.sql','008-videos.sql','009-assessments.sql','010-grades.sql']);
  });
  it('creates grade_components table', async () => {
    const r = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='grade_components'").first();
    expect(r).not.toBeNull();
  });
  it('creates final_grades table', async () => {
    const r = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='final_grades'").first();
    expect(r).not.toBeNull();
  });
  it('grade_components has UNIQUE(course_id, name)', async () => {
    const info = await db.prepare("SELECT sql FROM sqlite_master WHERE name='grade_components'").first();
    expect(info.sql).toContain('UNIQUE');
  });
  it('final_grades has UNIQUE(student_id, course_id)', async () => {
    const info = await db.prepare("SELECT sql FROM sqlite_master WHERE name='final_grades'").first();
    expect(info.sql).toContain('UNIQUE');
  });
});
