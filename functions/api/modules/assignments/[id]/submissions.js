import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne } from "../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    if (!payload.roles?.includes("teacher") && !payload.roles?.includes("admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
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
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}
