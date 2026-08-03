import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/courses/enrolled.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u-student','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u-teacher','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','Enrolled Published','published','u-teacher')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','Enrolled Draft','draft','u-teacher')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c3','Not Enrolled','published','u-teacher')").run();
  await db.prepare("INSERT INTO course_items (id, course_id, type, title, item_ref, sort_order, is_required) VALUES ('i1','c1','video','V1','ref1',0,1)").run();
  await db.prepare("INSERT INTO course_items (id, course_id, type, title, item_ref, sort_order, is_required) VALUES ('i2','c1','video','V2','ref2',1,0)").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','u-student','c1','active')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e2','u-student','c2','active')").run();
  await db.prepare("INSERT INTO progress (id, student_id, course_id, item_id, status) VALUES ('p1','u-student','c1','i1','completed')").run();
  return db;
}

async function getEnrolled(db, token) {
  const request = new Request('http://localhost/api/modules/courses/enrolled', { headers: { Authorization: token ? `Bearer ${token}` : {} } });
  return onRequestGet({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('courses/enrolled GET', () => {
  it('rejects anonymous request with 401', async () => {
    const db = await seed();
    const res = await getEnrolled(db, null);
    expect(res.status).toBe(401);
  });

  it('returns only enrolled and published courses', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'u-student', exp: Date.now() + 60000 }, SECRET);
    const res = await getEnrolled(db, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.courses).toHaveLength(1);
    expect(body.courses[0].id).toBe('c1');
  });

  it('includes creator_name, class_id, enrolled_at and progress counts', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'u-student', exp: Date.now() + 60000 }, SECRET);
    const res = await getEnrolled(db, token);
    const body = await res.json();
    const course = body.courses[0];
    expect(course.creator_name).toBe('T');
    expect(course.total_items).toBe(1);
    expect(course.completed_items).toBe(1);
    expect(course.enrolled_at).toBeTruthy();
  });

  it('excludes inactive enrollments', async () => {
    const db = await seed();
    await db.prepare("UPDATE enrollments SET status = 'inactive' WHERE id = 'e1'").run();
    const token = await signJWT({ sub: 'u-student', exp: Date.now() + 60000 }, SECRET);
    const res = await getEnrolled(db, token);
    const body = await res.json();
    expect(body.courses).toHaveLength(0);
  });
});
