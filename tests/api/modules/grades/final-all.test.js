import { describe, it, expect, beforeAll } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { createMockEnv } from '../../../helpers/mock-env.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/grades/final.js';

describe('grades final API course_id=all', () => {
  let db, mockEnv, studentToken, teacherToken;

  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '010-grades.sql']);
    mockEnv = createMockEnv({ DB: db });
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('stu1', 'stu1@test.com', 'Student One', 'hash', 'salt', '[\"student\"]')").run();
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('stu2', 'stu2@test.com', 'Student Two', 'hash', 'salt', '[\"student\"]')").run();
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('tea1', 'tea1@test.com', 'Teacher One', 'hash', 'salt', '[\"teacher\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, created_by) VALUES ('c1', 'Math', 'tea1')").run();
    await db.prepare("INSERT INTO courses (id, title, created_by) VALUES ('c2', 'Physics', 'tea1')").run();
    await db.prepare("INSERT INTO final_grades (id, student_id, course_id, total_score, letter_grade) VALUES ('g1', 'stu1', 'c1', 88, 'A')").run();
    await db.prepare("INSERT INTO final_grades (id, student_id, course_id, total_score, letter_grade) VALUES ('g2', 'stu1', 'c2', 76, 'B')").run();
    await db.prepare("INSERT INTO final_grades (id, student_id, course_id, total_score, letter_grade) VALUES ('g3', 'stu2', 'c1', 92, 'A')").run();
    studentToken = await signJWT({ sub: 'stu1', roles: ['student'] }, mockEnv.JWT_SECRET);
    teacherToken = await signJWT({ sub: 'tea1', roles: ['teacher'] }, mockEnv.JWT_SECRET);
  });

  it('student requesting course_id=all gets all own grades with course title', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/grades/final?course_id=all',
      headers: { Authorization: `Bearer ${studentToken}` },
      env: mockEnv
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.grades).toHaveLength(2);
    const titles = data.grades.map((g) => g.course_title).sort();
    expect(titles).toEqual(['Math', 'Physics']);
    const math = data.grades.find((g) => g.course_id === 'c1');
    expect(math.total_score).toBe(88);
    expect(math.student_id).toBe('stu1');
    expect(data.grades.some((g) => g.student_id === 'stu2')).toBe(false);
  });

  it('student with specific course_id still works and includes course title', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/grades/final?course_id=c2',
      headers: { Authorization: `Bearer ${studentToken}` },
      env: mockEnv
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.grades).toHaveLength(1);
    expect(data.grades[0].course_id).toBe('c2');
    expect(data.grades[0].course_title).toBe('Physics');
  });

  it('teacher requesting course_id=all gets 400', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/grades/final?course_id=all',
      headers: { Authorization: `Bearer ${teacherToken}` },
      env: mockEnv
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Teachers must specify course_id');
  });

  it('teacher with specific course_id gets grades with student names', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/grades/final?course_id=c1',
      headers: { Authorization: `Bearer ${teacherToken}` },
      env: mockEnv
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.grades).toHaveLength(2);
    const names = data.grades.map((g) => g.student_name).sort();
    expect(names).toEqual(['Student One', 'Student Two']);
  });
});
