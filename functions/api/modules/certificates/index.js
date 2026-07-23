import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/certificates?student_id=xxx&course_id=xxx - 获取证书列表
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const studentId = url.searchParams.get('student_id');
    const courseId = url.searchParams.get('course_id');
    const status = url.searchParams.get('status');
    
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
    const isTeacher = roles.includes('teacher') || roles.includes('admin');
    
    if (!isTeacher && studentId && studentId !== payload.sub) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    
    let whereClauses = [];
    let params = [];
    
    if (studentId) {
      whereClauses.push("c.student_id = ?");
      params.push(studentId);
    } else if (!isTeacher) {
      whereClauses.push("c.student_id = ?");
      params.push(payload.sub);
    }
    
    if (courseId) {
      whereClauses.push("c.course_id = ?");
      params.push(courseId);
    }
    
    if (status) {
      whereClauses.push("c.status = ?");
      params.push(status);
    }
    
    const whereStr = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
    
    const certificates = await queryAll(env.DB, `
      SELECT 
        c.*,
        u.nickname as student_name,
        co.title as course_title,
        t.nickname as teacher_name
      FROM certificates c
      JOIN users u ON c.student_id = u.id
      JOIN courses co ON c.course_id = co.id
      LEFT JOIN users t ON c.teacher_id = t.id
      ${whereStr}
      ORDER BY c.applied_at DESC
    `, params);
    
    return new Response(JSON.stringify({
      success: true,
      certificates
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// POST /api/modules/certificates - 申请证书（学生）
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
    
    const { courseId } = await request.json();
    
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId required" }), { status: 400 });
    }
    
    // 检查是否已有申请
    const existing = await queryOne(env.DB,
      'SELECT id, status FROM certificates WHERE student_id = ? AND course_id = ?',
      [payload.sub, courseId]
    );
    
    if (existing) {
      return new Response(JSON.stringify({ error: "Certificate already exists", status: existing.status }), { status: 400 });
    }
    
    // 计算进度百分比
    const totalItems = await queryOne(env.DB,
      'SELECT COUNT(*) as count FROM course_items WHERE course_id = ? AND is_required = 1',
      [courseId]
    );
    
    const completedItems = await queryOne(env.DB,
      'SELECT COUNT(*) as count FROM progress WHERE student_id = ? AND course_id = ? AND status = "completed"',
      [payload.sub, courseId]
    );
    
    const progressPct = totalItems.count > 0 
      ? Math.round((completedItems.count / totalItems.count) * 100) 
      : 0;
    
    const certId = generateId();
    const appliedAt = now();
    
    await execute(env.DB, `
      INSERT INTO certificates (id, student_id, course_id, status, progress_pct, applied_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `, [certId, payload.sub, courseId, progressPct, appliedAt]);
    
    return new Response(JSON.stringify({
      success: true,
      certificate: { id: certId, courseId, status: 'pending', progressPct, appliedAt }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
