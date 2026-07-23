import { verifyJWT } from "../../../../_utils/jwt.js";
import { queryOne, execute, generateId } from "../../../../_shared/db.js";

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const { content } = await request.json();
    const assignment = await queryOne(env.DB, `SELECT * FROM assignments WHERE id = ?`, [params.id]);
    if (!assignment) return new Response(JSON.stringify({ error: "Assignment not found" }), { status: 404 });
    let status = 'submitted';
    if (assignment.due_date && new Date() > new Date(assignment.due_date)) status = 'late';
    const latest = await queryOne(env.DB, `SELECT id, attempt_number FROM assignment_submissions WHERE assignment_id = ? AND student_id = ? AND is_latest = 1`, [params.id, payload.sub]);
    if (latest) {
      await execute(env.DB, `UPDATE assignment_submissions SET is_latest = 0 WHERE id = ?`, [latest.id]);
      const id = generateId();
      const attempt_number = latest.attempt_number + 1;
      await execute(env.DB, `INSERT INTO assignment_submissions (id, assignment_id, student_id, content, status, attempt_number, is_latest) VALUES (?, ?, ?, ?, ?, ?, 1)`, [id, params.id, payload.sub, content || null, status, attempt_number]);
      return new Response(JSON.stringify({ success: true, submission_id: id, attempt_number }), { headers: { "Content-Type": "application/json" } });
    }
    const id = generateId();
    await execute(env.DB, `INSERT INTO assignment_submissions (id, assignment_id, student_id, content, status, attempt_number, is_latest) VALUES (?, ?, ?, ?, ?, 1, 1)`, [id, params.id, payload.sub, content || null, status]);
    return new Response(JSON.stringify({ success: true, submission_id: id, attempt_number: 1 }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
