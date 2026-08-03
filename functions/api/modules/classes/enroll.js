import { verifyAuth, requireRole, canManageClass, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, batch, now } from "../../../_shared/db.js";

// POST /api/modules/classes/enroll - 添加学生到班级并自动注册课程
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['advisor', 'admin']).ok) {
      return jsonError(403, "Advisor or admin access required");
    }
    
    const { classId, studentIds } = await request.json();
    
    if (!classId || !studentIds || !Array.isArray(studentIds)) {
      return new Response(JSON.stringify({ error: "classId and studentIds array required" }), { status: 400 });
    }

    if (studentIds.length > 100) return jsonError(400, "Too many students (max 100)");
    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageClass(env.DB, auth.payload.sub, classId))) {
      return jsonError(403, "You do not manage this class");
    }
    
    // 添加学生到班级
    const memberStatements = studentIds.map(studentId => ({
      sql: `INSERT OR IGNORE INTO class_members (class_id, student_id, joined_at) VALUES (?, ?, ${now()})`,
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
            sql: `INSERT OR IGNORE INTO enrollments (id, student_id, course_id, class_id, status, enrolled_at) VALUES (?, ?, ?, ?, 'active', ${now()})`,
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
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
