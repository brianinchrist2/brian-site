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
    const classId = url.searchParams.get("class_id");
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    let sql = `SELECT * FROM video_lessons WHERE status = 'published'`;
    let countSql = `SELECT COUNT(*) as total FROM video_lessons WHERE status = 'published'`;
    let params = [];
    let countParams = [];
    if (courseId) { sql += ` AND course_id = ?`; params.push(courseId); countSql += ` AND course_id = ?`; countParams.push(courseId); }
    if (classId) { sql += ` AND class_id = ?`; params.push(classId); countSql += ` AND class_id = ?`; countParams.push(classId); }
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
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
    const roles = JSON.parse(user.roles);
    if (!roles.includes('teacher') && !roles.includes('admin')) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const { course_id, class_id, title, video_url, thumbnail_url, duration_minutes, video_type } = await request.json();
    if (!title || !video_url) return new Response(JSON.stringify({ error: "title and video_url are required" }), { status: 400 });
    const id = generateId();
    await execute(env.DB, `INSERT INTO video_lessons (id, course_id, class_id, title, video_type, video_url, thumbnail_url, duration_minutes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, course_id || null, class_id || null, title, video_type || 'video', video_url, thumbnail_url || null, duration_minutes || null, payload.sub]);
    return new Response(JSON.stringify({ success: true, video_id: id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
