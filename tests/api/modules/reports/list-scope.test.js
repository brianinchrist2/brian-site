import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/reports/index.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '003-interactions.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('adv','adv@b.c','ADV','h','s','[\"advisor\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('a1','a@b.c','A','h','s','[\"admin\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t2')").run();
  await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl1','CL1','adv')").run();
  await db.prepare("INSERT INTO class_courses (class_id, course_id) VALUES ('cl1','c1')").run();
  await db.prepare("INSERT INTO reports (id, student_id, course_id, teacher_id, title, content) VALUES ('r1','s1','c1','t1','R1','Body')").run();
  await db.prepare("INSERT INTO reports (id, student_id, course_id, teacher_id, title, content) VALUES ('r2','s1','c2','t2','R2','Body')").run();
  return db;
}

function call(handler, db, url, token) {
  const request = new Request(url, { headers: { Authorization: token ? `Bearer ${token}` : {} } });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('reports GET scope', () => {
  it('teacher sees only reports for courses they manage', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/reports', token);
    const body = await res.json();
    expect(body.reports.map(r => r.id)).toEqual(['r1']);
  });

  it('teacher sees only own-course reports (not other teachers courses)', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/reports', token);
    const body = await res.json();
    expect(body.reports.map(r => r.id)).toEqual(['r2']);
  });

  it('advisor sees reports for courses taught in advised classes', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'adv', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/reports', token);
    const body = await res.json();
    expect(body.reports.map(r => r.id)).toEqual(['r1']);
  });

  it('admin sees all reports', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/reports', token);
    const body = await res.json();
    expect(body.reports).toHaveLength(2);
  });
});
