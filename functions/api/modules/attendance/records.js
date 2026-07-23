import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, batch, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/attendance/records - 查询考勤记录
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

    const sessionId = url.searchParams.get("session_id");
    const studentId = url.searchParams.get("student_id");
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let sql = `
      SELECT ar.*, u.nickname as student_name, u.email as student_email
      FROM attendance_records ar
      JOIN users u ON ar.student_id = u.id
      WHERE 1=1
    `;
    let countSql = `SELECT COUNT(*) as total FROM attendance_records ar WHERE 1=1`;
    let params = [];
    let countParams = [];

    if (sessionId) { sql += ` AND ar.class_session_id = ?`; params.push(sessionId); countSql += ` AND ar.class_session_id = ?`; countParams.push(sessionId); }
    if (studentId) { sql += ` AND ar.student_id = ?`; params.push(studentId); countSql += ` AND ar.student_id = ?`; countParams.push(studentId); }

    const { total } = await queryOne(env.DB, countSql, countParams);
    sql += ` ORDER BY ar.recorded_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const records = await queryAll(env.DB, sql, params);

    return new Response(JSON.stringify({ success: true, records, pagination: { total, limit, offset, hasMore: total > offset + limit } }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// POST /api/modules/attendance/records - 批量记录考勤
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

    const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
    const roles = JSON.parse(user.roles);
    if (!roles.includes('teacher') && !roles.includes('advisor') && !roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Teacher, advisor, or admin access required" }), { status: 403 });
    }

    const body = await request.json();
    const { session_id, records } = body;

    if (!session_id || !Array.isArray(records) || records.length === 0) {
      return new Response(JSON.stringify({ error: "session_id and non-empty records array required" }), { status: 400 });
    }

    // Validate session exists
    const session = await queryOne(env.DB, 'SELECT id, class_id FROM class_sessions WHERE id = ?', [session_id]);
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
    }

    // Validate all student_ids are class members
    const memberIds = records.map(r => r.studentId);
    const placeholders = memberIds.map(() => '?').join(',');
    const members = await queryAll(env.DB, `
      SELECT student_id FROM class_members WHERE class_id = ? AND student_id IN (${placeholders})
    `, [session.class_id, ...memberIds]);

    const validIds = new Set(members.map(m => m.student_id));
    const invalidStudents = memberIds.filter(id => !validIds.has(id));
    if (invalidStudents.length > 0) {
      return new Response(JSON.stringify({ error: "Invalid students (not in class)", invalidStudents }), { status: 400 });
    }

    // Batch UPSERT
    const timestamp = now();
    const statements = records.map(r => ({
      sql: `
        INSERT INTO attendance_records (id, class_session_id, student_id, status, check_in_time, notes, recorded_by, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(class_session_id, student_id) DO UPDATE SET
          status = excluded.status,
          check_in_time = COALESCE(excluded.check_in_time, attendance_records.check_in_time),
          notes = COALESCE(excluded.notes, attendance_records.notes),
          recorded_by = excluded.recorded_by,
          recorded_at = excluded.recorded_at
      `,
      params: [
        generateId(),
        session_id,
        r.studentId,
        r.status || 'absent',
        r.checkInTime || null,
        r.notes || null,
        payload.sub,
        timestamp
      ]
    }));

    await batch(env.DB, statements);

    return new Response(JSON.stringify({
      success: true,
      message: `${records.length} attendance records saved`,
      count: records.length
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
