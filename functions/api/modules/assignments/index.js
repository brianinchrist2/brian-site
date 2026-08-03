import { verifyAuth, requireRole, canManageCourse, isEnrolled, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now, batch } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const courseId = url.searchParams.get("course_id");
    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
    let sql = `SELECT a.*, c.title as course_title FROM assignments a JOIN courses c ON a.course_id = c.id WHERE 1=1`;
    let countSql = `SELECT COUNT(*) as total FROM assignments a WHERE 1=1`;
    let params = [];
    let countParams = [];
    if (courseId) { sql += ` AND a.course_id = ?`; params.push(courseId); countSql += ` AND a.course_id = ?`; countParams.push(courseId); }
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) {
      sql += ` AND a.course_id IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')`;
      countSql += ` AND a.course_id IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')`;
      params.push(auth.payload.sub);
      countParams.push(auth.payload.sub);
    }
    const { total } = await queryOne(env.DB, countSql, countParams);
    sql += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const assignments = await queryAll(env.DB, sql, params);
    return new Response(JSON.stringify({ success: true, assignments, pagination: { total, limit, offset, hasMore: total > offset + limit } }), { headers: { "Content-Type": "application/json" } });
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
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const { course_id, title, type, description, due_date, max_score, late_penalty } = await request.json();
    if (!course_id || !title) return jsonError(400, "course_id and title are required");
    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageCourse(env.DB, auth.payload.sub, course_id))) {
      return jsonError(403, "You do not manage this course");
    }
    const id = generateId();
    await execute(env.DB, `INSERT INTO assignments (id, course_id, title, type, description, due_date, max_score, late_penalty, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
      [id, course_id, title, type || 'homework', description || null, due_date || null, max_score || 100, late_penalty || 0, auth.payload.sub]);

    const students = await queryAll(env.DB, 'SELECT student_id FROM enrollments WHERE course_id = ? AND status = ?', [course_id, 'active']);
    if (students.length > 0) {
      const ts = now();
      const notifs = students.map(s => ({
        sql: 'INSERT INTO notifications (id, user_id, title, content, type, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        params: [generateId(), s.student_id, '新作业: ' + title, description || '', 'assignment', 'assignment', id, ts]
      }));
      await batch(env.DB, notifs);
    }

    return new Response(JSON.stringify({ success: true, assignment_id: id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
