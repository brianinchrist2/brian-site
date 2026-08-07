import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost } from '../../../../functions/api/modules/interactions/questions.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '003-interactions.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t1')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  return db;
}

function call(handler, db, url, token, body) {
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : {} },
    body: JSON.stringify(body),
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('questions POST enrollment', () => {
  it('enrolled student can post a question to course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPost, db, 'http://x/api/modules/interactions/questions', token, { courseId: 'c1', title: 'Q1', body: 'b' });
    expect(res.status).toBe(201);
  });

  it('student cannot post question to unenrolled course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPost, db, 'http://x/api/modules/interactions/questions', token, { courseId: 'c2', title: 'Q2', body: 'b' });
    expect(res.status).toBe(403);
  });

  it('student with no enrollments cannot post question', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPost, db, 'http://x/api/modules/interactions/questions', token, { courseId: 'c1', title: 'Q3', body: 'b' });
    expect(res.status).toBe(403);
  });

  it('teacher can post question to any course', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestPost, db, 'http://x/api/modules/interactions/questions', token, { courseId: 'c1', title: 'QT', body: 'b' });
    expect(res.status).toBe(201);
  });
});
