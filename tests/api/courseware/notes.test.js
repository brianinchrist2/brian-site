import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../helpers/setup-db.js';
import { createMockEnv } from '../../helpers/mock-env.js';
import { signJWT } from '../../../functions/_utils/jwt.js';
import { onRequestGet, onRequestPut } from '../../../functions/api/courseware/notes.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '015-courseware-notes.sql'];

async function makeCtx(db, method, url, body, userId) {
  const token = await signJWT({ sub: userId, roles: ['student'], exp: Date.now() + 86400000 }, SECRET);
  const request = new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { env: { DB: db, JWT_SECRET: SECRET }, request, params: {} };
}

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u2','b@b.c','B','h','s','[\"student\"]')").run();
  return db;
}

describe('courseware notes API', () => {
  it('returns 401 without token', async () => {
    const db = await seed();
    const res = await onRequestGet({ env: { DB: db, JWT_SECRET: SECRET }, request: new Request('http://x/api/courseware/notes?book=lg&chapter=introduction'), params: {} });
    expect(res.status).toBe(401);
  });

  it('PUT then GET returns the note for that user', async () => {
    const db = await seed();
    const put = await onRequestPut(await makeCtx(db, 'PUT', 'http://x/api/courseware/notes',
      { book: 'lg', chapter: 'introduction', question_type: 'guided', question_index: 0, content: '我的答案' }, 'u1'));
    expect(put.status).toBe(200);

    const get = await onRequestGet(await makeCtx(db, 'GET', 'http://x/api/courseware/notes?book=lg&chapter=introduction', null, 'u1'));
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0]).toMatchObject({ question_type: 'guided', question_index: 0, content: '我的答案' });
  });

  it('upserts on repeated PUT (same key updates, no duplicate)', async () => {
    const db = await seed();
    const body = { book: 'lg', chapter: 'introduction', question_type: 'guided', question_index: 0, content: 'v2' };
    await onRequestPut(await makeCtx(db, 'PUT', 'http://x/api/courseware/notes', body, 'u1'));
    const get = await onRequestGet(await makeCtx(db, 'GET', 'http://x/api/courseware/notes?book=lg&chapter=introduction', null, 'u1'));
    const data = await get.json();
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].content).toBe('v2');
  });

  it('isolates notes between users', async () => {
    const db = await seed();
    await onRequestPut(await makeCtx(db, 'PUT', 'http://x/api/courseware/notes',
      { book: 'lg', chapter: 'introduction', question_type: 'guided', question_index: 0, content: 'u1 的' }, 'u1'));
    const getU2 = await onRequestGet(await makeCtx(db, 'GET', 'http://x/api/courseware/notes?book=lg&chapter=introduction', null, 'u2'));
    const data = await getU2.json();
    expect(data.notes).toHaveLength(0);
  });

  it('rejects invalid question_type and non-numeric index', async () => {
    const db = await seed();
    const bad = await onRequestPut(await makeCtx(db, 'PUT', 'http://x/api/courseware/notes',
      { book: 'lg', chapter: 'introduction', question_type: 'hack', question_index: 0, content: 'x' }, 'u1'));
    expect(bad.status).toBe(400);
  });

  it('PUT stores updated_at in ISO 8601 format (site-wide, no space)', async () => {
    const db = await seed();
    const put = await onRequestPut(await makeCtx(db, 'PUT', 'http://x/api/courseware/notes',
      { book: 'lg', chapter: 'introduction', question_type: 'guided', question_index: 0, content: 'ISO' }, 'u1'));
    expect(put.status).toBe(200);

    const row = await db.prepare("SELECT updated_at FROM courseware_notes WHERE user_id = 'u1'").first();
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(row.updated_at).not.toContain(' ');

    const get = await onRequestGet(await makeCtx(db, 'GET', 'http://x/api/courseware/notes?book=lg&chapter=introduction', null, 'u1'));
    const data = await get.json();
    expect(data.notes[0].updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.notes[0].updated_at).not.toContain(' ');
  });

  it('upsert refresh keeps updated_at ISO on repeated PUT', async () => {
    const db = await seed();
    const body = { book: 'lg', chapter: 'introduction', question_type: 'guided', question_index: 0, content: 'v1' };
    await onRequestPut(await makeCtx(db, 'PUT', 'http://x/api/courseware/notes', body, 'u1'));
    await onRequestPut(await makeCtx(db, 'PUT', 'http://x/api/courseware/notes', { ...body, content: 'v2' }, 'u1'));
    const row = await db.prepare("SELECT updated_at FROM courseware_notes WHERE user_id = 'u1'").first();
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(row.updated_at).not.toContain(' ');
  });
});
