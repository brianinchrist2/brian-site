import { describe, it, expect } from 'vitest';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { createMockContext } from '../../../helpers/mock-context.js';
import { createMockEnv } from '../../../helpers/mock-env.js';
import { onRequestPost as createCourse } from '../../../../functions/api/modules/courses/catalog.js';
import { onRequestPost as createAssignment } from '../../../../functions/api/modules/assignments/index.js';
import { onRequestPost as createBook } from '../../../../functions/api/modules/books/index.js';
import { onRequestPost as createVideo } from '../../../../functions/api/modules/videos/index.js';
import { onRequestPost as calcGrades } from '../../../../functions/api/modules/grades/calculate.js';

function mockEnvWithUser(roles) {
  const env = createMockEnv({ JWT_SECRET: 'test-secret' });
  env.DB.prepare = (sql) => ({
    _bindings: [],
    bind(...args) { this._bindings = args; return this; },
    first() {
      if (sql.includes('SELECT roles FROM users')) {
        return Promise.resolve({ roles: JSON.stringify(roles) });
      }
      if (sql.includes('SELECT id FROM final_grades')) {
        return Promise.resolve(null);
      }
      if (sql.includes('SELECT COUNT')) {
        return Promise.resolve({ count: 0 });
      }
      return Promise.resolve(null);
    },
    all() {
      if (sql.includes('grade_components')) return Promise.resolve({ results: [{ name: 'test', component_type: 'attendance', weight: 100 }], meta: {} });
      if (sql.includes('class_members')) return Promise.resolve({ results: [], meta: {} });
      return Promise.resolve({ results: [], meta: {} });
    },
    run() { return Promise.resolve({ meta: {} }); },
  });
  env.DB.batch = (stmts) => Promise.all(stmts.map(() => ({ meta: {} })));
  return env;
}

async function makeToken(payload, secret = 'test-secret') {
  return await signJWT(payload, secret);
}

describe('role boundary tests', () => {
  it('student cannot create course (403)', async () => {
    const token = await makeToken({ sub: 'u1', email: 's@test.com', roles: ['student'], exp: Date.now() + 86400000 });
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/courses/catalog',
      headers: { Authorization: `Bearer ${token}` },
      body: { title: 'Test', description: 'Test' },
      env: mockEnvWithUser(['student']),
    });
    const res = await createCourse(ctx);
    expect(res.status).toBe(403);
  });

  it('student cannot create assignment (403)', async () => {
    const token = await makeToken({ sub: 'u1', email: 's@test.com', roles: ['student'], exp: Date.now() + 86400000 });
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/assignments?course_id=c1',
      headers: { Authorization: `Bearer ${token}` },
      body: { title: 'Test', max_score: 100 },
      env: mockEnvWithUser(['student']),
    });
    const res = await createAssignment(ctx);
    expect(res.status).toBe(403);
  });

  it('student cannot create book (403)', async () => {
    const token = await makeToken({ sub: 'u1', email: 's@test.com', roles: ['student'], exp: Date.now() + 86400000 });
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/books',
      headers: { Authorization: `Bearer ${token}` },
      body: { title: 'Test', language: 'zh' },
      env: mockEnvWithUser(['student']),
    });
    const res = await createBook(ctx);
    expect(res.status).toBe(403);
  });

  it('student cannot create video (403)', async () => {
    const token = await makeToken({ sub: 'u1', email: 's@test.com', roles: ['student'], exp: Date.now() + 86400000 });
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/videos',
      headers: { Authorization: `Bearer ${token}` },
      body: { title: 'Test', video_url: 'http://test.com/v.mp4' },
      env: mockEnvWithUser(['student']),
    });
    const res = await createVideo(ctx);
    expect(res.status).toBe(403);
  });

  it('student cannot calculate grades (403)', async () => {
    const token = await makeToken({ sub: 'u1', email: 's@test.com', roles: ['student'], exp: Date.now() + 86400000 });
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/grades/calculate?course_id=c1',
      headers: { Authorization: `Bearer ${token}` },
      env: mockEnvWithUser(['student']),
    });
    const res = await calcGrades(ctx);
    expect(res.status).toBe(403);
  });

  it('teacher cannot create book (403)', async () => {
    const token = await makeToken({ sub: 'u1', email: 't@test.com', roles: ['teacher'], exp: Date.now() + 86400000 });
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/books',
      headers: { Authorization: `Bearer ${token}` },
      body: { title: 'Test', language: 'zh' },
      env: mockEnvWithUser(['teacher']),
    });
    const res = await createBook(ctx);
    expect(res.status).toBe(403);
  });

  it('admin can create course (not 403)', async () => {
    const token = await makeToken({ sub: 'u1', email: 'a@test.com', roles: ['admin'], exp: Date.now() + 86400000 });
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/courses/catalog',
      headers: { Authorization: `Bearer ${token}` },
      body: { title: 'Test Course', description: 'Test' },
      env: mockEnvWithUser(['admin']),
    });
    const res = await createCourse(ctx);
    expect(res.status).not.toBe(403);
  });

  it('invalid token returns 401', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/courses/catalog',
      headers: { Authorization: 'Bearer invalid-token-string' },
      body: { title: 'Test', description: 'Test' },
      env: createMockEnv({ JWT_SECRET: 'test-secret' }),
    });
    const res = await createCourse(ctx);
    expect(res.status).toBe(401);
  });

  it('missing token returns 401', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/courses/catalog',
      body: { title: 'Test', description: 'Test' },
      env: createMockEnv({ JWT_SECRET: 'test-secret' }),
    });
    const res = await createCourse(ctx);
    expect(res.status).toBe(401);
  });

  it('tampered JWT payload returns 401', async () => {
    const token = await makeToken({ sub: 'u1', roles: ['admin'], exp: Date.now() + 86400000 });
    const tampered = token.slice(0, -5) + 'XXXXX';
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/courses/catalog',
      headers: { Authorization: `Bearer ${tampered}` },
      body: { title: 'Test', description: 'Test' },
      env: createMockEnv({ JWT_SECRET: 'test-secret' }),
    });
    const res = await createCourse(ctx);
    expect(res.status).toBe(401);
  });
});
