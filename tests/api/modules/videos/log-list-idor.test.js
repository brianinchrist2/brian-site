import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/videos/[id]/log.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '008-videos.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('adv','adv@b.c','ADV','h','s','[\"advisor\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('a1','a@b.c','A','h','s','[\"admin\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s3','s3@b.c','S3','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t2')").run();
  await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl1','CL1','adv')").run();
  await db.prepare("INSERT INTO class_courses (class_id, course_id) VALUES ('cl1','c1')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e2','s2','c2','active')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e3','s3','c1','active')").run();
  await db.prepare("INSERT INTO video_lessons (id, course_id, title, status, video_url, created_by) VALUES ('v1','c1','V1','published','https://x/1.mp4','t1')").run();
  await db.prepare("INSERT INTO video_lessons (id, course_id, title, status, video_url, created_by) VALUES ('v2','c2','V2','published','https://x/2.mp4','t1')").run();
  await db.prepare("INSERT INTO video_lessons (id, course_id, class_id, title, status, video_url, created_by) VALUES ('v3',NULL,'cl1','V3','published','https://x/3.mp4','t1')").run();
  await db.prepare("INSERT INTO video_watch_logs (id, video_lesson_id, student_id, watch_duration_seconds, last_position_seconds, completed) VALUES ('l1','v1','s1',10,5,0)").run();
  await db.prepare("INSERT INTO video_watch_logs (id, video_lesson_id, student_id, watch_duration_seconds, last_position_seconds, completed) VALUES ('l2','v2','s2',20,8,1)").run();
  await db.prepare("INSERT INTO video_watch_logs (id, video_lesson_id, student_id, watch_duration_seconds, last_position_seconds, completed) VALUES ('l3','v1','s3',30,9,1)").run();
  return db;
}

function call(handler, db, url, token, params = {}) {
  const request = new Request(url, {
    method: 'GET',
    headers: { Authorization: token ? `Bearer ${token}` : {} },
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params });
}

describe('videos [id]/log GET authorization', () => {
  it('returns 401 without a token', async () => {
    const db = await seed();
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v1/log', null, { id: 'v1' });
    expect(res.status).toBe(401);
  });

  it('teacher who manages the course can view logs', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v1/log', token, { id: 'v1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(2);
    expect(body.logs[0].student_name).toBe('S');
  });

  it('teacher who does not manage the course cannot view logs', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v2/log', token, { id: 'v2' });
    expect(res.status).toBe(403);
  });

  it('advisor who advises a class teaching the course can view logs', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'adv', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v1/log', token, { id: 'v1' });
    expect(res.status).toBe(200);
  });

  it('advisor not related to the course cannot view logs', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'adv', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v2/log', token, { id: 'v2' });
    expect(res.status).toBe(403);
  });

  it('admin can view logs for any video', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v2/log', token, { id: 'v2' });
    expect(res.status).toBe(200);
  });

  it('enrolled student can view logs for their course video', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v1/log', token, { id: 'v1' });
    expect(res.status).toBe(200);
  });

  it('student not enrolled cannot view logs', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v2/log', token, { id: 'v2' });
    expect(res.status).toBe(403);
  });

  it('non-admin cannot view logs for class-based video without a course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v3/log', token, { id: 'v3' });
    expect(res.status).toBe(403);
  });

  it('admin can view logs for class-based video without a course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v3/log', token, { id: 'v3' });
    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown video', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/nope/log', token, { id: 'nope' });
    expect(res.status).toBe(404);
  });

  it('student sees only their own logs, not other students\'', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v1/log', token, { id: 'v1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].student_id).toBe('s1');
  });

  it('teacher still sees all logs for the course video', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/videos/v1/log', token, { id: 'v1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(2);
  });
});
