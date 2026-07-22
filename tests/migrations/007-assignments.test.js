import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 007-assignments.sql', () => {
  let db;
  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '002-attendance.sql', '003-interactions.sql', '004-books.sql', '005-course-extend.sql', '007-assignments.sql']);
  });

  const tables = ['assignments', 'assignment_submissions', 'assignment_grades'];
  for (const table of tables) {
    it(`creates ${table} table`, async () => {
      const result = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first();
      expect(result).not.toBeNull();
    });
  }

  it('assignment_submissions has UNIQUE(assignment_id, student_id)', async () => {
    const info = await db.prepare(`SELECT sql FROM sqlite_master WHERE name='assignment_submissions'`).first();
    expect(info.sql).toContain('UNIQUE');
  });
});
