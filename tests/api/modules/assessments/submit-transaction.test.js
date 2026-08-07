import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost as submitPost } from '../../../../functions/api/modules/assessments/[id]/submit.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '009-assessments.sql', '011-assessment-retakes.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C','published','t1')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  await db.prepare("INSERT INTO assessments (id, course_id, title, status, duration_minutes, created_by) VALUES ('a1','c1','Quiz','published',60,'t1')").run();
  await db.prepare("INSERT INTO assessment_questions (id, assessment_id, question_text, question_type, correct_answer, points, sort_order) VALUES ('q1','a1','Q1','multiple_choice','B',10,0)").run();
  await db.prepare("INSERT INTO assessment_questions (id, assessment_id, question_text, question_type, correct_answer, points, sort_order) VALUES ('q2','a1','Q2','multiple_choice','C',10,1)").run();
  const startedAt = new Date().toISOString();
  await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, is_latest, attempt_number, started_at) VALUES ('sub1','a1','s1','in_progress',1,1,?)").bind(startedAt).run();
  return db;
}

async function token() {
  return signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
}

function call(handler, db, tokenValue, body) {
  const request = new Request('http://x/a1/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}` },
    body: JSON.stringify(body),
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params: { id: 'a1' } });
}

describe('assessment submit: multi-write is transactional', () => {
  it('submits answers and grades objective questions in one pass', async () => {
    const db = await seed();
    const res = await call(submitPost, db, await token(), {
      answers: [
        { question_id: 'q1', selected_option: 'B' },
        { question_id: 'q2', selected_option: 'Z' },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, status: 'graded', total_score: 10 });

    const rows = await db.prepare('SELECT score FROM assessment_answers WHERE submission_id = ? ORDER BY assessment_question_id').bind('sub1').all();
    expect(rows.results.map(r => r.score)).toEqual([10, 0]);

    const sub = await db.prepare('SELECT status, total_score, submitted_at FROM assessment_submissions WHERE id = ?').bind('sub1').first();
    expect(sub.status).toBe('graded');
    expect(sub.total_score).toBe(10);
    expect(sub.submitted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('marks submission as submitted (not graded) when a subjective question is present', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO assessment_questions (id, assessment_id, question_text, question_type, points, sort_order) VALUES ('q3','a1','Q3','essay',20,2)").run();
    const res = await call(submitPost, db, await token(), {
      answers: [
        { question_id: 'q1', selected_option: 'B' },
        { question_id: 'q3', answer_text: 'my essay' },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('submitted');
    const sub = await db.prepare('SELECT status FROM assessment_submissions WHERE id = ?').bind('sub1').first();
    expect(sub.status).toBe('submitted');
  });

  it('rolls back ALL writes when one answer insert fails (no partial submission)', async () => {
    const db = await seed();
    // 第 2 条 answer 插入必然失败：BEFORE 触发器在已有 1 行时即 ABORT
    await db.exec(`
      CREATE TRIGGER fail_second_answer
      BEFORE INSERT ON assessment_answers
      WHEN (SELECT COUNT(*) FROM assessment_answers) >= 1
      BEGIN
        SELECT RAISE(ABORT, 'injected mid-batch failure');
      END
    `);
    const res = await call(submitPost, db, await token(), {
      answers: [
        { question_id: 'q1', selected_option: 'B' },
        { question_id: 'q2', selected_option: 'C' },
      ],
    });
    expect(res.status).toBe(500);

    const count = await db.prepare("SELECT COUNT(*) as c FROM assessment_answers WHERE submission_id = 'sub1'").first();
    expect(count.c).toBe(0);
    const sub = await db.prepare("SELECT status, total_score, submitted_at FROM assessment_submissions WHERE id = 'sub1'").first();
    expect(sub.status).toBe('in_progress');
    expect(sub.total_score).toBeNull();
    expect(sub.submitted_at).toBeNull();
  });

  it('handles empty answers array (status update only)', async () => {
    const db = await seed();
    const res = await call(submitPost, db, await token(), { answers: [] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, status: 'graded', total_score: 0 });
  });
});
