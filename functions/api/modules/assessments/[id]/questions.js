import { verifyAuth, requireRole, isEnrolled, jsonError } from "../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId } from "../../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const assessment = await queryOne(env.DB, `SELECT * FROM assessments WHERE id = ?`, [params.id]);
    if (!assessment) return jsonError(404, "Assessment not found");

    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (!isStaff) {
      if (assessment.status !== 'published') return jsonError(403, "Assessment is not available");
      if (!(await isEnrolled(env.DB, auth.payload.sub, assessment.course_id))) return jsonError(403, "You are not enrolled in this course");
      const started = await queryOne(env.DB,
        `SELECT id FROM assessment_submissions WHERE assessment_id = ? AND student_id = ? AND status = 'in_progress' AND is_latest = 1`,
        [params.id, auth.payload.sub]);
      if (!started) return jsonError(400, "Start the assessment first");
    }

    let questions = await queryAll(env.DB, `SELECT * FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order`, [params.id]);
    if (!isStaff) {
      questions = questions.map(function(q) { delete q.correct_answer; delete q.explanation; return q; });
    }
    return new Response(JSON.stringify({ success: true, assessment, questions }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const { question_text, question_type, options, correct_answer, explanation, points, sort_order } = await request.json();
    if (!question_text) return new Response(JSON.stringify({ error: "question_text is required" }), { status: 400 });
    const id = generateId();
    await execute(env.DB, `INSERT INTO assessment_questions (id, assessment_id, question_text, question_type, options, correct_answer, explanation, points, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.id, question_text, question_type || 'multiple_choice', options ? JSON.stringify(options) : null, correct_answer || null, explanation || null, points || 1, sort_order || 0]);
    return new Response(JSON.stringify({ success: true, question_id: id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
