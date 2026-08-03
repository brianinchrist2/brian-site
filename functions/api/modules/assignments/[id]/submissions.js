import { verifyAuth, requireRole, jsonError } from "../../../../_utils/requireAuth.js";
import { queryAll } from "../../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const submissions = await queryAll(env.DB, `
      SELECT s.*, u.nickname as student_name, u.email as student_email,
        g.score, g.feedback, g.teacher_id
      FROM assignment_submissions s
      JOIN users u ON s.student_id = u.id
      LEFT JOIN assignment_grades g ON s.id = g.submission_id
      WHERE s.assignment_id = ?
      ORDER BY s.submitted_at DESC
    `, [params.id]);
    return new Response(JSON.stringify({ success: true, submissions }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
