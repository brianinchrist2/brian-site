import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/assessments/index.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '009-assessments.sql', '011-assessment-retakes.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t1')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  await db.prepare("INSERT INTO assessments (id, course_id, title, type, status, created_by) VALUES ('as1','c1','Quiz1','quiz','published','t1')").run();
  await db.prepare("INSERT INTO assessments (id, course_id, title, type, status, created_by) VALUES ('as2','c2','Quiz2','quiz','published','t1')").run();
  return db;
}

function call(handler, db, url, token) {
  const request = new Request(url, { headers: { Authorization: token ? `Bearer ${token}` : {} } });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('assessments GET enrollment boundary', () => {
  it('student sees only assessments for enrolled courses', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/assessments', token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assessments.map(a => a.id).sort()).toEqual(['as1']);
  });

  it('unenrolled student sees no assessments', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/assessments', token);
    const body = await res.json();
    expect(body.assessments).toEqual([]);
  });

  it('teacher sees all published assessments', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/assessments', token);
    const body = await res.json();
    expect(body.assessments).toHaveLength(2);
  });

  it('student with unenrolled course_id filter gets empty list', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/assessments?course_id=c2', token);
    const body = await res.json();
    expect(body.assessments).toEqual([]);
  });
});
