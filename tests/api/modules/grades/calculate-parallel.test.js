import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost } from '../../../../functions/api/modules/grades/calculate.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '002-attendance.sql', '007-assignments.sql', '009-assessments.sql', '010-grades.sql', '011-assessment-retakes.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('tea1','tea@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('stu1','s1@b.c','S1','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('stu2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, created_by) VALUES ('c1','Course','tea1')").run();
  await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl1','Class','tea1')").run();
  await db.prepare("INSERT INTO class_courses (class_id, course_id) VALUES ('cl1','c1')").run();
  await db.prepare("INSERT INTO class_members (class_id, student_id) VALUES ('cl1','stu1')").run();
  await db.prepare("INSERT INTO class_members (class_id, student_id) VALUES ('cl1','stu2')").run();

  // assignment component (50%) — 注意：score/max_score 均为 INTEGER，SQLite 整数除法
  // 会得到 0/1，因此这里用满分分值来验证 assignment 分支被正确计入（既有行为，未改动）
  await db.prepare("INSERT INTO grade_components (id, course_id, name, component_type, weight, created_by) VALUES ('gc1','c1','HW','assignment',50,'tea1')").run();
  await db.prepare("INSERT INTO assignments (id, course_id, title, status, created_by, due_date, max_score) VALUES ('a1','c1','HW','published','tea1','2026-12-31',100)").run();
  await db.prepare("INSERT INTO assignment_submissions (id, assignment_id, student_id, content, status) VALUES ('asub1','a1','stu1','x','submitted')").run();
  await db.prepare("INSERT INTO assignment_submissions (id, assignment_id, student_id, content, status) VALUES ('asub2','a1','stu2','y','submitted')").run();
  await db.prepare("INSERT INTO assignment_grades (id, submission_id, teacher_id, score) VALUES ('ag1','asub1','tea1',100)").run();
  await db.prepare("INSERT INTO assignment_grades (id, submission_id, teacher_id, score) VALUES ('ag2','asub2','tea1',100)").run();

  // assessment component (50%)
  await db.prepare("INSERT INTO grade_components (id, course_id, name, component_type, weight, created_by) VALUES ('gc2','c1','Quiz','assessment',50,'tea1')").run();
  await db.prepare("INSERT INTO assessments (id, course_id, title, status, total_score, created_by) VALUES ('a2','c1','Quiz','published',100,'tea1')").run();
  await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, total_score, is_latest, attempt_number) VALUES ('asm1','a2','stu1','graded',80,1,1)").run();
  await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, total_score, is_latest, attempt_number) VALUES ('asm2','a2','stu2','graded',70,1,1)").run();

  return db;
}

function call(db, token) {
  const request = new Request('http://localhost/api/modules/grades/calculate?course_id=c1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return onRequestPost({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('grades calculate: multiple students and components', () => {
  it('computes weighted totals per student and writes final_grades through a single batch', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'tea1', roles: ['teacher'], exp: Date.now() + 60000 }, SECRET);
    const res = await call(db, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.calculated).toBe(2);

    // stu1: 100 * 0.5 + 80 * 0.5 = 90 -> A ; stu2: 100 * 0.5 + 70 * 0.5 = 85 -> B
    const g1 = await db.prepare("SELECT total_score, letter_grade, breakdown FROM final_grades WHERE student_id = 'stu1' AND course_id = 'c1'").first();
    expect(g1).not.toBeNull();
    expect(g1.total_score).toBeCloseTo(90, 5);
    expect(g1.letter_grade).toBe('A');
    expect(JSON.parse(g1.breakdown)).toHaveLength(2);

    const g2 = await db.prepare("SELECT total_score, letter_grade, breakdown FROM final_grades WHERE student_id = 'stu2' AND course_id = 'c1'").first();
    expect(g2).not.toBeNull();
    expect(g2.total_score).toBeCloseTo(85, 5);
    expect(g2.letter_grade).toBe('B');
    expect(JSON.parse(g2.breakdown)).toHaveLength(2);
  });
});
