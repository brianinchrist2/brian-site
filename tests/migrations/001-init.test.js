import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 001_init.sql', () => {
  let db;
  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql']);
  });

  const expectedTables = [
    'users', 'courses', 'course_items', 'classes', 'class_courses',
    'class_members', 'enrollments', 'progress', 'answers', 'learning_sessions'
  ];

  for (const table of expectedTables) {
    it(`creates ${table} table`, async () => {
      const result = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).bind(table).first();
      expect(result).not.toBeNull();
    });
  }
});
