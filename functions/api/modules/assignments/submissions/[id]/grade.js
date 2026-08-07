import { verifyAuth, requireRole, canManageCourse, jsonError } from "../../../../../_utils/requireAuth.js";
import { queryOne, batch, generateId } from "../../../../../_shared/db.js";
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
    const { score, feedback } = await request.json();
    if (score === undefined) return jsonError(400, "score is required");
    const submission = await queryOne(env.DB, `SELECT * FROM assignment_submissions WHERE id = ?`, [params.id]);
    if (!submission) return jsonError(404, "Submission not found");
    if (!requireRole(auth.roles, ['admin']).ok) {
      const assignment = await queryOne(env.DB, `SELECT course_id FROM assignments WHERE id = ?`, [submission.assignment_id]);
      if (!assignment || !(await canManageCourse(env.DB, auth.payload.sub, assignment.course_id))) {
        return jsonError(403, "You do not manage this course");
      }
    }
    const existing = await queryOne(env.DB, `SELECT id FROM assignment_grades WHERE submission_id = ?`, [params.id]);
    const statements = [];
    if (existing) {
      statements.push({ sql: `UPDATE assignment_grades SET score = ?, feedback = ?, teacher_id = ? WHERE id = ?`, params: [score, feedback || null, auth.payload.sub, existing.id] });
    } else {
      statements.push({ sql: `INSERT INTO assignment_grades (id, submission_id, teacher_id, score, feedback) VALUES (?, ?, ?, ?, ?)`, params: [generateId(), params.id, auth.payload.sub, score, feedback || null] });
    }
    statements.push({ sql: `UPDATE assignment_submissions SET status = 'graded' WHERE id = ?`, params: [params.id] });
    // 单事务提交：成绩写入与提交状态更新要么全部成功，要么全部回滚
    await batch(env.DB, statements);
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
