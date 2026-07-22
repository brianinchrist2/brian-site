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
    let sql = `SELECT * FROM video_lessons WHERE status = 'published'`;
    let params = [];
    if (courseId) { sql += ` AND course_id = ?`; params.push(courseId); }
    if (classId) { sql += ` AND class_id = ?`; params.push(classId); }
    sql += ` ORDER BY created_at DESC`;
    const videos = await queryAll(env.DB, sql, params);
    return new Response(JSON.stringify({ success: true, videos }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    if (!payload.roles?.includes("teacher") && !payload.roles?.includes("admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const { course_id, class_id, title, video_url, thumbnail_url, duration_minutes, video_type } = await request.json();
    if (!title || !video_url) return new Response(JSON.stringify({ error: "title and video_url are required" }), { status: 400 });
    const id = generateId();
    await execute(env.DB, `INSERT INTO video_lessons (id, course_id, class_id, title, video_type, video_url, thumbnail_url, duration_minutes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, course_id || null, class_id || null, title, video_type || 'video', video_url, thumbnail_url || null, duration_minutes || null, payload.sub]);
    return new Response(JSON.stringify({ success: true, video_id: id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}
