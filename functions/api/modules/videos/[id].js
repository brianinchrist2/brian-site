import { verifyAuth, requireRole, isEnrolled, canManageCourse, jsonError } from "../../../_utils/requireAuth.js";
import { queryOne, execute } from "../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const video = await queryOne(env.DB, `SELECT * FROM video_lessons WHERE id = ?`, [params.id]);
    if (!video) return jsonError(404, "Video not found");
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok && !(await isEnrolled(env.DB, auth.payload.sub, video.course_id))) {
      return jsonError(403, "You are not enrolled in this course");
    }
    const watchLog = await queryOne(env.DB, `SELECT * FROM video_watch_logs WHERE video_lesson_id = ? AND student_id = ?`, [params.id, auth.payload.sub]);
    return new Response(JSON.stringify({ success: true, video, watch_log: watchLog }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const video = await queryOne(env.DB, `SELECT course_id FROM video_lessons WHERE id = ?`, [params.id]);
    if (!video) return jsonError(404, "Video not found");
    if (video.course_id && !requireRole(auth.roles, ['admin']).ok && !(await canManageCourse(env.DB, auth.payload.sub, video.course_id))) {
      return jsonError(403, "You do not manage this course");
    }
    await execute(env.DB, `DELETE FROM video_lessons WHERE id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
