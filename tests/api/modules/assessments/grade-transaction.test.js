import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost as gradePost } from '../../../../functions/api/modules/assessments/submissions/[id]/grade.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '009-assessments.sql', '011-assessment-retakes.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C','published','t1')").run();
  await db.prepare("INSERT INTO assessments (id, course_id, title, status, created_by) VALUES ('a1','c1','Quiz','published','t1')").run();
  await db.prepare("INSERT INTO assessment_questions (id, assessment_id, question_text, question_type, points, sort_order) VALUES ('q1','a1','Q1','essay',10,0)").run();
  await db.prepare("INSERT INTO assessment_questions (id, assessment_id, question_text, question_type, points, sort_order) VALUES ('q2','a1','Q2','essay',10,1)").run();
  await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, is_latest, attempt_number) VALUES ('sub1','a1','s1','submitted',1,1)").run();
  await db.prepare("INSERT INTO assessment_answers (id, submission_id, assessment_question_id, score) VALUES ('ans1','sub1','q1',NULL)").run();
  await db.prepare("INSERT INTO assessment_answers (id, submission_id, assessment_question_id, score) VALUES ('ans2','sub1','q2',NULL)").run();
  return db;
}

async function token() {
  return signJWT({ sub: 't1', roles: ['teacher'], exp: Date.now() + 60000 }, SECRET);
}

function call(handler, db, tokenValue, body) {
  const request = new Request('http://x/sub1/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}` },
    body: JSON.stringify(body),
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params: { id: 'sub1' } });
}

describe('assessment grade: multi-write is transactional', () => {
  it('grades all answers and updates submission total in one pass', async () => {
    const db = await seed();
    const res = await call(gradePost, db, await token(), {
      answers: [
        { answer_id: 'ans1', score: 8, feedback: 'good' },
        { answer_id: 'ans2', score: 9 },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, total_score: 17 });

    const a1 = await db.prepare('SELECT score, feedback FROM assessment_answers WHERE id = ?').bind('ans1').first();
    expect(a1.score).toBe(8);
    expect(a1.feedback).toBe('good');
    const a2 = await db.prepare('SELECT score, feedback FROM assessment_answers WHERE id = ?').bind('ans2').first();
    expect(a2.score).toBe(9);
    const sub = await db.prepare('SELECT status, total_score FROM assessment_submissions WHERE id = ?').bind('sub1').first();
    expect(sub.status).toBe('graded');
    expect(sub.total_score).toBe(17);
  });

  it('ignores answer_ids that do not exist when summing total (behavior preserved)', async () => {
    const db = await seed();
    const res = await call(gradePost, db, await token(), {
      answers: [
        { answer_id: 'ans1', score: 8 },
        { answer_id: 'missing-answer', score: 100 },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_score).toBe(8);
  });

  it('rolls back all answer updates when the submission status update fails (no partial grading)', async () => {
    const db = await seed();
    await db.exec(`
      CREATE TRIGGER fail_assessment_graded
      AFTER UPDATE OF status ON assessment_submissions
      WHEN NEW.status = 'graded'
      BEGIN
        SELECT RAISE(ABORT, 'injected failure');
      END
    `);
    const res = await call(gradePost, db, await token(), {
      answers: [
        { answer_id: 'ans1', score: 8 },
        { answer_id: 'ans2', score: 9 },
      ],
    });
    expect(res.status).toBe(500);

    const a1 = await db.prepare('SELECT score FROM assessment_answers WHERE id = ?').bind('ans1').first();
    expect(a1.score).toBeNull();
    const a2 = await db.prepare('SELECT score FROM assessment_answers WHERE id = ?').bind('ans2').first();
    expect(a2.score).toBeNull();
    const sub = await db.prepare('SELECT status, total_score FROM assessment_submissions WHERE id = ?').bind('sub1').first();
    expect(sub.status).toBe('submitted');
    expect(sub.total_score).toBeNull();
  });
});
