import { verifyAuth, requireRole, isEnrolled, jsonError } from "../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId } from "../../../../_shared/db.js";

const MAX_ATTEMPTS = 3;

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
    }

    // 时间窗检查对所有人（含重考）生效
    if (assessment.available_from && new Date() < new Date(assessment.available_from)) return jsonError(400, "Not yet available");
    if (assessment.available_until && new Date() > new Date(assessment.available_until)) return jsonError(400, "No longer available");

    const existing = await queryOne(env.DB, `SELECT * FROM assessment_submissions WHERE assessment_id = ? AND student_id = ? AND is_latest = 1`, [params.id, auth.payload.sub]);
    if (existing && existing.status === 'in_progress') return new Response(JSON.stringify({ error: "Already started", submission: existing }), { status: 400, headers: { "Content-Type": "application/json" } });
    if (existing && (existing.status === 'submitted' || existing.status === 'graded')) {
      if (!isStaff && (existing.attempt_number || 1) >= MAX_ATTEMPTS) {
        return jsonError(403, "Maximum attempts reached");
      }
      await execute(env.DB, `UPDATE assessment_submissions SET is_latest = 0 WHERE id = ?`, [existing.id]);
      const nextAttempt = (existing.attempt_number || 1) + 1;
      const subId = generateId();
      await execute(env.DB, `INSERT INTO assessment_submissions (id, assessment_id, student_id, status, attempt_number, is_latest) VALUES (?, ?, ?, 'in_progress', ?, 1)`, [subId, params.id, auth.payload.sub, nextAttempt]);
      const questions = await queryAll(env.DB, `SELECT id, question_text, question_type, options, points, sort_order FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order`, [params.id]);
      return new Response(JSON.stringify({ success: true, submission_id: subId, attempt_number: nextAttempt, questions }), { headers: { "Content-Type": "application/json" } });
    }
    const subId = generateId();
    await execute(env.DB, `INSERT INTO assessment_submissions (id, assessment_id, student_id, status) VALUES (?, ?, ?, 'in_progress')`, [subId, params.id, auth.payload.sub]);
    const questions = await queryAll(env.DB, `SELECT id, question_text, question_type, options, points, sort_order FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order`, [params.id]);
    return new Response(JSON.stringify({ success: true, submission_id: subId, questions }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
