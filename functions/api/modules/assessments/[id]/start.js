import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId } from "../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const assessment = await queryOne(env.DB, `SELECT * FROM assessments WHERE id = ?`, [params.id]);
    if (!assessment) return new Response(JSON.stringify({ error: "Assessment not found" }), { status: 404 });
    const existing = await queryOne(env.DB, `SELECT * FROM assessment_submissions WHERE assessment_id = ? AND student_id = ?`, [params.id, payload.sub]);
    if (existing) return new Response(JSON.stringify({ error: "Already started", submission: existing }), { status: 400 });
    if (assessment.available_from && new Date() < new Date(assessment.available_from)) return new Response(JSON.stringify({ error: "Not yet available" }), { status: 400 });
    if (assessment.available_until && new Date() > new Date(assessment.available_until)) return new Response(JSON.stringify({ error: "No longer available" }), { status: 400 });
    const subId = generateId();
    await execute(env.DB, `INSERT INTO assessment_submissions (id, assessment_id, student_id, status) VALUES (?, ?, ?, 'in_progress')`, [subId, params.id, payload.sub]);
    const questions = await queryAll(env.DB, `SELECT id, question_text, question_type, options, points, sort_order FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order`, [params.id]);
    return new Response(JSON.stringify({ success: true, submission_id: subId, questions }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}
