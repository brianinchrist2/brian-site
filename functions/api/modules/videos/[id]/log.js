import { verifyJWT } from "../../../../_utils/jwt.js";
import { queryOne, execute, generateId } from "../../../../_shared/db.js";

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const { watch_duration_seconds, last_position_seconds, completed } = await request.json();
    const existing = await queryOne(env.DB, `SELECT id FROM video_watch_logs WHERE video_lesson_id = ? AND student_id = ?`, [params.id, payload.sub]);
    if (existing) {
      await execute(env.DB, `UPDATE video_watch_logs SET watch_duration_seconds = ?, last_position_seconds = ?, completed = ?, updated_at = datetime('now') WHERE id = ?`,
        [watch_duration_seconds || 0, last_position_seconds || 0, completed ? 1 : 0, existing.id]);
    } else {
      const id = generateId();
      await execute(env.DB, `INSERT INTO video_watch_logs (id, video_lesson_id, student_id, watch_duration_seconds, last_position_seconds, completed) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, params.id, payload.sub, watch_duration_seconds || 0, last_position_seconds || 0, completed ? 1 : 0]);
    }
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
    const roles = JSON.parse(user.roles);
    if (!roles.includes('teacher') && !roles.includes('admin')) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const { queryAll } = await import("../../../_shared/db.js");
    const logs = await queryAll(env.DB, `SELECT w.*, u.nickname as student_name FROM video_watch_logs w JOIN users u ON w.student_id = u.id WHERE w.video_lesson_id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true, logs }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}
