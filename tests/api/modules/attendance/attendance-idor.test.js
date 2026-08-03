import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet as statsGet } from '../../../../functions/api/modules/attendance/stats.js';
import { onRequestGet as recordsGet } from '../../../../functions/api/modules/attendance/records.js';
import { onRequestGet as sessionGet } from '../../../../functions/api/modules/attendance/sessions/[id].js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '002-attendance.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl1','CL1','t1')").run();
  await db.prepare("INSERT INTO class_members (class_id, student_id) VALUES ('cl1','s1')").run();
  await db.prepare("INSERT INTO courses (id, title, created_by) VALUES ('co1','CO1','t1')").run();
  await db.prepare("INSERT INTO class_sessions (id, class_id, course_id, title, created_by, session_date, start_time, end_time) VALUES ('se1','cl1','co1','Sess','t1','2026-08-01','10:00','11:00')").run();
  return db;
}

async function call(handler, db, url, token, params = {}) {
  const request = new Request(url, { headers: { Authorization: token ? `Bearer ${token}` : {} } });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params });
}

describe('attendance IDOR', () => {
  it('anonymous cannot read session detail', async () => {
    const db = await seed();
    const res = await call(sessionGet, db, 'http://x/api/modules/attendance/sessions/se1', null, { id: 'se1' });
    expect(res.status).toBe(401);
  });

  it('student can read own class session detail', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(sessionGet, db, 'http://x/api/modules/attendance/sessions/se1', token, { id: 'se1' });
    expect(res.status).toBe(200);
  });

  it('student cannot read another class session detail', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl2','CL2','t2')").run();
    await db.prepare("INSERT INTO class_sessions (id, class_id, course_id, title, created_by, session_date, start_time, end_time) VALUES ('se2','cl2','co1','Sess2','t2','2026-08-02','10:00','11:00')").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(sessionGet, db, 'http://x/api/modules/attendance/sessions/se2', token, { id: 'se2' });
    expect(res.status).toBe(403);
  });

  it('student stats forced to own student_id even when querying others', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO class_members (class_id, student_id) VALUES ('cl1','s2')").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(statsGet, db, 'http://x/api/modules/attendance/stats?class_id=cl1&student_id=s2', token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.students).toHaveLength(1);
    expect(body.stats.students[0].student_id).toBe('s1');
  });

  it('teacher who is not advisor cannot view any class stats', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(statsGet, db, 'http://x/api/modules/attendance/stats?class_id=cl1', token);
    expect(res.status).toBe(403);
  });

  it('records GET forces own student_id for students', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO attendance_records (id, class_session_id, student_id, status, recorded_by, recorded_at) VALUES ('r1','se1','s1','present','t1','2026-08-01T10:00:00Z')").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(recordsGet, db, 'http://x/api/modules/attendance/records?student_id=s1&session_id=se1', token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0].student_id).toBe('s1');
  });
});
