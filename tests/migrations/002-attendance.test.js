import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 002-attendance.sql', () => {
  let db;
  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '002-attendance.sql']);
  });

  it('creates class_sessions table', async () => {
    const r = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='class_sessions'").first();
    expect(r).not.toBeNull();
  });

  it('creates attendance_records table', async () => {
    const r = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attendance_records'").first();
    expect(r).not.toBeNull();
  });
});
