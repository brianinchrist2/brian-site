import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/certificates/index.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '003-interactions.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('adv','adv@b.c','ADV','h','s','[\"advisor\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('a1','a@b.c','A','h','s','[\"admin\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t2')").run();
  await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl1','CL1','adv')").run();
  await db.prepare("INSERT INTO class_courses (class_id, course_id) VALUES ('cl1','c1')").run();
  await db.prepare("INSERT INTO certificates (id, student_id, course_id, status, progress_pct) VALUES ('cert1','s1','c1','pending',100)").run();
  await db.prepare("INSERT INTO certificates (id, student_id, course_id, status, progress_pct) VALUES ('cert2','s1','c2','pending',100)").run();
  return db;
}

function call(handler, db, url, token) {
  const request = new Request(url, { headers: { Authorization: token ? `Bearer ${token}` : {} } });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('certificates GET scope', () => {
  it('teacher sees only certificates for courses they manage', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/certificates', token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certificates.map(c => c.id)).toEqual(['cert1']);
  });

  it('teacher sees only own-course certificates (not other teachers courses)', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/certificates', token);
    const body = await res.json();
    expect(body.certificates.map(c => c.id)).toEqual(['cert2']);
  });

  it('advisor sees certificates for courses taught in advised classes', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'adv', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/certificates', token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certificates.map(c => c.id)).toEqual(['cert1']);
  });

  it('admin sees all certificates', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'a1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/certificates', token);
    const body = await res.json();
    expect(body.certificates).toHaveLength(2);
  });

  it('student sees only own certificates', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(onRequestGet, db, 'http://x/api/modules/certificates', token);
    const body = await res.json();
    expect(body.certificates).toHaveLength(2);
  });
});
