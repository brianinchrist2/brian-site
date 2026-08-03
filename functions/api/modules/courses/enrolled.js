import { verifyAuth, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll } from "../../../_shared/db.js";

// GET /api/modules/courses/enrolled - 我的已选课程
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const courses = await queryAll(env.DB, `
      SELECT c.*, u.nickname as creator_name, e.class_id, e.enrolled_at,
        (SELECT COUNT(*) FROM course_items WHERE course_id = c.id AND is_required = 1) as total_items,
        (SELECT COUNT(*) FROM progress WHERE course_id = c.id AND student_id = ? AND status = 'completed') as completed_items
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      JOIN users u ON c.created_by = u.id
      WHERE e.student_id = ? AND e.status = 'active' AND c.status = 'published'
      ORDER BY e.enrolled_at DESC
    `, [auth.payload.sub, auth.payload.sub]);

    return new Response(JSON.stringify({ success: true, courses }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
