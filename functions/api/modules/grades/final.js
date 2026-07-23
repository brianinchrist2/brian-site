import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne } from "../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const courseId = url.searchParams.get("course_id");
    if (!courseId) return new Response(JSON.stringify({ error: "course_id is required" }), { status: 400 });
    const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
    const roles = JSON.parse(user.roles || '[]');
    const isTeacher = roles.includes('teacher') || roles.includes('admin');
    let sql, params;
    if (isTeacher) {
      sql = "SELECT fg.*, u.nickname as student_name FROM final_grades fg JOIN users u ON fg.student_id = u.id WHERE fg.course_id = ? ORDER BY u.nickname";
      params = [courseId];
    } else {
      sql = "SELECT * FROM final_grades WHERE student_id = ? AND course_id = ?";
      params = [payload.sub, courseId];
    }
    const grades = await queryAll(env.DB, sql, params);
    return new Response(JSON.stringify({ success: true, grades }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
