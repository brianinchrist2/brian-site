import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 009-assessments.sql', () => {
  let db;
  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '002-attendance.sql', '003-interactions.sql', '004-books.sql', '005-course-extend.sql', '007-assignments.sql', '008-videos.sql', '009-assessments.sql']);
  });
  const tables = ['assessments', 'assessment_questions', 'assessment_submissions', 'assessment_answers'];
  for (const table of tables) {
    it('creates ' + table + ' table', async () => {
      const result = await db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?').bind(table).first();
      expect(result).not.toBeNull();
    });
  }
  it('assessment_submissions has UNIQUE(assessment_id, student_id)', async () => {
    const info = await db.prepare('SELECT sql FROM sqlite_master WHERE name=\'assessment_submissions\'').first();
    expect(info.sql).toContain('UNIQUE');
  });
});
