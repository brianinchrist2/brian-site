import { verifyAuth, requireRole, isEnrolled, canManageCourse, jsonError } from "../../../../_utils/requireAuth.js";
import { queryOne, execute, generateId, now } from "../../../../_shared/db.js";
import { rateLimit } from "../../../../_utils/rate-limit.js";

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const video = await queryOne(env.DB, `SELECT course_id FROM video_lessons WHERE id = ?`, [params.id]);
    if (!video) return jsonError(404, "Video not found");
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok && !(await isEnrolled(env.DB, auth.payload.sub, video.course_id))) {
      return jsonError(403, "You are not enrolled in this course");
    }
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
    const video = await queryOne(env.DB, `SELECT course_id FROM video_lessons WHERE id = ?`, [params.id]);
    if (!video) return jsonError(404, "Video not found");
    const isAdmin = auth.roles.includes('admin');
    if (!isAdmin) {
      const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
      if (isStaff) {
        // teacher/advisor（非 admin）须管理该视频所属课程（自建 ∪ 所顾问班级课程）；
        // course_id 为 NULL（班级型视频）一律 403，不做泄露
        if (!video.course_id) return jsonError(403, "You do not manage this course");
        const manages = await canManageCourse(env.DB, auth.payload.sub, video.course_id);
        const advisesClass = await queryOne(env.DB,
          `SELECT cc.course_id FROM class_courses cc JOIN classes cl ON cl.id = cc.class_id WHERE cc.course_id = ? AND cl.advisor_id = ?`,
          [video.course_id, auth.payload.sub]);
        if (!manages && !advisesClass) return jsonError(403, "You do not manage this course");
      } else {
        // 学生须已选该视频所属课程
        if (!video.course_id || !(await isEnrolled(env.DB, auth.payload.sub, video.course_id))) {
          return jsonError(403, "You are not enrolled in this course");
        }
      }
    }
    // 学生仅能查看自己的观看记录；教师/顾问/admin 可查看该视频全部日志（已做课程范围校验）
    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    const studentOnly = !auth.roles.includes('admin') && !isStaff;
    const { queryAll } = await import("../../../../_shared/db.js");
    const base = `SELECT w.*, u.nickname as student_name FROM video_watch_logs w JOIN users u ON w.student_id = u.id WHERE w.video_lesson_id = ?`;
    const logs = studentOnly
      ? await queryAll(env.DB, base + ` AND w.student_id = ?`, [params.id, auth.payload.sub])
      : await queryAll(env.DB, base, [params.id]);
    return new Response(JSON.stringify({ success: true, logs }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
