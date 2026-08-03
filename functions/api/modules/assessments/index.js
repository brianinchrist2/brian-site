import { verifyAuth, requireRole, canManageCourse, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now, batch } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const courseId = url.searchParams.get("course_id");
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    let sql = `SELECT * FROM assessments WHERE status = 'published'`;
    let countSql = `SELECT COUNT(*) as total FROM assessments WHERE status = 'published'`;
    let params = [];
    let countParams = [];
    if (courseId) { sql += ` AND course_id = ?`; params.push(courseId); countSql += ` AND course_id = ?`; countParams.push(courseId); }
    const { total } = await queryOne(env.DB, countSql, countParams);
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const assessments = await queryAll(env.DB, sql, params);

    for (const a of assessments) {
      const sub = await queryOne(env.DB,
        `SELECT id, status, total_score, attempt_number, started_at, submitted_at FROM assessment_submissions WHERE assessment_id = ? AND student_id = ? AND is_latest = 1`,
        [a.id, auth.payload.sub]
      );
      a.submission = sub || null;
    }

    return new Response(JSON.stringify({ success: true, assessments, pagination: { total, limit, offset, hasMore: total > offset + limit } }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
    const { course_id, title, type, total_score, passing_score, duration_minutes, available_from, available_until } = await request.json();
    if (!course_id || !title) return new Response(JSON.stringify({ error: "course_id and title are required" }), { status: 400 });
    if (!auth.roles.includes('admin') && !(await canManageCourse(env.DB, auth.payload.sub, course_id))) return jsonError(403, "Forbidden");
    const id = generateId();
    await execute(env.DB, `INSERT INTO assessments (id, course_id, title, type, total_score, passing_score, duration_minutes, available_from, available_until, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
      [id, course_id, title, type || 'quiz', total_score || 100, passing_score || 60, duration_minutes || null, available_from || null, available_until || null, auth.payload.sub]);

    const students = await queryAll(env.DB, 'SELECT student_id FROM enrollments WHERE course_id = ? AND status = ?', [course_id, 'active']);
    if (students.length > 0) {
      const ts = now();
      const notifs = students.map(s => ({
        sql: 'INSERT INTO notifications (id, user_id, title, content, type, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        params: [generateId(), s.student_id, '新考核: ' + title, '', 'assessment', 'assessment', id, ts]
      }));
      await batch(env.DB, notifs);
    }

    return new Response(JSON.stringify({ success: true, assessment_id: id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
