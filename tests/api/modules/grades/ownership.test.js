import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost as calculateGrades } from '../../../../functions/api/modules/grades/calculate.js';
import { onRequestPost as addComponent } from '../../../../functions/api/modules/grades/components.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '010-grades.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('a1','a@b.c','A','h','s','[\"admin\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t2')").run();
  await db.prepare("INSERT INTO grade_components (id, course_id, name, component_type, weight) VALUES ('gc1','c1','HW','assignment',50)").run();
  await db.prepare("INSERT INTO grade_components (id, course_id, name, component_type, weight) VALUES ('gc2','c2','HW','assignment',50)").run();
  return db;
}

function call(handler, db, url, token, body = {}) {
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('grades calculate ownership', () => {
  it('teacher who does not own the course cannot recalculate grades', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(calculateGrades, db, 'http://x/api/modules/grades/calculate?course_id=c1', token);
    expect(res.status).toBe(403);
  });

  it('owning teacher can recalculate grades', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(calculateGrades, db, 'http://x/api/modules/grades/calculate?course_id=c1', token);
    expect(res.status).toBe(200);
  });

  it('admin can recalculate grades for any course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(calculateGrades, db, 'http://x/api/modules/grades/calculate?course_id=c2', token);
    expect(res.status).toBe(200);
  });
});

describe('grades components ownership', () => {
  it('teacher who does not own the course cannot add component', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(addComponent, db, 'http://x/api/modules/grades/components', token, { course_id: 'c1', name: 'Midterm', component_type: 'assignment' });
    expect(res.status).toBe(403);
  });

  it('owning teacher can add component', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(addComponent, db, 'http://x/api/modules/grades/components', token, { course_id: 'c1', name: 'Midterm', component_type: 'assignment' });
    expect(res.status).toBe(201);
    const row = await db.prepare('SELECT course_id FROM grade_components WHERE name = ?').bind('Midterm').first();
    expect(row.course_id).toBe('c1');
  });

  it('admin can add component to any course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(addComponent, db, 'http://x/api/modules/grades/components', token, { course_id: 'c2', name: 'Final', component_type: 'assessment' });
    expect(res.status).toBe(201);
  });
});
