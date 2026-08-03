import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../helpers/setup-db.js';
import { signJWT } from '../../../functions/_utils/jwt.js';
import { onRequestPost as gradeAssignment } from '../../../functions/api/modules/assignments/submissions/[id]/grade.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '007-assignments.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t2')").run();
  await db.prepare("INSERT INTO assignments (id, course_id, title, status, created_by) VALUES ('a1','c1','HW','published','t1')").run();
  await db.prepare("INSERT INTO assignment_submissions (id, assignment_id, student_id, content, status) VALUES ('sub1','a1','s1','x','submitted')").run();
  return db;
}

function call(handler, db, url, token, body, params) {
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params });
}

describe('grade ownership', () => {
  it('teacher who does not own the course cannot grade submission', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(gradeAssignment, db, 'http://x/sub1/grade', token, { score: 90 }, { id: 'sub1' });
    expect(res.status).toBe(403);
  });

  it('owning teacher can grade submission', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(gradeAssignment, db, 'http://x/sub1/grade', token, { score: 90 }, { id: 'sub1' });
    expect(res.status).toBe(200);
    const row = await db.prepare('SELECT score FROM assignment_grades WHERE submission_id = ?').bind('sub1').first();
    expect(row.score).toBe(90);
  });
});
