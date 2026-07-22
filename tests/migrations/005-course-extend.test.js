import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 005-course-extend.sql', () => {
  let db;
  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '004-books.sql', '005-course-extend.sql']);
  });

  it('courses table has start_date column', async () => {
    const info = await db.prepare('PRAGMA table_info(courses)').all();
    expect(info.results.map(function(c) { return c.name; })).toContain('start_date');
  });

  it('courses table has end_date column', async () => {
    const info = await db.prepare('PRAGMA table_info(courses)').all();
    expect(info.results.map(function(c) { return c.name; })).toContain('end_date');
  });

  it('course_items table has book_id column', async () => {
    const info = await db.prepare('PRAGMA table_info(course_items)').all();
    expect(info.results.map(function(c) { return c.name; })).toContain('book_id');
  });
});
