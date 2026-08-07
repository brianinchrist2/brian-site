import { verifyAuth, requireRole, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

// GET /api/modules/certificates?student_id=xxx&course_id=xxx - 获取证书列表
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const studentId = url.searchParams.get('student_id');
    const courseId = url.searchParams.get('course_id');
    const status = url.searchParams.get('status');
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    
    const isAdmin = auth.roles.includes('admin');
    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;

    if (!isStaff && studentId && studentId !== auth.payload.sub) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    let whereClauses = [];
    let params = [];

    if (studentId) {
      whereClauses.push("c.student_id = ?");
      params.push(studentId);
    } else if (!isStaff) {
      whereClauses.push("c.student_id = ?");
      params.push(auth.payload.sub);
    }

    if (courseId) {
      whereClauses.push("c.course_id = ?");
      params.push(courseId);
    }

    if (status) {
      whereClauses.push("c.status = ?");
      params.push(status);
    }

    // 非 admin 的教师/顾问只能查看其课程范围内（自己创建 or 担任顾问班级所授）的证书
    if (isStaff && !isAdmin) {
      whereClauses.push("c.course_id IN (SELECT id FROM courses WHERE created_by = ? UNION SELECT cc.course_id FROM class_courses cc JOIN classes cl ON cl.id = cc.class_id WHERE cl.advisor_id = ?)");
      params.push(auth.payload.sub, auth.payload.sub);
    }
    
    const whereStr = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
    
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const { total } = await queryOne(env.DB, `SELECT COUNT(*) as total FROM certificates c ${whereStr}`, params);
    const certParams = [...params, limit, offset];
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
      LIMIT ? OFFSET ?
    `, certParams);
    
    return new Response(JSON.stringify({
      success: true,
      certificates,
      pagination: { total, limit, offset, hasMore: total > offset + limit }
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
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    const { courseId } = await request.json();
    
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId required" }), { status: 400 });
    }
    
    // 校验选课关系
    const enrolled = await queryOne(env.DB,
      "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'active'",
      [auth.payload.sub, courseId]
    );
    if (!enrolled) {
      return new Response(JSON.stringify({ error: "You are not enrolled in this course" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
    
    // 检查是否已有申请
    const existing = await queryOne(env.DB,
      'SELECT id, status FROM certificates WHERE student_id = ? AND course_id = ?',
      [auth.payload.sub, courseId]
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
      [auth.payload.sub, courseId]
    );
    
    const progressPct = totalItems.count > 0
      ? Math.round((completedItems.count / totalItems.count) * 100)
      : 0;

    const finalGrade = await queryOne(env.DB,
      'SELECT letter_grade FROM final_grades WHERE student_id = ? AND course_id = ?',
      [auth.payload.sub, courseId]
    );

    if (finalGrade && finalGrade.letter_grade === 'F') {
      return new Response(JSON.stringify({ error: "Cannot apply for certificate with failing grade" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const certId = generateId();
    const appliedAt = now();
    
    await execute(env.DB, `
      INSERT INTO certificates (id, student_id, course_id, status, progress_pct, applied_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `, [certId, auth.payload.sub, courseId, progressPct, appliedAt]);
    
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
