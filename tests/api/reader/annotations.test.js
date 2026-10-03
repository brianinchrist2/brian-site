import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../helpers/setup-db.js';
import { createMockEnv } from '../../helpers/mock-env.js';
import { signJWT } from '../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../functions/api/reader/annotations/index.js';
import { onRequestPut, onRequestDelete } from '../../../functions/api/reader/annotations/[id].js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '016-reader-annotations.sql'];
const ID1 = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const ID2 = '7a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c';
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

function anchor(extra = {}) {
  return {
    v: 1, rev: 'abc', len: 5169,
    start: { block: 3, offset: 5 }, end: { block: 3, offset: 18 },
    pos: { start: 210, end: 223 },
    prefix: '前文', suffix: '后文',
    heading: { id: 'h1-x', text: 'x', tag: 'h2' },
    ...extra,
  };
}

function body(extra = {}) {
  return { book: 'lordship_gospel', chapter: '11', color: 'yellow', quote: '采取的是一种以静制动的策略', note: '', anchor: anchor(), ...extra };
}

async function token(userId) {
  return signJWT({ sub: userId, roles: ['student'], exp: Date.now() + 86400000 }, SECRET);
}

async function makeCtx(db, method, url, payload, userId, { id, env } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers.Authorization = `Bearer ${await token(userId)}`;
  const request = new Request(url, { method, headers, body: payload ? JSON.stringify(payload) : undefined });
  return { env: { DB: db, JWT_SECRET: SECRET, ...env }, request, params: id ? { id } : {} };
}

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u2','b@b.c','B','h','s','[\"student\"]')").run();
  return db;
}

async function doPut(db, id, payload, userId, opts) {
  return onRequestPut(await makeCtx(db, 'PUT', `http://x/api/reader/annotations/${id}`, payload, userId, { ...opts, id }));
}
async function doDelete(db, id, userId, opts) {
  return onRequestDelete(await makeCtx(db, 'DELETE', `http://x/api/reader/annotations/${id}`, null, userId, { ...opts, id }));
}
async function doGet(db, query, userId) {
  return onRequestGet(await makeCtx(db, 'GET', `http://x/api/reader/annotations?${query}`, null, userId));
}

