import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost as approveCert } from '../../../../functions/api/modules/certificates/[id]/approve.js';
import { onRequestPost as rejectCert } from '../../../../functions/api/modules/certificates/[id]/reject.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '003-interactions.sql', '010-grades.sql'];

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
  await db.prepare("INSERT INTO final_grades (id, student_id, course_id, letter_grade, status) VALUES ('g1','s1','c1','A','approved')").run();
  await db.prepare("INSERT INTO final_grades (id, student_id, course_id, letter_grade, status) VALUES ('g2','s1','c2','B','approved')").run();
  await db.prepare("INSERT INTO certificates (id, student_id, course_id, status, progress_pct) VALUES ('cert1','s1','c1','pending',100)").run();
  await db.prepare("INSERT INTO certificates (id, student_id, course_id, status, progress_pct) VALUES ('cert2','s1','c2','pending',100)").run();
  return db;
}

function call(handler, db, url, token, params) {
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params });
}

describe('certificate approve/reject course ownership', () => {
  it('teacher who manages the course can approve its certificate', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(approveCert, db, 'http://x/cert1/approve', token, { id: 'cert1' });
    expect(res.status).toBe(200);
  });

  it('teacher who does not manage the course cannot approve its certificate', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(approveCert, db, 'http://x/cert2/approve', token, { id: 'cert2' });
    expect(res.status).toBe(403);
    const row = await db.prepare('SELECT status FROM certificates WHERE id = ?').bind('cert2').first();
    expect(row.status).toBe('pending');
  });

  it('teacher who does not manage the course cannot reject its certificate', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(rejectCert, db, 'http://x/cert1/reject', token, { id: 'cert1' });
    expect(res.status).toBe(403);
    const row = await db.prepare('SELECT status FROM certificates WHERE id = ?').bind('cert1').first();
    expect(row.status).toBe('pending');
  });

  it('advisor who advises a class teaching the course can approve', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'adv', exp: Date.now() + 60000 }, SECRET);
    const res = await call(approveCert, db, 'http://x/cert1/approve', token, { id: 'cert1' });
    expect(res.status).toBe(200);
  });

  it('advisor not related to the course cannot approve', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'adv', exp: Date.now() + 60000 }, SECRET);
    const res = await call(approveCert, db, 'http://x/cert2/approve', token, { id: 'cert2' });
    expect(res.status).toBe(403);
  });

  it('admin can approve a certificate for any course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(approveCert, db, 'http://x/cert2/approve', token, { id: 'cert2' });
    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown certificate', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(approveCert, db, 'http://x/nope/approve', token, { id: 'nope' });
    expect(res.status).toBe(404);
  });
});
