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
    let sql = `SELECT a.*, c.title as course_title FROM assignments a JOIN courses c ON a.course_id = c.id WHERE 1=1`;
    let params = [];
    if (courseId) { sql += ` AND a.course_id = ?`; params.push(courseId); }
    sql += ` ORDER BY a.created_at DESC`;
    const assignments = await queryAll(env.DB, sql, params);
    return new Response(JSON.stringify({ success: true, assignments }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
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
    const { course_id, title, type, description, due_date, max_score, late_penalty } = await request.json();
    if (!course_id || !title) return new Response(JSON.stringify({ error: "course_id and title are required" }), { status: 400 });
    const id = generateId();
    await execute(env.DB, `INSERT INTO assignments (id, course_id, title, type, description, due_date, max_score, late_penalty, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
      [id, course_id, title, type || 'homework', description || null, due_date || null, max_score || 100, late_penalty || 0, payload.sub]);
    return new Response(JSON.stringify({ success: true, assignment_id: id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}
