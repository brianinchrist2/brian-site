import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../helpers/setup-db.js';
import { signJWT } from '../../../functions/_utils/jwt.js';
import { onRequestGet as assignmentsGet } from '../../../functions/api/modules/assignments/index.js';
import { onRequestPost as assignmentSubmit } from '../../../functions/api/modules/assignments/[id]/submit.js';
import { onRequestGet as videosGet } from '../../../functions/api/modules/videos/index.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '007-assignments.sql', '008-videos.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t1')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  await db.prepare("INSERT INTO assignments (id, course_id, title, status, created_by, due_date) VALUES ('a1','c1','HW1','published','t1','2026-12-31')").run();
  await db.prepare("INSERT INTO assignments (id, course_id, title, status, created_by, due_date) VALUES ('a2','c2','HW2','published','t1','2026-12-31')").run();
  await db.prepare("INSERT INTO video_lessons (id, course_id, title, status, video_url, created_by) VALUES ('v1','c1','V1','published','https://x/1.mp4','t1')").run();
  await db.prepare("INSERT INTO video_lessons (id, course_id, title, status, video_url, created_by) VALUES ('v2','c2','V2','published','https://x/2.mp4','t1')").run();
  return db;
}

function call(handler, db, url, token, method = 'GET', body = null, params = {}) {
  const init = { method, headers: { Authorization: token ? `Bearer ${token}` : {} } };
  if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request: new Request(url, init), params });
}

describe('content boundaries', () => {
  it('student sees only enrolled-course assignments', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(assignmentsGet, db, 'http://x/api/modules/assignments', token);
    const body = await res.json();
    expect(body.assignments.map(a => a.id).sort()).toEqual(['a1']);
  });

  it('teacher sees all assignments', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(assignmentsGet, db, 'http://x/api/modules/assignments', token);
    const body = await res.json();
    expect(body.assignments).toHaveLength(2);
  });

  it('unenrolled student cannot submit to assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(assignmentSubmit, db, 'http://x/a2/submit', token, 'POST', { content: 'x' }, { id: 'a2' });
    expect(res.status).toBe(403);
  });

  it('student sees only enrolled-course videos', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(videosGet, db, 'http://x/api/modules/videos', token);
    const body = await res.json();
    expect(body.videos.map(v => v.id).sort()).toEqual(['v1']);
  });
});
