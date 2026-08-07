import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { createMockEnv } from '../../../helpers/mock-env.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost as approveCert } from '../../../../functions/api/modules/certificates/[id]/approve.js';
import { onRequestPost as rejectCert } from '../../../../functions/api/modules/certificates/[id]/reject.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '003-interactions.sql', '010-grades.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO final_grades (id, student_id, course_id, letter_grade, status) VALUES ('g1','s1','c1','A','approved')").run();
  await db.prepare("INSERT INTO certificates (id, student_id, course_id, status, progress_pct) VALUES ('cert1','s1','c1','pending',100)").run();
  return db;
}

function call(handler, db, kv, url, token, params) {
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET, USERS_KV: kv }, request, params });
}

describe('certificate approve/reject rate limit', () => {
  it('approve returns 429 with Retry-After when rate limit exceeded', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const env = createMockEnv({ JWT_SECRET: SECRET });
    await env.USERS_KV.put('rl:w:t1', JSON.stringify({ count: 61, windowStart: Date.now() }));
    const res = await call(approveCert, db, env.USERS_KV, 'http://x/cert1/approve', token, { id: 'cert1' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('reject returns 429 with Retry-After when rate limit exceeded', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const env = createMockEnv({ JWT_SECRET: SECRET });
    await env.USERS_KV.put('rl:w:t1', JSON.stringify({ count: 61, windowStart: Date.now() }));
    const res = await call(rejectCert, db, env.USERS_KV, 'http://x/cert1/reject', token, { id: 'cert1' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});
