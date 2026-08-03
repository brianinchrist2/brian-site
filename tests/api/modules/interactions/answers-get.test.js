import { describe, it, expect, beforeAll } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { createMockEnv } from '../../../helpers/mock-env.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/interactions/questions/[id]/answers.js';

describe('GET /api/modules/interactions/questions/[id]/answers', () => {
  let db, mockEnv, token;

  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '003-interactions.sql']);
    mockEnv = createMockEnv({ DB: db });
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1', 'u1@test.com', 'Student', 'hash', 'salt', '[\"student\"]')").run();
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u2', 'u2@test.com', 'Teacher', 'hash', 'salt', '[\"teacher\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, created_by) VALUES ('c1', 'Course 1', 'u1')").run();
    await db.prepare("INSERT INTO questions (id, student_id, course_id, title, body, status) VALUES ('q1', 'u1', 'c1', 'Question 1', 'Body', 'open')").run();
    await db.prepare("INSERT INTO question_answers (id, question_id, user_id, content, is_official) VALUES ('a1', 'q1', 'u2', 'Answer 1', 1)").run();
    token = await signJWT({ sub: 'u1', roles: ['student'] }, mockEnv.JWT_SECRET);
  });

  it('returns 401 without auth', async () => {
    const ctx = createMockContext({ method: 'GET', url: 'http://localhost/api/modules/interactions/questions/q1/answers', env: mockEnv, params: { id: 'q1' } });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });

  it('returns answers for existing question', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/interactions/questions/q1/answers',
      headers: { Authorization: `Bearer ${token}` },
      env: mockEnv,
      params: { id: 'q1' }
    });
    const res = await onRequestGet(ctx);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.answers)).toBe(true);
    expect(data.answers).toHaveLength(1);
    expect(data.answers[0].content).toBe('Answer 1');
    expect(data.answers[0].author_name).toBe('Teacher');
  });

  it('returns empty answers array for question without answers', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/interactions/questions/nope/answers',
      headers: { Authorization: `Bearer ${token}` },
      env: mockEnv,
      params: { id: 'nope' }
    });
    const res = await onRequestGet(ctx);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.answers).toEqual([]);
  });
});
