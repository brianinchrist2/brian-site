import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost } from '../../../../functions/api/modules/videos/[id]/log.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '008-videos.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t1')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e2','s2','c2','active')").run();
  await db.prepare("INSERT INTO video_lessons (id, course_id, title, status, video_url, created_by) VALUES ('v1','c1','V1','published','https://x/1.mp4','t1')").run();
  await db.prepare("INSERT INTO video_lessons (id, course_id, title, status, video_url, created_by) VALUES ('v2','c2','V2','published','https://x/2.mp4','t1')").run();
  return db;
}

function call(handler, db, url, token, params = {}) {
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : {} },
    body: JSON.stringify({ watch_duration_seconds: 10, last_position_seconds: 5, completed: false }),
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params });
}

describe('videos [id]/log POST authorization', () => {
  it('enrolled student can log watch time', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPost, db, 'http://x/api/modules/videos/v1/log', token, { id: 'v1' });
    expect(res.status).toBe(200);
    const row = await db.prepare('SELECT id FROM video_watch_logs WHERE video_lesson_id = ? AND student_id = ?').bind('v1', 's1').first();
    expect(row).toBeTruthy();
  });

  it('unenrolled student cannot log watch time for a video', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPost, db, 'http://x/api/modules/videos/v2/log', token, { id: 'v2' });
    expect(res.status).toBe(403);
  });

  it('student cannot log watch time for unknown video', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPost, db, 'http://x/api/modules/videos/nope/log', token, { id: 'nope' });
    expect(res.status).toBe(404);
  });

  it('teacher can log watch time for any video', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPost, db, 'http://x/api/modules/videos/v2/log', token, { id: 'v2' });
    expect(res.status).toBe(200);
  });
});
