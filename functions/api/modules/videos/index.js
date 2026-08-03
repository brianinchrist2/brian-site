import { verifyAuth, requireRole, canManageCourse, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const courseId = url.searchParams.get("course_id");
    const classId = url.searchParams.get("class_id");
    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
    let sql = `SELECT * FROM video_lessons WHERE status = 'published'`;
    let countSql = `SELECT COUNT(*) as total FROM video_lessons WHERE status = 'published'`;
    let params = [];
    let countParams = [];
    if (courseId) { sql += ` AND course_id = ?`; params.push(courseId); countSql += ` AND course_id = ?`; countParams.push(courseId); }
    if (classId) { sql += ` AND class_id = ?`; params.push(classId); countSql += ` AND class_id = ?`; countParams.push(classId); }
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) {
      sql += ` AND course_id IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')`;
      countSql += ` AND course_id IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')`;
      params.push(auth.payload.sub);
      countParams.push(auth.payload.sub);
    }
    const { total } = await queryOne(env.DB, countSql, countParams);
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const videos = await queryAll(env.DB, sql, params);
    return new Response(JSON.stringify({ success: true, videos, pagination: { total, limit, offset, hasMore: total > offset + limit } }), { headers: { "Content-Type": "application/json" } });
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
    const { course_id, class_id, title, video_url, thumbnail_url, duration_minutes, video_type } = await request.json();
    if (!title || !video_url) return jsonError(400, "title and video_url are required");
    if (course_id && !requireRole(auth.roles, ['admin']).ok && !(await canManageCourse(env.DB, auth.payload.sub, course_id))) {
      return jsonError(403, "You do not manage this course");
    }
    const id = generateId();
    await execute(env.DB, `INSERT INTO video_lessons (id, course_id, class_id, title, video_type, video_url, thumbnail_url, duration_minutes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, course_id || null, class_id || null, title, video_type || 'video', video_url, thumbnail_url || null, duration_minutes || null, auth.payload.sub]);
    return new Response(JSON.stringify({ success: true, video_id: id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
