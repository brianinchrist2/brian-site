import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet as qGet } from '../../../../functions/api/modules/assessments/[id]/questions.js';
import { onRequestGet as startGet } from '../../../../functions/api/modules/assessments/[id]/start.js';
import { onRequestPost as submitPost } from '../../../../functions/api/modules/assessments/[id]/submit.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '009-assessments.sql', '011-assessment-retakes.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C','published','t1')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  await db.prepare("INSERT INTO assessments (id, course_id, title, status, duration_minutes, created_by) VALUES ('a1','c1','Quiz','published',60,'t1')").run();
  await db.prepare("INSERT INTO assessment_questions (id, assessment_id, question_text, question_type, correct_answer, points, sort_order) VALUES ('q1','a1','Q1','multiple_choice','B',10,0)").run();
  return db;
}

function call(handler, db, url, token, params = {}, method = 'GET', body = null) {
  const init = { method, headers: { Authorization: token ? `Bearer ${token}` : {} } };
  if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const request = new Request(url, init);
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params });
}

describe('assessment integrity', () => {
  it('unenrolled student cannot fetch questions', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(qGet, db, 'http://x/a1/questions', token, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('enrolled student cannot fetch questions before starting', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(qGet, db, 'http://x/a1/questions', token, { id: 'a1' });
    expect(res.status).toBe(400);
  });

  it('enrolled student can fetch questions with in_progress submission', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, is_latest, attempt_number) VALUES ('sub1','a1','s1','in_progress',1,1)").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(qGet, db, 'http://x/a1/questions', token, { id: 'a1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions[0].correct_answer).toBeUndefined();
  });

  it('unenrolled student cannot start assessment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(startGet, db, 'http://x/a1/start', token, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('retake blocked after max attempts (3)', async () => {
    const db = await seed();
    for (let i = 1; i <= 3; i++) {
      await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, is_latest, attempt_number) VALUES (?, 'a1','s1','graded',?,?)").bind('suba' + i, i === 3 ? 1 : 0, i).run();
    }
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(startGet, db, 'http://x/a1/start', token, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('draft assessment cannot be started by student', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO assessments (id, course_id, title, status, created_by) VALUES ('a2','c1','Draft','draft','t1')").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(startGet, db, 'http://x/a2/start', token, { id: 'a2' });
    expect(res.status).toBe(403);
  });

  it('submit rejected when over duration limit', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, is_latest, attempt_number, started_at) VALUES ('sub2','a1','s1','in_progress',1,1,'2026-08-01T00:00:00.000Z')").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(submitPost, db, 'http://x/a1/submit', token, { id: 'a1' }, 'POST', { answers: [{ question_id: 'q1', selected_option: 'B' }] });
    expect(res.status).toBe(400);
  });

  it('retake flips is_latest on old submission and creates attempt 2', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, is_latest, attempt_number) VALUES ('sub_old','a1','s1','graded',1,1)").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(startGet, db, 'http://x/a1/start', token, { id: 'a1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attempt_number).toBe(2);

    const old = await db.prepare("SELECT is_latest FROM assessment_submissions WHERE id = 'sub_old'").first();
    expect(old.is_latest).toBe(0);
    const newest = await db.prepare("SELECT is_latest, attempt_number, status FROM assessment_submissions WHERE id = ?").bind(body.submission_id).first();
    expect(newest).toMatchObject({ is_latest: 1, attempt_number: 2, status: 'in_progress' });
  });

  it('retake rolls back the is_latest flip if the new submission insert fails', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, is_latest, attempt_number) VALUES ('sub_old','a1','s1','graded',1,1)").run();
    await db.exec(`
      CREATE TRIGGER fail_new_attempt
      BEFORE INSERT ON assessment_submissions
      WHEN NEW.attempt_number = 2
      BEGIN
        SELECT RAISE(ABORT, 'injected failure');
      END
    `);
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(startGet, db, 'http://x/a1/start', token, { id: 'a1' });
    expect(res.status).toBe(500);
    const old = await db.prepare("SELECT is_latest FROM assessment_submissions WHERE id = 'sub_old'").first();
    expect(old.is_latest).toBe(1);
  });
});
