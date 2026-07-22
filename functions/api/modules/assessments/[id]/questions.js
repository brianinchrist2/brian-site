import { verifyJWT } from "../../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId } from "../../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const assessment = await queryOne(env.DB, `SELECT * FROM assessments WHERE id = ?`, [params.id]);
    if (!assessment) return new Response(JSON.stringify({ error: "Assessment not found" }), { status: 404 });
    const isTeacher = payload.roles?.includes("teacher") || payload.roles?.includes("admin");
    let questions = await queryAll(env.DB, `SELECT * FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order`, [params.id]);
    if (!isTeacher) {
      questions = questions.map(function(q) { delete q.correct_answer; delete q.explanation; return q; });
    }
    return new Response(JSON.stringify({ success: true, assessment, questions }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    if (!payload.roles?.includes("teacher") && !payload.roles?.includes("admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const { question_text, question_type, options, correct_answer, explanation, points, sort_order } = await request.json();
    if (!question_text) return new Response(JSON.stringify({ error: "question_text is required" }), { status: 400 });
    const id = generateId();
    await execute(env.DB, `INSERT INTO assessment_questions (id, assessment_id, question_text, question_type, options, correct_answer, explanation, points, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.id, question_text, question_type || 'multiple_choice', options ? JSON.stringify(options) : null, correct_answer || null, explanation || null, points || 1, sort_order || 0]);
    return new Response(JSON.stringify({ success: true, question_id: id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}
