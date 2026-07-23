import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

const MIGRATIONS = ['001_init.sql', '009-assessments.sql', '011-assessment-retakes.sql'];

describe('migration 011-assessment-retakes.sql', () => {
  it('adds attempt_number column to assessment_submissions', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const result = await db.prepare("PRAGMA table_info(assessment_submissions)").all();
    const cols = result.results;
    const attemptCol = cols.find(c => c.name === 'attempt_number');
    expect(attemptCol).toBeDefined();
    expect(attemptCol.notnull).toBe(1);
    expect(attemptCol.dflt_value).toBe('1');
  });

  it('adds is_latest column to assessment_submissions', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const result = await db.prepare("PRAGMA table_info(assessment_submissions)").all();
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
    await db.prepare("INSERT INTO assessments (id, course_id, title, created_by) VALUES ('a1','c1','Test','u1')").run();
    await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, attempt_number, is_latest) VALUES ('s1','a1','u1','submitted',1,0)").run();
    await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, attempt_number, is_latest) VALUES ('s2','a1','u1','in_progress',2,1)").run();
    const result = await db.prepare("SELECT COUNT(*) as c FROM assessment_submissions WHERE assessment_id='a1' AND student_id='u1'").first();
    expect(result.c).toBe(2);
  });

  it('prevents duplicate attempt numbers for same assessment/student', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, description, created_by) VALUES ('c1','Course','Desc','u1')").run();
    await db.prepare("INSERT INTO assessments (id, course_id, title, created_by) VALUES ('a1','c1','Test','u1')").run();
    await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, attempt_number) VALUES ('s1','a1','u1',1)").run();
    await expect(db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, attempt_number) VALUES ('s2','a1','u1',1)").run()).rejects.toThrow();
  });
});
