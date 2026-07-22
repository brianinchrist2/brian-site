import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 008-videos.sql', () => {
  let db;
  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '002-attendance.sql', '003-interactions.sql', '004-books.sql', '005-course-extend.sql', '007-assignments.sql', '008-videos.sql']);
  });

  it('creates video_lessons table', async () => {
    const result = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='video_lessons'`).first();
    expect(result).not.toBeNull();
  });

  it('creates video_watch_logs table', async () => {
    const result = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='video_watch_logs'`).first();
    expect(result).not.toBeNull();
  });

  it('video_watch_logs has UNIQUE(video_lesson_id, student_id)', async () => {
    const info = await db.prepare(`SELECT sql FROM sqlite_master WHERE name='video_watch_logs'`).first();
    expect(info.sql).toContain('UNIQUE');
  });
});
