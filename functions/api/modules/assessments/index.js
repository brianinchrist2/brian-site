import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId } from "../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
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
    return new Response(JSON.stringify({ success: true, assessments, pagination: { total, limit, offset, hasMore: total > offset + limit } }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
    const roles = JSON.parse(user.roles);
    if (!roles.includes('teacher') && !roles.includes('admin')) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const { course_id, title, type, total_score, passing_score, duration_minutes, available_from, available_until } = await request.json();
    if (!course_id || !title) return new Response(JSON.stringify({ error: "course_id and title are required" }), { status: 400 });
    const id = generateId();
    await execute(env.DB, `INSERT INTO assessments (id, course_id, title, type, total_score, passing_score, duration_minutes, available_from, available_until, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
      [id, course_id, title, type || 'quiz', total_score || 100, passing_score || 60, duration_minutes || null, available_from || null, available_until || null, payload.sub]);
    return new Response(JSON.stringify({ success: true, assessment_id: id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
