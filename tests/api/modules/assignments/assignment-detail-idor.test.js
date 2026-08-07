import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet, onRequestPut, onRequestDelete } from '../../../../functions/api/modules/assignments/[id].js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '007-assignments.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('a1','a@b.c','A','h','s','[\"admin\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t2')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  await db.prepare("INSERT INTO assignments (id, course_id, title, status, created_by, due_date) VALUES ('a1','c1','HW1','published','t1','2026-12-31')").run();
  await db.prepare("INSERT INTO assignments (id, course_id, title, status, created_by, due_date) VALUES ('a2','c2','HW2','published','t2','2026-12-31')").run();
  return db;
}

function call(handler, db, url, token, method = 'GET', body = null, params = {}) {
  const init = { method, headers: { Authorization: token ? `Bearer ${token}` : {} } };
  if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request: new Request(url, init), params });
}

describe('assignments [id] IDOR', () => {
  it('enrolled student can read assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/assignments/a1', token, 'GET', null, { id: 'a1' });
    expect(res.status).toBe(200);
  });

  it('unenrolled student cannot read assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/assignments/a1', token, 'GET', null, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('teacher who does not manage course cannot read assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/assignments/a1', token, 'GET', null, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('owning teacher can read assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/assignments/a1', token, 'GET', null, { id: 'a1' });
    expect(res.status).toBe(200);
  });

  it('admin can read any assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/assignments/a2', token, 'GET', null, { id: 'a2' });
    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/assignments/nope', token, 'GET', null, { id: 'nope' });
    expect(res.status).toBe(404);
  });

  it('teacher who does not manage course cannot update assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPut, db, 'http://x/api/modules/assignments/a1', token, 'PUT', { title: 'hacked' }, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('owning teacher can update assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPut, db, 'http://x/api/modules/assignments/a1', token, 'PUT', { title: 'Updated' }, { id: 'a1' });
    expect(res.status).toBe(200);
    const row = await db.prepare('SELECT title FROM assignments WHERE id = ?').bind('a1').first();
    expect(row.title).toBe('Updated');
  });

  it('admin can update any assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPut, db, 'http://x/api/modules/assignments/a1', token, 'PUT', { title: 'Admin updated' }, { id: 'a1' });
    expect(res.status).toBe(200);
  });

  it('student cannot update assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPut, db, 'http://x/api/modules/assignments/a1', token, 'PUT', { title: 'hack' }, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('teacher who does not manage course cannot delete assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestDelete, db, 'http://x/api/modules/assignments/a1', token, 'DELETE', null, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('owning teacher can delete assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestDelete, db, 'http://x/api/modules/assignments/a1', token, 'DELETE', null, { id: 'a1' });
    expect(res.status).toBe(200);
    const row = await db.prepare('SELECT id FROM assignments WHERE id = ?').bind('a1').first();
    expect(row).toBeNull();
  });

  it('returns 404 when deleting unknown assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestDelete, db, 'http://x/api/modules/assignments/nope', token, 'DELETE', null, { id: 'nope' });
    expect(res.status).toBe(404);
  });
});
