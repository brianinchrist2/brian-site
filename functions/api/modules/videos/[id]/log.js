import { verifyAuth, requireRole, jsonError } from "../../../../_utils/requireAuth.js";
import { queryOne, execute, generateId, now } from "../../../../_shared/db.js";
import { rateLimit } from "../../../../_utils/rate-limit.js";

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
    const { watch_duration_seconds, last_position_seconds, completed } = await request.json();
    const existing = await queryOne(env.DB, `SELECT id FROM video_watch_logs WHERE video_lesson_id = ? AND student_id = ?`, [params.id, auth.payload.sub]);
    if (existing) {
      await execute(env.DB, `UPDATE video_watch_logs SET watch_duration_seconds = ?, last_position_seconds = ?, completed = ?, last_watched_at = ? WHERE id = ?`,
        [watch_duration_seconds || 0, last_position_seconds || 0, completed ? 1 : 0, now(), existing.id]);
    } else {
      const id = generateId();
      await execute(env.DB, `INSERT INTO video_watch_logs (id, video_lesson_id, student_id, watch_duration_seconds, last_position_seconds, completed, first_watched_at, last_watched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, params.id, auth.payload.sub, watch_duration_seconds || 0, last_position_seconds || 0, completed ? 1 : 0, now(), now()]);
    }
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const { queryAll } = await import("../../../../_shared/db.js");
    const logs = await queryAll(env.DB, `SELECT w.*, u.nickname as student_name FROM video_watch_logs w JOIN users u ON w.student_id = u.id WHERE w.video_lesson_id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true, logs }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
