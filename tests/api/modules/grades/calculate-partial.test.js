import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost } from '../../../../functions/api/modules/grades/calculate.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '007-assignments.sql', '010-grades.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('tea1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('stu1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, created_by) VALUES ('c1','C1','tea1')").run();
  await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl1','CL1','tea1')").run();
  await db.prepare("INSERT INTO class_courses (class_id, course_id) VALUES ('cl1','c1')").run();
  await db.prepare("INSERT INTO class_members (class_id, student_id) VALUES ('cl1','stu1')").run();
  // 作业组件 100% 权重；满分 100，得 80
  await db.prepare("INSERT INTO grade_components (id, course_id, name, component_type, weight, created_by) VALUES ('gc1','c1','HW','assignment',100,'tea1')").run();
  await db.prepare("INSERT INTO assignments (id, course_id, title, status, created_by, due_date, max_score) VALUES ('a1','c1','HW','published','tea1','2026-12-31',100)").run();
  await db.prepare("INSERT INTO assignment_submissions (id, assignment_id, student_id, content, status) VALUES ('asub1','a1','stu1','x','submitted')").run();
  await db.prepare("INSERT INTO assignment_grades (id, submission_id, teacher_id, score) VALUES ('ag1','asub1','tea1',80)").run();
  return db;
}

function call(db, token) {
  const request = new Request('http://localhost/api/modules/grades/calculate?course_id=c1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return onRequestPost({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('grades calculate: partial assignment score uses real division', () => {
  it('computes assignment component proportionally (80/100 -> 80), not 0 from integer division', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'tea1', roles: ['teacher'], exp: Date.now() + 60000 }, SECRET);
    const res = await call(db, token);
    expect(res.status).toBe(200);

    const g = await db.prepare("SELECT total_score, breakdown FROM final_grades WHERE student_id = 'stu1' AND course_id = 'c1'").first();
    expect(g).not.toBeNull();
    expect(g.total_score).toBeCloseTo(80, 5); // 80/100 * 100 = 80（整数除法会得 0）
    const breakdown = JSON.parse(g.breakdown);
    expect(breakdown[0].score).toBeCloseTo(80, 5);
  });
});