describe('reader annotations API', () => {
  describe('auth', () => {
    it('returns 401 without token on GET/PUT/DELETE', async () => {
      const db = await seed();
      expect((await doGet(db, 'book=lordship_gospel')).status).toBe(401);
      expect((await doPut(db, ID1, body())).status).toBe(401);
      expect((await doDelete(db, ID1)).status).toBe(401);
    });

    it('returns 401 with a bad token', async () => {
      const db = await seed();
      const request = new Request('http://x/api/reader/annotations?book=lordship_gospel', { headers: { Authorization: 'Bearer nope' } });
      const res = await onRequestGet({ env: { DB: db, JWT_SECRET: SECRET }, request, params: {} });
      expect(res.status).toBe(401);
    });

    it('returns 500 when DB binding is missing', async () => {
      const request = new Request('http://x/api/reader/annotations?book=lordship_gospel');
      const res = await onRequestGet({ env: { JWT_SECRET: SECRET }, request, params: {} });
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('DB binding is missing.');
    });
  });

  describe('create / read / update', () => {
    it('PUT new id returns 201; GET chapter and GET book each return 1', async () => {
      const db = await seed();
      const res = await doPut(db, ID1, body({ note: '对照约翰福音 3 章' }), 'u1');
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.annotation).toMatchObject({ id: ID1, book_id: 'lordship_gospel', chapter_id: '11', color: 'yellow', note: '对照约翰福音 3 章' });
      expect(data.annotation.anchor).toEqual(anchor());

      const chapter = await (await doGet(db, 'book=lordship_gospel&chapter=11', 'u1')).json();
      expect(chapter.annotations).toHaveLength(1);
      expect(chapter.annotations[0]).toMatchObject({ id: ID1, quote: '采取的是一种以静制动的策略', color: 'yellow' });
      expect(chapter.annotations[0].anchor).toEqual(anchor());
      expect(chapter.annotations[0]).not.toHaveProperty('user_id');
      expect(chapter.annotations[0]).not.toHaveProperty('deleted_at');

      const book = await (await doGet(db, 'book=lordship_gospel', 'u1')).json();
      expect(book.annotations).toHaveLength(1);
    });

    it('GET chapter filters by chapter; GET book spans chapters ordered by chapter then pos_start', async () => {
      const db = await seed();
      await doPut(db, ID1, body({ chapter: '12', anchor: anchor({ pos: { start: 500, end: 510 } }) }), 'u1');
      await doPut(db, ID2, body({ chapter: '11' }), 'u1');
      const c11 = await (await doGet(db, 'book=lordship_gospel&chapter=11', 'u1')).json();
      expect(c11.annotations.map(a => a.id)).toEqual([ID2]);
      const all = await (await doGet(db, 'book=lordship_gospel', 'u1')).json();
      expect(all.annotations.map(a => a.chapter_id)).toEqual(['11', '12']);
      const other = await (await doGet(db, 'book=oikos_church', 'u1')).json();
      expect(other.annotations).toHaveLength(0);
    });

    it('same id PUT again returns 200, updates content, keeps one row and created_at', async () => {
      const db = await seed();
      const first = await (await doPut(db, ID1, body(), 'u1')).json();
      const res = await doPut(db, ID1, body({ color: 'green', note: 'v2', quote: '新原文', anchor: anchor({ pos: { start: 300, end: 320 } }) }), 'u1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.annotation).toMatchObject({ color: 'green', note: 'v2', quote: '新原文', created_at: first.annotation.created_at });

      const rows = (await db.prepare('SELECT id, color, note, pos_start FROM reader_annotations').all()).results;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: ID1, color: 'green', note: 'v2', pos_start: 300 });
    });

    it('defaults note to empty string when omitted', async () => {
      const db = await seed();
      const b = body(); delete b.note;
      const res = await doPut(db, ID1, b, 'u1');
      expect(res.status).toBe(201);
      expect((await res.json()).annotation.note).toBe('');
    });

    it('takes user_id from the token, ignoring any user_id in the body', async () => {
      const db = await seed();
      await doPut(db, ID1, body({ user_id: 'u2' }), 'u1');
      const row = await db.prepare('SELECT user_id FROM reader_annotations WHERE id = ?').bind(ID1).first();
      expect(row.user_id).toBe('u1');
    });

    it('stores timestamps in ISO 8601 and refreshes updated_at on update', async () => {
      const db = await seed();
      await doPut(db, ID1, body(), 'u1');
      await doPut(db, ID1, body({ note: 'v2' }), 'u1');
      const row = await db.prepare('SELECT created_at, updated_at FROM reader_annotations WHERE id = ?').bind(ID1).first();
      expect(row.created_at).toMatch(ISO);
      expect(row.updated_at).toMatch(ISO);
      const data = await (await doGet(db, 'book=lordship_gospel&chapter=11', 'u1')).json();
      expect(data.annotations[0].created_at).toMatch(ISO);
      expect(data.annotations[0].updated_at).toMatch(ISO);
    });
  });

  describe('cross-user isolation', () => {
    it('u2 cannot see u1 annotations', async () => {
      const db = await seed();
      await doPut(db, ID1, body(), 'u1');
      const data = await (await doGet(db, 'book=lordship_gospel&chapter=11', 'u2')).json();
      expect(data.annotations).toHaveLength(0);
    });

    it('u2 PUT / DELETE on u1 id returns 404 and leaves the row untouched', async () => {
      const db = await seed();
      await doPut(db, ID1, body({ note: 'mine' }), 'u1');
      expect((await doPut(db, ID1, body({ note: 'hacked' }), 'u2')).status).toBe(404);
      expect((await doDelete(db, ID1, 'u2')).status).toBe(404);
      const row = await db.prepare('SELECT user_id, note, deleted_at FROM reader_annotations WHERE id = ?').bind(ID1).first();
      expect(row).toMatchObject({ user_id: 'u1', note: 'mine', deleted_at: null });
    });
  });

  describe('delete (tombstone)', () => {
    it('DELETE returns 200, repeated DELETE returns 200, GET no longer returns it', async () => {
      const db = await seed();
      await doPut(db, ID1, body(), 'u1');
      const del = await doDelete(db, ID1, 'u1');
      expect(del.status).toBe(200);
      expect(await del.json()).toEqual({ success: true });
      expect((await doDelete(db, ID1, 'u1')).status).toBe(200);

      const data = await (await doGet(db, 'book=lordship_gospel&chapter=11', 'u1')).json();
      expect(data.annotations).toHaveLength(0);
      const row = await db.prepare('SELECT deleted_at, updated_at FROM reader_annotations WHERE id = ?').bind(ID1).first();
      expect(row.deleted_at).toMatch(ISO);
      expect(row.updated_at).toBe(row.deleted_at);
    });

    it('second DELETE does not move the tombstone timestamp', async () => {
      const db = await seed();
      await doPut(db, ID1, body(), 'u1');
      await doDelete(db, ID1, 'u1');
      const before = await db.prepare('SELECT deleted_at FROM reader_annotations WHERE id = ?').bind(ID1).first();
      await doDelete(db, ID1, 'u1');
      const after = await db.prepare('SELECT deleted_at FROM reader_annotations WHERE id = ?').bind(ID1).first();
      expect(after.deleted_at).toBe(before.deleted_at);
    });

    it('PUT on a deleted id returns 410 and does not resurrect it', async () => {
      const db = await seed();
      await doPut(db, ID1, body(), 'u1');
      await doDelete(db, ID1, 'u1');
      expect((await doPut(db, ID1, body({ note: 'late' }), 'u1')).status).toBe(410);
      const data = await (await doGet(db, 'book=lordship_gospel&chapter=11', 'u1')).json();
      expect(data.annotations).toHaveLength(0);
    });

    it('DELETE of an unknown id returns 404', async () => {
      const db = await seed();
      expect((await doDelete(db, ID1, 'u1')).status).toBe(404);
    });

    it('tombstones do not count toward the quota', async () => {
      const db = await seed();
      await seedRows(db, 'u1', 4999);
      await doPut(db, ID1, body(), 'u1');
      await doDelete(db, ID1, 'u1');
      expect((await doPut(db, ID2, body(), 'u1')).status).toBe(201);
    });
  });

  describe('validation (400)', () => {
    it('rejects non-UUID and non-v4 ids', async () => {
      const db = await seed();
      expect((await doPut(db, 'not-a-uuid', body(), 'u1')).status).toBe(400);
      expect((await doPut(db, '6f1c2a3b-4d5e-1f60-8a7b-9c0d1e2f3a4b', body(), 'u1')).status).toBe(400);
      expect((await doDelete(db, 'not-a-uuid', 'u1')).status).toBe(400);
    });

    it('rejects bad book / chapter', async () => {
      const db = await seed();
      for (const book of ['', 'Has Space', 'UPPER', 'a/b', 'x'.repeat(65), 5, undefined]) {
        expect((await doPut(db, ID1, body({ book }), 'u1')).status).toBe(400);
      }
      for (const chapter of ['', 'a b', '../x', 'x'.repeat(65), 11, undefined]) {
        expect((await doPut(db, ID1, body({ chapter }), 'u1')).status).toBe(400);
      }
    });

    it('rejects invalid color', async () => {
      const db = await seed();
      for (const color of ['red', '', 'Yellow', null, undefined]) {
        expect((await doPut(db, ID1, body({ color }), 'u1')).status).toBe(400);
      }
    });

    it('accepts every whitelisted color', async () => {
      const db = await seed();
      const ids = [
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006',
      ];
      const colors = ['yellow', 'green', 'blue', 'pink', 'purple', 'none'];
      for (let i = 0; i < colors.length; i++) {
        expect((await doPut(db, ids[i], body({ color: colors[i] }), 'u1')).status).toBe(201);
      }
    });

    it('rejects empty, non-string and over-long quote; accepts exactly 5000', async () => {
      const db = await seed();
      expect((await doPut(db, ID1, body({ quote: '' }), 'u1')).status).toBe(400);
      expect((await doPut(db, ID1, body({ quote: 123 }), 'u1')).status).toBe(400);
      expect((await doPut(db, ID1, body({ quote: undefined }), 'u1')).status).toBe(400);
      expect((await doPut(db, ID1, body({ quote: 'x'.repeat(5001) }), 'u1')).status).toBe(400);
      expect((await doPut(db, ID1, body({ quote: 'x'.repeat(5000) }), 'u1')).status).toBe(201);
    });

    it('rejects over-long or non-string note; accepts exactly 20000', async () => {
      const db = await seed();
      expect((await doPut(db, ID1, body({ note: 'x'.repeat(20001) }), 'u1')).status).toBe(400);
      expect((await doPut(db, ID1, body({ note: 42 }), 'u1')).status).toBe(400);
      expect((await doPut(db, ID1, body({ note: 'x'.repeat(20000) }), 'u1')).status).toBe(201);
    });

    it('rejects malformed anchors', async () => {
      const db = await seed();
      const bad = [
        undefined, null, 'str', [],
        anchor({ v: 2 }), anchor({ v: undefined }),
        anchor({ start: undefined }), anchor({ end: undefined }),
        anchor({ start: { block: -1, offset: 0 } }), anchor({ start: { block: 1.5, offset: 0 } }),
        anchor({ end: { block: 1, offset: '3' } }), anchor({ end: { block: 1 } }),
        anchor({ pos: undefined }), anchor({ pos: { start: 10 } }),
        anchor({ pos: { start: 10, end: 10 } }), anchor({ pos: { start: 10, end: 5 } }), anchor({ pos: { start: -1, end: 5 } }),
        anchor({ prefix: undefined }), anchor({ suffix: 5 }),
        anchor({ prefix: 'x'.repeat(65) }), anchor({ suffix: 'x'.repeat(65) }),
      ];
      for (const a of bad) {
        const res = await doPut(db, ID1, { ...body(), anchor: a }, 'u1');
        expect(res.status, JSON.stringify(a)).toBe(400);
      }
    });

    it('rejects anchor larger than 4096 bytes', async () => {
      const db = await seed();
      const res = await doPut(db, ID1, body({ anchor: anchor({ heading: { text: '字'.repeat(1400) } }) }), 'u1');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('anchor too large');
    });

    it('rejects non-JSON and non-object bodies', async () => {
      const db = await seed();
      const request = new Request(`http://x/api/reader/annotations/${ID1}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token('u1')}` },
        body: 'not json',
      });
      const res = await onRequestPut({ env: { DB: db, JWT_SECRET: SECRET }, request, params: { id: ID1 } });
      expect(res.status).toBe(400);
      expect((await doPut(db, ID1, [], 'u1')).status).toBe(400);
    });

    it('rejects book/chapter that differ from the existing record', async () => {
      const db = await seed();
      await doPut(db, ID1, body(), 'u1');
      const res = await doPut(db, ID1, body({ chapter: '12' }), 'u1');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('book/chapter mismatch');
      expect((await doPut(db, ID1, body({ book: 'oikos_church' }), 'u1')).status).toBe(400);
    });

    it('GET validates book and chapter query', async () => {
      const db = await seed();
      expect((await doGet(db, '', 'u1')).status).toBe(400);
      expect((await doGet(db, 'book=Bad%20Book', 'u1')).status).toBe(400);
      expect((await doGet(db, 'book=lordship_gospel&chapter=a%20b', 'u1')).status).toBe(400);
      expect((await doGet(db, 'book=lordship_gospel&chapter=', 'u1')).status).toBe(400);
    });
  });

  describe('quota (403)', () => {
    it('returns 403 for a new id once the user holds 5000 live annotations', async () => {
      const db = await seed();
      await seedRows(db, 'u1', 5000);
      const res = await doPut(db, ID1, body(), 'u1');
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('annotation quota exceeded');
    });

    it('still allows updating an existing annotation at the quota, and other users are unaffected', async () => {
      const db = await seed();
      await doPut(db, ID1, body(), 'u1');
      await seedRows(db, 'u1', 4999);
      expect((await doPut(db, ID1, body({ note: 'edit' }), 'u1')).status).toBe(200);
      expect((await doPut(db, ID2, body(), 'u2')).status).toBe(201);
    });
  });

  describe('rate limit (429)', () => {
    it('returns 429 with Retry-After on PUT and DELETE when the write bucket is exhausted', async () => {
      const db = await seed();
      const mock = createMockEnv();
      mock.USERS_KV._store.set('rl:w:u1', JSON.stringify({ count: 60, windowStart: Date.now() }));
      const env = { USERS_KV: mock.USERS_KV };

      const res = await doPut(db, ID1, body(), 'u1', { env });
      expect(res.status).toBe(429);
      expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect((await doDelete(db, ID1, 'u1', { env })).status).toBe(429);
      expect(await db.prepare('SELECT id FROM reader_annotations').first()).toBeNull();
    });

    it('does not rate-limit GET', async () => {
      const db = await seed();
      const mock = createMockEnv();
      mock.USERS_KV._store.set('rl:w:u1', JSON.stringify({ count: 60, windowStart: Date.now() }));
      const request = new Request('http://x/api/reader/annotations?book=lordship_gospel', {
        headers: { Authorization: `Bearer ${await token('u1')}` },
      });
      const res = await onRequestGet({ env: { DB: db, JWT_SECRET: SECRET, USERS_KV: mock.USERS_KV }, request, params: {} });
      expect(res.status).toBe(200);
    });
  });

  describe('concurrent create (409)', () => {
    it('returns 409 when the INSERT hits a primary-key conflict', async () => {
      const db = await seed();
      // 模拟并发：SELECT 看不到、INSERT 时已被另一请求写入
      const racing = {
        ...db,
        prepare(sql) {
          const stmt = db.prepare(sql);
          if (/^\s*SELECT user_id, book_id, chapter_id, created_at, deleted_at/.test(sql)) {
            return { bind: () => ({ first: async () => null }) };
          }
          return stmt;
        },
      };
      await doPut(db, ID1, body(), 'u1');
      const res = await doPut(racing, ID1, body(), 'u1');
      expect(res.status).toBe(409);
    });
  });
});

async function seedRows(db, userId, n) {
  await db._db.exec(`
    WITH RECURSIVE seq(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < ${n})
    INSERT INTO reader_annotations (id, user_id, book_id, chapter_id, quote, anchor)
    SELECT 'seed-' || '${userId}' || '-' || i, '${userId}', 'filler', '01', 'q', '{}' FROM seq;
  `);
}
