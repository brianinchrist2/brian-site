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
    const existing = await queryOne(env.DB, `SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?`, [params.id, payload.sub]);
    let status = 'submitted';
    if (assignment.due_date && new Date() > new Date(assignment.due_date)) status = 'late';
    if (existing) {
      await execute(env.DB, `UPDATE assignment_submissions SET content = ?, status = ?, submitted_at = datetime('now') WHERE id = ?`, [content || null, status, existing.id]);
      return new Response(JSON.stringify({ success: true, submission_id: existing.id }), { headers: { "Content-Type": "application/json" } });
    }
    const id = generateId();
    await execute(env.DB, `INSERT INTO assignment_submissions (id, assignment_id, student_id, content, status) VALUES (?, ?, ?, ?, ?)`, [id, params.id, payload.sub, content || null, status]);
    return new Response(JSON.stringify({ success: true, submission_id: id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}
