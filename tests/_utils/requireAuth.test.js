import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';
import { signJWT } from '../../functions/_utils/jwt.js';
import { verifyAuth, requireRole, getRoles, isEnrolled, canManageClass, canManageCourse, clampLimit, clampOffset } from '../../functions/_utils/requireAuth.js';

const SECRET = 'test-secret';

async function makeAuth(token) {
  const db = await setupTestDB(['001_init.sql']);
  const request = new Request('http://localhost/x', {
    headers: { Authorization: token ? `Bearer ${token}` : {} }
  });
  return { db, request };
}

describe('requireAuth', () => {
  it('rejects missing Authorization header', async () => {
    const { db, request } = await makeAuth(null);
    const res = await verifyAuth(db, request, { JWT_SECRET: SECRET });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('rejects invalid token', async () => {
    const { db, request } = await makeAuth('not.a.jwt');
    const res = await verifyAuth(db, request, { JWT_SECRET: SECRET });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('returns payload and roles for valid token', async () => {
    const db = await setupTestDB(['001_init.sql']);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    const token = await signJWT({ sub: 'u1', exp: Date.now() + 60000 }, SECRET);
    const request = new Request('http://localhost/x', { headers: { Authorization: `Bearer ${token}` } });
    const res = await verifyAuth(db, request, { JWT_SECRET: SECRET });
    expect(res.ok).toBe(true);
    expect(res.payload.sub).toBe('u1');
    expect(res.roles).toEqual(['student']);
  });

  it('getRoles returns [] for missing user or corrupted roles', async () => {
    const db = await setupTestDB(['001_init.sql']);
    expect(await getRoles(db, 'nobody')).toEqual([]);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u2','b@b.c','B','h','s','not-json')").run();
    expect(await getRoles(db, 'u2')).toEqual([]);
  });

  it('requireRole enforces whitelist', async () => {
    expect(requireRole(['student'], ['admin']).ok).toBe(false);
    expect(requireRole(['admin'], ['admin', 'teacher']).ok).toBe(true);
  });

  it('isEnrolled / canManageClass / canManageCourse query correctly', async () => {
    const db = await setupTestDB(['001_init.sql']);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C','published','t1')").run();
    await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl1','CL','t1')").run();
    await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
    expect(await isEnrolled(db, 's1', 'c1')).toBe(true);
    expect(await isEnrolled(db, 's1', 'c2')).toBe(false);
    expect(await canManageCourse(db, 't1', 'c1')).toBe(true);
    expect(await canManageCourse(db, 't1', 'c2')).toBe(false);
    expect(await canManageClass(db, 't1', 'cl1')).toBe(true);
    expect(await canManageClass(db, 't1', 'cl2')).toBe(false);
  });

  it('clampLimit/clampOffset normalize pagination', () => {
    expect(clampLimit('-5')).toBe(1);
    expect(clampLimit('9999')).toBe(100);
    expect(clampLimit('abc')).toBe(20);
    expect(clampLimit('10')).toBe(10);
    expect(clampOffset('-3')).toBe(0);
    expect(clampOffset('8')).toBe(8);
    expect(clampOffset('x')).toBe(0);
  });
});
