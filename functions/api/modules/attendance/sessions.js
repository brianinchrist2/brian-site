import { verifyJWT } from "../../../_utils/jwt.js";
import { verifyAuth, requireRole, canManageClass, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/attendance/sessions - 获取课时列表
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);

    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }

    const classId = url.searchParams.get("class_id");
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let sql = `
      SELECT cs.*, u.nickname as created_by_name,
        (SELECT COUNT(*) FROM attendance_records ar WHERE ar.class_session_id = cs.id AND ar.status = 'present') as present_count,
        (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = cs.class_id) as total_students
      FROM class_sessions cs
      JOIN users u ON cs.created_by = u.id
      WHERE 1=1
    `;
    let countSql = `SELECT COUNT(*) as total FROM class_sessions cs WHERE 1=1`;
    let params = [];
    let countParams = [];

    if (classId) { sql += ` AND cs.class_id = ?`; params.push(classId); countSql += ` AND cs.class_id = ?`; countParams.push(classId); }
    if (dateFrom) { sql += ` AND cs.session_date >= ?`; params.push(dateFrom); countSql += ` AND cs.session_date >= ?`; countParams.push(dateFrom); }
    if (dateTo) { sql += ` AND cs.session_date <= ?`; params.push(dateTo); countSql += ` AND cs.session_date <= ?`; countParams.push(dateTo); }

    const { total } = await queryOne(env.DB, countSql, countParams);
    sql += ` ORDER BY cs.session_date DESC, cs.start_time DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const sessions = await queryAll(env.DB, sql, params);

    return new Response(JSON.stringify({ success: true, sessions, pagination: { total, limit, offset, hasMore: total > offset + limit } }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// POST /api/modules/attendance/sessions - 创建课时
export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) {
      return jsonError(403, "Teacher, advisor, or admin access required");
    }

    const body = await request.json();
    const { class_id, course_id, title, description, session_date, start_time, end_time, location, session_type, meeting_url } = body;

    if (!class_id || !course_id || !title || !session_date || !start_time || !end_time) {
      return new Response(JSON.stringify({ error: "Missing required fields: class_id, course_id, title, session_date, start_time, end_time" }), { status: 400 });
    }

    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageClass(env.DB, auth.payload.sub, class_id))) {
      return jsonError(403, "You do not manage this class");
    }

    if (start_time >= end_time) {
      return new Response(JSON.stringify({ error: "start_time must be before end_time" }), { status: 400 });
    }

    const id = generateId();
    const createdAt = now();

    await execute(env.DB, `
      INSERT INTO class_sessions (id, class_id, course_id, title, description, session_date, start_time, end_time, location, session_type, meeting_url, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, class_id, course_id, title, description || null, session_date, start_time, end_time, location || null, session_type || 'in_person', meeting_url || null, auth.payload.sub, createdAt]);

    return new Response(JSON.stringify({
      success: true,
      session: { id, title, session_date, start_time, end_time }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
