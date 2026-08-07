import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/grades/final.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '010-grades.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('a1','a@b.c','A','h','s','[\"admin\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t2')").run();
  await db.prepare("INSERT INTO final_grades (id, student_id, course_id, total_score, letter_grade) VALUES ('g1','s1','c1',88,'A')").run();
  await db.prepare("INSERT INTO final_grades (id, student_id, course_id, total_score, letter_grade) VALUES ('g2','s1','c2',76,'B')").run();
  return db;
}

function call(handler, db, url, token) {
  const request = new Request(url, { headers: { Authorization: token ? `Bearer ${token}` : {} } });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('grades final teacher ownership', () => {
  it('teacher who does not manage course cannot view its final grades', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/grades/final?course_id=c1', token);
    expect(res.status).toBe(403);
  });

  it('owning teacher can view final grades for course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/grades/final?course_id=c1', token);
    expect(res.status).toBe(200);
  });

  it('admin can view final grades for any course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/grades/final?course_id=c1', token);
    expect(res.status).toBe(200);
  });
});
