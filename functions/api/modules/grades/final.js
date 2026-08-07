import { verifyAuth, requireRole, canManageCourse, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll } from "../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const courseId = url.searchParams.get("course_id");
    if (!courseId) return new Response(JSON.stringify({ error: "course_id is required" }), { status: 400 });
    const isTeacher = requireRole(auth.roles, ['teacher', 'admin']).ok;
    let sql, params;
    if (courseId === 'all') {
      if (isTeacher) return jsonError(400, "Teachers must specify course_id");
      sql = "SELECT fg.*, c.title as course_title FROM final_grades fg JOIN courses c ON fg.course_id = c.id WHERE fg.student_id = ? ORDER BY c.title";
      params = [auth.payload.sub];
    } else if (isTeacher) {
      if (!requireRole(auth.roles, ['admin']).ok && !(await canManageCourse(env.DB, auth.payload.sub, courseId))) {
        return jsonError(403, "You do not manage this course");
      }
      sql = "SELECT fg.*, u.nickname as student_name FROM final_grades fg JOIN users u ON fg.student_id = u.id WHERE fg.course_id = ? ORDER BY u.nickname";
      params = [courseId];
    } else {
      sql = "SELECT fg.*, c.title as course_title FROM final_grades fg JOIN courses c ON fg.course_id = c.id WHERE fg.student_id = ? AND fg.course_id = ?";
      params = [auth.payload.sub, courseId];
    }
    const grades = await queryAll(env.DB, sql, params);
    return new Response(JSON.stringify({ success: true, grades }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
