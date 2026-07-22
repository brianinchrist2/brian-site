import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 003-interactions.sql', () => {
  let db;
  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '002-attendance.sql', '003-interactions.sql']);
  });

  const tables = [
    'highlights', 'highlight_replies', 'questions',
    'question_answers', 'reports', 'certificates', 'notifications'
  ];

  for (const table of tables) {
    it(`creates ${table} table`, async () => {
      const result = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).bind(table).first();
      expect(result).not.toBeNull();
    });
  }

  it('certificates has UNIQUE(student_id, course_id)', async () => {
    const info = await db.prepare(`SELECT sql FROM sqlite_master WHERE name='certificates'`).first();
    expect(info.sql).toContain('UNIQUE');
  });

  it('reports has UNIQUE(student_id, course_id, teacher_id, title)', async () => {
    const info = await db.prepare(`SELECT sql FROM sqlite_master WHERE name='reports'`).first();
    expect(info.sql).toContain('UNIQUE');
  });
});
