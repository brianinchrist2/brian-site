import { describe, it, expect, beforeAll } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { createMockEnv } from '../../../helpers/mock-env.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost } from '../../../../functions/api/modules/grades/calculate.js';

describe('grades calculate attendance numerator is scoped to the course', () => {
  let db, mockEnv, teacherToken;

  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '002-attendance.sql', '010-grades.sql']);
    mockEnv = createMockEnv({ DB: db });

    // Users: teacher owns both courses, one student
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('tea1', 'tea1@test.com', 'Teacher', 'hash', 'salt', '[\"teacher\"]')").run();
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('stu1', 'stu1@test.com', 'Student', 'hash', 'salt', '[\"student\"]')").run();

    // Two courses, each with its own class
    await db.prepare("INSERT INTO courses (id, title, created_by) VALUES ('c1', 'Math', 'tea1')").run();
    await db.prepare("INSERT INTO courses (id, title, created_by) VALUES ('c2', 'Physics', 'tea1')").run();
    await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl1', 'Class One', 'tea1')").run();
    await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl2', 'Class Two', 'tea1')").run();
    await db.prepare("INSERT INTO class_courses (class_id, course_id) VALUES ('cl1', 'c1')").run();
    await db.prepare("INSERT INTO class_courses (class_id, course_id) VALUES ('cl2', 'c2')").run();
    await db.prepare("INSERT INTO class_members (class_id, student_id) VALUES ('cl1', 'stu1')").run();
    await db.prepare("INSERT INTO class_members (class_id, student_id) VALUES ('cl2', 'stu1')").run();

    // c1 has 2 sessions, c2 has 4 sessions
    const insertSession = async (id, classId, courseId) => {
      await db.prepare(
        "INSERT INTO class_sessions (id, class_id, course_id, title, session_date, start_time, end_time, created_by) VALUES (?, ?, ?, 'Session', '2026-08-01', '09:00', '10:00', 'tea1')"
      ).bind(id, classId, courseId).run();
    };
    await insertSession('s1', 'cl1', 'c1');
    await insertSession('s2', 'cl1', 'c1');
    await insertSession('s3', 'cl2', 'c2');
    await insertSession('s4', 'cl2', 'c2');
    await insertSession('s5', 'cl2', 'c2');
    await insertSession('s6', 'cl2', 'c2');

    // Student attends BOTH courses: present in both c1 sessions, and 4 records in c2
    const insertAttendance = async (sessionId, status) => {
      await db.prepare(
        "INSERT INTO attendance_records (id, class_session_id, student_id, status, recorded_by) VALUES (?, ?, 'stu1', ?, 'tea1')"
      ).bind(`a_${sessionId}`, sessionId, status).run();
    };
    await insertAttendance('s1', 'present');
    await insertAttendance('s2', 'present');
    await insertAttendance('s3', 'present');
    await insertAttendance('s4', 'present');
    await insertAttendance('s5', 'late');
    await insertAttendance('s6', 'late');

    // c1 has a single 100%-weight attendance component
    await db.prepare(
      "INSERT INTO grade_components (id, course_id, name, component_type, weight, created_by) VALUES ('gc1', 'c1', 'Attendance', 'attendance', 100, 'tea1')"
    ).run();

    teacherToken = await signJWT({ sub: 'tea1', roles: ['teacher'] }, mockEnv.JWT_SECRET);
  });

  it('calculates c1 attendance using only c1 sessions, ignoring c2 attendance', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/grades/calculate?course_id=c1',
      headers: { Authorization: `Bearer ${teacherToken}` },
      env: mockEnv
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.calculated).toBe(1);

    const row = await db.prepare(
      "SELECT total_score, letter_grade, breakdown FROM final_grades WHERE student_id = 'stu1' AND course_id = 'c1'"
    ).first();
    expect(row).not.toBeNull();
    const breakdown = JSON.parse(row.breakdown);
    const attComp = breakdown.find((c) => c.type === 'attendance');
    expect(attComp.score).toBe(100);
    expect(row.total_score).toBeCloseTo(100, 5);
    expect(row.letter_grade).toBe('A');
  });
});
