import { verifyAuth, requireRole, canManageCourse, jsonError } from "../../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute } from "../../../../../_shared/db.js";
import { rateLimit } from "../../../../../_utils/rate-limit.js";

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const { answers } = await request.json();
    if (!answers || !Array.isArray(answers)) return new Response(JSON.stringify({ error: "answers array required" }), { status: 400 });
    const submission = await queryOne(env.DB, `SELECT assessment_id FROM assessment_submissions WHERE id = ?`, [params.id]);
    if (!submission) return new Response(JSON.stringify({ error: "Submission not found" }), { status: 404 });
    if (!requireRole(auth.roles, ['admin']).ok) {
      const assessment = await queryOne(env.DB, `SELECT course_id FROM assessments WHERE id = ?`, [submission.assessment_id]);
      if (!assessment || !(await canManageCourse(env.DB, auth.payload.sub, assessment.course_id))) {
        return new Response(JSON.stringify({ error: "You do not manage this course" }), { status: 403 });
      }
    }
    let totalScore = 0;
    for (const ans of answers) {
      await execute(env.DB, "UPDATE assessment_answers SET score = ?, feedback = ? WHERE id = ?", [ans.score, ans.feedback || null, ans.answer_id]);
      const a = await queryOne(env.DB, "SELECT score FROM assessment_answers WHERE id = ?", [ans.answer_id]);
      if (a) totalScore += a.score;
    }
    await execute(env.DB, "UPDATE assessment_submissions SET status = 'graded', total_score = ? WHERE id = ?", [totalScore, params.id]);
    return new Response(JSON.stringify({ success: true, total_score: totalScore }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
