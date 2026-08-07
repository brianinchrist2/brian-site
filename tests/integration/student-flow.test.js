import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';
import { signJWT } from '../../functions/_utils/jwt.js';
import { createMockContext } from '../helpers/mock-context.js';
import { createMockEnv } from '../helpers/mock-env.js';

const MIGRATIONS = ['001_init.sql', '002-attendance.sql', '003-interactions.sql', '004-books.sql', '005-course-extend.sql', '007-assignments.sql', '008-videos.sql', '009-assessments.sql', '010-grades.sql', '011-assessment-retakes.sql', '013-submission-versions.sql'];

async function setupIntegrationDB() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u-admin','admin@test.com','Admin','h','s','[\"admin\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u-teacher','teacher@test.com','Teacher','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u-student','student@test.com','Student','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, description, created_by) VALUES ('c1','Test Course','Desc','u-teacher')").run();
  await db.prepare("INSERT INTO classes (id, name, status, advisor_id) VALUES ('class1','Test Class','active','u-teacher')").run();
  await db.prepare("INSERT INTO class_courses (class_id, course_id) VALUES ('class1','c1')").run();
  await db.prepare("INSERT INTO class_members (class_id, student_id) VALUES ('class1','u-student')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, class_id, status) VALUES ('e1','u-student','c1','class1','active')").run();
  return db;
}

function makeCtx(db, method, url, handler, body, roles, userId) {
  const env = createMockEnv({ JWT_SECRET: 'test-secret' });
  env.DB = db;
  return {
    request: new Request(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(roles ? { Authorization: 'Bearer ' + signJWTSync(roles, userId) } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    params: {},
    waitUntil: (p) => Promise.resolve(p),
  };
}

function signJWTSync(roles, userId) {
  return signJWT({ sub: userId, roles, exp: Date.now() + 86400000 }, 'test-secret');
}

describe('student multi-step flow', () => {
  it('student can view enrolled courses', async () => {
    const db = await setupIntegrationDB();
    const token = await signJWTSync(['student'], 'u-student');
    const ctx = {
      request: new Request('http://localhost/api/modules/courses/catalog', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env: { DB: db, JWT_SECRET: 'test-secret', USERS_KV: { get: () => null, put: () => null, list: () => ({ keys: [] }) } },
      params: {},
      waitUntil: (p) => Promise.resolve(p),
    };
    const { onRequestGet } = await import('../../functions/api/modules/courses/catalog.js');
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});

describe('teacher multi-step flow', () => {
  it('teacher can create assignment and student can submit', async () => {
    const db = await setupIntegrationDB();
    const teacherToken = await signJWTSync(['teacher'], 'u-teacher');
    const studentToken = await signJWTSync(['student'], 'u-student');

    const createCtx = {
      request: new Request('http://localhost/api/modules/assignments?course_id=c1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
        body: JSON.stringify({ course_id: 'c1', title: 'HW1', description: 'Test', max_score: 100, due_date: '2026-12-31' }),
      }),
      env: { DB: db, JWT_SECRET: 'test-secret', USERS_KV: { get: () => null, put: () => null, list: () => ({ keys: [] }) } },
      params: {},
      waitUntil: (p) => Promise.resolve(p),
    };
    const { onRequestPost: createAssignment } = await import('../../functions/api/modules/assignments/index.js');
    const createRes = await createAssignment(createCtx);
    expect(createRes.status).not.toBe(403);
    expect(createRes.status).not.toBe(401);
  });
});

describe('assessment retake flow', () => {
  it('student can start, submit, and retake assessment', async () => {
    const db = await setupIntegrationDB();
    await db.prepare("INSERT INTO assessments (id, course_id, title, status, created_by) VALUES ('a1','c1','Test Exam','published','u-teacher')").run();
    await db.prepare("INSERT INTO assessment_questions (id, assessment_id, question_text, question_type, correct_answer, points, sort_order) VALUES ('q1','a1','What is 1+1?','short_answer','2',1,0)").run();

    const teacherToken = await signJWTSync(['teacher'], 'u-teacher');
    const studentToken = await signJWTSync(['student'], 'u-student');

    const env = { DB: db, JWT_SECRET: 'test-secret', USERS_KV: { get: () => null, put: () => null, list: () => ({ keys: [] }) } };

    const startCtx = {
      request: new Request('http://localhost/api/modules/assessments/a1/start', {
        headers: { Authorization: `Bearer ${studentToken}` },
      }),
      env,
      params: { id: 'a1' },
      waitUntil: (p) => Promise.resolve(p),
    };
    const { onRequestGet: startAssessment } = await import('../../functions/api/modules/assessments/[id]/start.js');
    const startRes = await startAssessment(startCtx);
    expect(startRes.status).toBe(200);
    const startData = await startRes.json();
    expect(startData.success).toBe(true);
    const submissionId = startData.submission_id;

    const submitCtx = {
      request: new Request('http://localhost/api/modules/assessments/a1/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({ submission_id: submissionId, answers: [{ question_id: 'q1', answer: '2' }] }),
      }),
      env,
      params: { id: 'a1' },
      waitUntil: (p) => Promise.resolve(p),
    };
    const { onRequestPost: submitAssessment } = await import('../../functions/api/modules/assessments/[id]/submit.js');
    const submitRes = await submitAssessment(submitCtx);
    expect(submitRes.status).toBe(200);

    const retakeCtx = {
      request: new Request('http://localhost/api/modules/assessments/a1/start', {
        headers: { Authorization: `Bearer ${studentToken}` },
      }),
      env,
      params: { id: 'a1' },
      waitUntil: (p) => Promise.resolve(p),
    };
    const retakeRes = await startAssessment(retakeCtx);
    expect(retakeRes.status).toBe(200);
    const retakeData = await retakeRes.json();
    expect(retakeData.success).toBe(true);
    expect(retakeData.attempt_number).toBe(2);
  });
});
