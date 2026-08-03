import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost as createAssessment } from '../../../../functions/api/modules/assessments/index.js';
import { onRequestPost as addQuestion } from '../../../../functions/api/modules/assessments/[id]/questions.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '009-assessments.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('a1','a@b.c','A','h','s','[\"admin\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t2')").run();
  await db.prepare("INSERT INTO assessments (id, course_id, title, status, created_by) VALUES ('as1','c1','Quiz','published','t1')").run();
  return db;
}

function call(handler, db, url, token, body, params = {}) {
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params });
}

describe('assessment creation ownership', () => {
  it('teacher who does not own the course cannot create assessment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(createAssessment, db, 'http://x/api/modules/assessments', token, { course_id: 'c1', title: 'X' });
    expect(res.status).toBe(403);
  });

  it('owning teacher can create assessment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(createAssessment, db, 'http://x/api/modules/assessments', token, { course_id: 'c1', title: 'X' });
    expect(res.status).toBe(201);
    const row = await db.prepare('SELECT course_id, created_by FROM assessments WHERE title = ?').bind('X').first();
    expect(row.course_id).toBe('c1');
    expect(row.created_by).toBe('t1');
  });

  it('admin can create assessment for any course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(createAssessment, db, 'http://x/api/modules/assessments', token, { course_id: 'c2', title: 'Y' });
    expect(res.status).toBe(201);
  });
});

describe('assessment question ownership', () => {
  it('teacher who does not own the course cannot add question', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(addQuestion, db, 'http://x/as1/questions', token, { question_text: 'Q' }, { id: 'as1' });
    expect(res.status).toBe(403);
  });

  it('owning teacher can add question', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(addQuestion, db, 'http://x/as1/questions', token, { question_text: 'Q' }, { id: 'as1' });
    expect(res.status).toBe(201);
    const row = await db.prepare('SELECT assessment_id FROM assessment_questions WHERE question_text = ?').bind('Q').first();
    expect(row.assessment_id).toBe('as1');
  });

  it('admin can add question to any assessment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(addQuestion, db, 'http://x/as1/questions', token, { question_text: 'Q' }, { id: 'as1' });
    expect(res.status).toBe(201);
  });
});
