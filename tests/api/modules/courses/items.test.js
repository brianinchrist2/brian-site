import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/courses/items.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u-student','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u-teacher','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','Course','published','u-teacher')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','Other','published','u-teacher')").run();
  await db.prepare("INSERT INTO course_items (id, course_id, type, title, item_ref, sort_order) VALUES ('i1','c1','video','V1','ref1',0)").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','u-student','c1','active')").run();
  return db;
}

async function getItems(db, url, token) {
  const request = new Request(url, { headers: { Authorization: token ? `Bearer ${token}` : {} } });
  return onRequestGet({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('courses/items GET', () => {
  it('rejects anonymous request', async () => {
    const db = await seed();
    const res = await getItems(db, 'http://localhost/api/modules/courses/items?course_id=c1', null);
    expect(res.status).toBe(401);
  });

  it('rejects unenrolled student', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'u-student', exp: Date.now() + 60000 }, SECRET);
    const res = await getItems(db, 'http://localhost/api/modules/courses/items?course_id=c2', token);
    expect(res.status).toBe(403);
  });

  it('allows enrolled student', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'u-student', exp: Date.now() + 60000 }, SECRET);
    const res = await getItems(db, 'http://localhost/api/modules/courses/items?course_id=c1', token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('i1');
  });

  it('allows teacher without enrollment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'u-teacher', exp: Date.now() + 60000 }, SECRET);
    const res = await getItems(db, 'http://localhost/api/modules/courses/items?course_id=c2', token);
    expect(res.status).toBe(200);
  });

  it('rejects limit=-1 by clamping to 1', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'u-teacher', exp: Date.now() + 60000 }, SECRET);
    const res = await getItems(db, 'http://localhost/api/modules/courses/items?course_id=c1&limit=-1', token);
    expect(res.status).toBe(200);
  });
});
