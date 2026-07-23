import { verifyJWT } from "../../../../../_utils/jwt.js";
import { queryOne, execute, generateId } from "../../../../../_shared/db.js";

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
    const roles = JSON.parse(user.roles);
    if (!roles.includes('teacher') && !roles.includes('admin')) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const { score, feedback } = await request.json();
    if (score === undefined) return new Response(JSON.stringify({ error: "score is required" }), { status: 400 });
    const submission = await queryOne(env.DB, `SELECT * FROM assignment_submissions WHERE id = ?`, [params.id]);
    if (!submission) return new Response(JSON.stringify({ error: "Submission not found" }), { status: 404 });
    const existing = await queryOne(env.DB, `SELECT id FROM assignment_grades WHERE submission_id = ?`, [params.id]);
    if (existing) {
      await execute(env.DB, `UPDATE assignment_grades SET score = ?, feedback = ?, teacher_id = ? WHERE id = ?`, [score, feedback || null, payload.sub, existing.id]);
    } else {
      const id = generateId();
      await execute(env.DB, `INSERT INTO assignment_grades (id, submission_id, teacher_id, score, feedback) VALUES (?, ?, ?, ?, ?)`, [id, params.id, payload.sub, score, feedback || null]);
    }
    await execute(env.DB, `UPDATE assignment_submissions SET status = 'graded' WHERE id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}
