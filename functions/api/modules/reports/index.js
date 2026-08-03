import { verifyJWT } from "../../../_utils/jwt.js";
import { canManageCourse, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/reports?student_id=xxx&course_id=xxx - 获取评语列表
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const studentId = url.searchParams.get('student_id');
    const courseId = url.searchParams.get('course_id');
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 检查权限：教师/管理员可以查看，学生只能看自己的
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    const roles = JSON.parse(user.roles || '[]');
    const isTeacher = roles.includes('teacher') || roles.includes('admin');
    
    if (!isTeacher && studentId && studentId !== payload.sub) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    
    let whereClauses = [];
    let params = [];
    
    if (studentId) {
      whereClauses.push("r.student_id = ?");
      params.push(studentId);
    } else if (!isTeacher) {
      // 学生只能看自己的评语
      whereClauses.push("r.student_id = ?");
      params.push(payload.sub);
    }
    
    if (courseId) {
      whereClauses.push("r.course_id = ?");
      params.push(courseId);
    }
    
    const whereStr = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
    
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const { total } = await queryOne(env.DB, `SELECT COUNT(*) as total FROM reports r ${whereStr}`, params);
    const reportParams = [...params, limit, offset];
    const reports = await queryAll(env.DB, `
      SELECT 
        r.*,
        u.nickname as student_name,
        t.nickname as teacher_name
      FROM reports r
      JOIN users u ON r.student_id = u.id
      JOIN users t ON r.teacher_id = t.id
      ${whereStr}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, reportParams);
    
    return new Response(JSON.stringify({
      success: true,
      reports,
      pagination: { total, limit, offset, hasMore: total > offset + limit }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// POST /api/modules/reports - 创建评语（教师/管理员）
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
    
    // 检查权限
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    const roles = JSON.parse(user.roles || '[]');
    if (!roles.includes('teacher') && !roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Teacher or admin access required" }), { status: 403 });
    }
    
    const { studentId, courseId, title, content, rating } = await request.json();
    
    if (!studentId || !courseId || !title || !content) {
      return new Response(JSON.stringify({ error: "studentId, courseId, title, and content required" }), { status: 400 });
    }

    const enrolled = await queryOne(env.DB,
      'SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?',
      [studentId, courseId]
    );
    if (!enrolled) {
      return new Response(JSON.stringify({ error: "Student is not enrolled in this course" }), { status: 400 });
    }

    if (!roles.includes('admin')) {
      const advisorClass = await queryOne(env.DB, `
        SELECT c.id FROM class_courses cc
        JOIN classes c ON c.id = cc.class_id
        WHERE cc.course_id = ? AND c.advisor_id = ?
      `, [courseId, payload.sub]);
      if (!(await canManageCourse(env.DB, payload.sub, courseId)) && !advisorClass) {
        return jsonError(403, "You do not manage this course");
      }
    }
    
    const reportId = generateId();
    const createdAt = now();
    
    await execute(env.DB, `
      INSERT INTO reports (id, student_id, course_id, teacher_id, title, content, rating, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [reportId, studentId, courseId, payload.sub, title, content, rating || null, createdAt, createdAt]);
    
    // 创建通知
    await execute(env.DB, `
      INSERT INTO notifications (id, user_id, type, title, content, entity_type, entity_id, created_at)
      VALUES (?, ?, 'report_created', ?, ?, 'report', ?, ?)
    `, [generateId(), studentId, `您收到了新的评语：${title}`, content, reportId, createdAt]);
    
    return new Response(JSON.stringify({
      success: true,
      report: { id: reportId, studentId, courseId, title, rating, createdAt }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
