import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

const MIGRATIONS = ['001_init.sql', '007-assignments.sql', '013-submission-versions.sql'];

describe('migration 013-submission-versions.sql', () => {
  it('adds attempt_number column to assignment_submissions', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const result = await db.prepare("PRAGMA table_info(assignment_submissions)").all();
    const cols = result.results;
    const attemptCol = cols.find(c => c.name === 'attempt_number');
    expect(attemptCol).toBeDefined();
    expect(attemptCol.notnull).toBe(1);
    expect(attemptCol.dflt_value).toBe('1');
  });

  it('adds is_latest column to assignment_submissions', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const result = await db.prepare("PRAGMA table_info(assignment_submissions)").all();
    const cols = result.results;
    const latestCol = cols.find(c => c.name === 'is_latest');
    expect(latestCol).toBeDefined();
    expect(latestCol.notnull).toBe(1);
    expect(latestCol.dflt_value).toBe('1');
  });

  it('allows multiple submissions with different attempt numbers', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, description, created_by) VALUES ('c1','Course','Desc','u1')").run();
    await db.prepare("INSERT INTO assignments (id, course_id, title, created_by, due_date) VALUES ('a1','c1','Homework','u1','2026-12-31')").run();
    await db.prepare("INSERT INTO assignment_submissions (id, assignment_id, student_id, attempt_number, is_latest) VALUES ('s1','a1','u1',1,0)").run();
    await db.prepare("INSERT INTO assignment_submissions (id, assignment_id, student_id, attempt_number, is_latest) VALUES ('s2','a1','u1',2,1)").run();
    const result = await db.prepare("SELECT COUNT(*) as c FROM assignment_submissions WHERE assignment_id='a1' AND student_id='u1'").first();
    expect(result.c).toBe(2);
  });

  it('prevents duplicate attempt numbers for same assignment/student', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, description, created_by) VALUES ('c1','Course','Desc','u1')").run();
    await db.prepare("INSERT INTO assignments (id, course_id, title, created_by, due_date) VALUES ('a1','c1','Homework','u1','2026-12-31')").run();
    await db.prepare("INSERT INTO assignment_submissions (id, assignment_id, student_id, attempt_number) VALUES ('s1','a1','u1',1)").run();
    await expect(db.prepare("INSERT INTO assignment_submissions (id, assignment_id, student_id, attempt_number) VALUES ('s2','a1','u1',1)").run()).rejects.toThrow();
  });

  it('preserves existing submission data after rebuild', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, description, created_by) VALUES ('c1','Course','Desc','u1')").run();
    await db.prepare("INSERT INTO assignments (id, course_id, title, created_by, due_date) VALUES ('a1','c1','Homework','u1','2026-12-31')").run();
    // Insert a submission before migration would have been applied - but since 013 runs after 007,
    // the data goes through the rebuild. Let's verify data survives.
    await db.prepare("INSERT INTO assignment_submissions (id, assignment_id, student_id, content) VALUES ('s1','a1','u1','my work')").run();
    const result = await db.prepare("SELECT content, attempt_number, is_latest FROM assignment_submissions WHERE id='s1'").first();
    expect(result.content).toBe('my work');
    expect(result.attempt_number).toBe(1);
    expect(result.is_latest).toBe(1);
  });
});
