import { verifyAuth, requireRole, canManageCourse, jsonError } from "../../../../../_utils/requireAuth.js";
import { queryAll, queryOne, batch } from "../../../../../_shared/db.js";
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
    // 一次查询出该 submission 下真实存在的 answer id，替代原先逐条 UPDATE 后的回读（消除 N+1）
    const existingRows = await queryAll(env.DB, "SELECT id FROM assessment_answers WHERE submission_id = ?", [params.id]);
    const validIds = new Set(existingRows.map(r => r.id));
    const statements = [];
    let totalScore = 0;
    for (const ans of answers) {
      if (!validIds.has(ans.answer_id)) continue;
      const n = Number(ans.score);
      totalScore += Number.isFinite(n) ? n : 0;
      statements.push({ sql: "UPDATE assessment_answers SET score = ?, feedback = ? WHERE id = ?", params: [ans.score == null ? null : ans.score, ans.feedback || null, ans.answer_id] });
    }
    statements.push({ sql: "UPDATE assessment_submissions SET status = 'graded', total_score = ? WHERE id = ?", params: [totalScore, params.id] });
    // 单事务提交：逐题评分与提交总成绩要么全部成功，要么全部回滚
    await batch(env.DB, statements);
    return new Response(JSON.stringify({ success: true, total_score: totalScore }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
