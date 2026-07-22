import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 004-books.sql + 005-course-extend.sql', () => {
  let db;
  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '002-attendance.sql', '003-interactions.sql', '004-books.sql', '005-course-extend.sql']);
  });

  it('creates books table', async () => {
    const result = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='books'`).first();
    expect(result).not.toBeNull();
  });

  it('creates book_chapters table', async () => {
    const result = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='book_chapters'`).first();
    expect(result).not.toBeNull();
  });

  it('courses table has start_date column', async () => {
    const info = await db.prepare(`PRAGMA table_info(courses)`).all();
    const columns = info.results.map((c) => c.name);
    expect(columns).toContain('start_date');
    expect(columns).toContain('end_date');
  });

  it('course_items table has book_id column', async () => {
    const info = await db.prepare(`PRAGMA table_info(course_items)`).all();
    const columns = info.results.map((c) => c.name);
    expect(columns).toContain('book_id');
    expect(columns).toContain('book_chapter_id');
  });

  it('book_chapters has foreign key to books', async () => {
    const info = await db.prepare(`SELECT sql FROM sqlite_master WHERE name='book_chapters'`).first();
    expect(info.sql).toContain('REFERENCES books(id)');
  });
});
