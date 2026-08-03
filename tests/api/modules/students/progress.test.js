import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost as updateProgress } from '../../../../functions/api/modules/students/progress.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  await db.prepare("INSERT INTO course_items (id, course_id, type, title, item_ref, sort_order) VALUES ('i1','c1','lesson','L1','ref',0)").run();
  return db;
}

function call(handler, db, url, token, body) {
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('progress update boundaries', () => {
  it('unenrolled student cannot update progress', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(updateProgress, db, 'http://x/api/modules/students/progress', token, { itemId: 'i1', courseId: 'c1', status: 'started' });
    expect(res.status).toBe(403);
  });

  it('enrolled student can update progress', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(updateProgress, db, 'http://x/api/modules/students/progress', token, { itemId: 'i1', courseId: 'c1', status: 'started' });
    expect(res.status).toBe(200);
  });

  it('client-submitted score is ignored, stored score stays NULL', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(updateProgress, db, 'http://x/api/modules/students/progress', token, { itemId: 'i1', courseId: 'c1', status: 'started', score: 100 });
    expect(res.status).toBe(200);
    const row = await db.prepare('SELECT score FROM progress WHERE student_id = ? AND item_id = ?').bind('s1', 'i1').first();
    expect(row.score).toBeNull();
  });

  it('client score cannot overwrite an existing score on update', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO progress (id, student_id, course_id, item_id, status, score, started_at) VALUES ('p1','s1','c1','i1','started',42,datetime('now'))").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(updateProgress, db, 'http://x/api/modules/students/progress', token, { itemId: 'i1', courseId: 'c1', status: 'completed', score: 100 });
    expect(res.status).toBe(200);
    const row = await db.prepare('SELECT score, status, completed_at FROM progress WHERE student_id = ? AND item_id = ?').bind('s1', 'i1').first();
    expect(row.score).toBe(42);
    expect(row.status).toBe('completed');
    expect(row.completed_at).toBeTruthy();
  });
});
