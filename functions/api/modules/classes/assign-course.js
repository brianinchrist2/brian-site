import { verifyAuth, requireRole, canManageClass, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, execute, generateId, batch, now } from "../../../_shared/db.js";

// POST /api/modules/classes/assign-course - 分配课程到班级
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['advisor', 'admin']).ok) {
      return jsonError(403, "Advisor or admin access required");
    }
    
    const { classId, courseId } = await request.json();
    
    if (!classId || !courseId) {
      return new Response(JSON.stringify({ error: "classId and courseId required" }), { status: 400 });
    }

    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageClass(env.DB, auth.payload.sub, classId))) {
      return jsonError(403, "You do not manage this class");
    }
    
    // 分配课程到班级
    await execute(env.DB, `
      INSERT OR IGNORE INTO class_courses (class_id, course_id, assigned_at)
      VALUES (?, ?, ${now()})
    `, [classId, courseId]);
    
    // 为班级所有学生自动注册课程
    const students = await queryAll(env.DB,
      'SELECT student_id FROM class_members WHERE class_id = ?',
      [classId]
    );
    
    if (students.length > 0) {
      const enrollmentStatements = students.map(({ student_id }) => ({
        sql: `INSERT OR IGNORE INTO enrollments (id, student_id, course_id, class_id, status, enrolled_at) VALUES (?, ?, ?, ?, 'active', ${now()})`,
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
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
