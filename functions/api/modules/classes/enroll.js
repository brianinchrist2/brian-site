import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, batch } from "../../../_shared/db.js";

// POST /api/modules/classes/enroll - 添加学生到班级并自动注册课程
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    if (!roles.includes('advisor') && !roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Advisor or admin access required" }), { status: 403 });
    }
    
    const { classId, studentIds } = await request.json();
    
    if (!classId || !studentIds || !Array.isArray(studentIds)) {
      return new Response(JSON.stringify({ error: "classId and studentIds array required" }), { status: 400 });
    }
    
    // 添加学生到班级
    const memberStatements = studentIds.map(studentId => ({
      sql: `INSERT OR IGNORE INTO class_members (class_id, student_id, joined_at) VALUES (?, ?, datetime('now'))`,
      params: [classId, studentId]
    }));
    
    await batch(env.DB, memberStatements);
    
    // 获取班级关联的课程
    const classCourses = await queryAll(env.DB,
      'SELECT course_id FROM class_courses WHERE class_id = ?',
      [classId]
    );
    
    // 为每个学生自动注册课程
    if (classCourses.length > 0) {
      const enrollmentStatements = [];
      
      for (const studentId of studentIds) {
        for (const { course_id } of classCourses) {
          enrollmentStatements.push({
            sql: `INSERT OR IGNORE INTO enrollments (id, student_id, course_id, class_id, status, enrolled_at) VALUES (?, ?, ?, ?, 'active', datetime('now'))`,
            params: [generateId(), studentId, course_id, classId]
          });
        }
      }
      
      await batch(env.DB, enrollmentStatements);
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: `Added ${studentIds.length} students to class`,
      enrolledCourses: classCourses.length
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/classes/assign-course - 分配课程到班级
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    if (!roles.includes('advisor') && !roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Advisor or admin access required" }), { status: 403 });
    }
    
    const { classId, courseId } = await request.json();
    
    if (!classId || !courseId) {
      return new Response(JSON.stringify({ error: "classId and courseId required" }), { status: 400 });
    }
    
    // 分配课程到班级
    await execute(env.DB, `
      INSERT OR IGNORE INTO class_courses (class_id, course_id, assigned_at)
      VALUES (?, ?, datetime('now'))
    `, [classId, courseId]);
    
    // 为班级所有学生自动注册课程
    const students = await queryAll(env.DB,
      'SELECT student_id FROM class_members WHERE class_id = ?',
      [classId]
    );
    
    if (students.length > 0) {
      const enrollmentStatements = students.map(({ student_id }) => ({
        sql: `INSERT OR IGNORE INTO enrollments (id, student_id, course_id, class_id, status, enrolled_at) VALUES (?, ?, ?, ?, 'active', datetime('now'))`,
        params: [generateId(), student_id, courseId, classId]
      }));
      
      await batch(env.DB, enrollmentStatements);
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: `Course assigned to class, ${students.length} students enrolled`
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
