import { verifyAuth, jsonError } from "../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../../_shared/db.js";
import { rateLimit } from "../../../../_utils/rate-limit.js";

// 兼容空格格式（datetime('now')）与 ISO 格式两种时间戳
function toMs(value) {
  if (!value) return null;
  const s = String(value);
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    const submission = await queryOne(env.DB, `SELECT * FROM assessment_submissions WHERE assessment_id = ? AND student_id = ? AND is_latest = 1`, [params.id, auth.payload.sub]);
    if (!submission) return jsonError(400, "No submission found. Start the exam first.");
    if (submission.status === 'graded' || submission.status === 'submitted') return jsonError(400, "Already submitted");

    // 服务端时限校验：started_at + duration_minutes
    const assessment = await queryOne(env.DB, `SELECT duration_minutes FROM assessments WHERE id = ?`, [params.id]);
    if (assessment && assessment.duration_minutes) {
      const started = toMs(submission.started_at);
      if (started !== null && Date.now() > started + assessment.duration_minutes * 60000) {
        return jsonError(400, "Time limit exceeded");
      }
    }
    const { answers } = await request.json();
    if (!answers || !Array.isArray(answers)) return new Response(JSON.stringify({ error: "answers array is required" }), { status: 400 });
    const questions = await queryAll(env.DB, `SELECT * FROM assessment_questions WHERE assessment_id = ?`, [params.id]);
    const qMap = {}; questions.forEach(function(q) { qMap[q.id] = q; });
    let totalScore = 0;
    let hasSubjective = false;
    const objectiveTypes = ['multiple_choice', 'true_false', 'fill_blank'];
    for (const ans of answers) {
      const q = qMap[ans.question_id];
      if (!q) continue;
      let score = null;
      if (objectiveTypes.includes(q.question_type)) {
        const correct = q.correct_answer ? String(q.correct_answer).trim().toLowerCase() : '';
        const given = ans.selected_option ? String(ans.selected_option).trim().toLowerCase() : (ans.answer_text ? String(ans.answer_text).trim().toLowerCase() : '');
        score = (correct && given && correct === given) ? q.points : 0;
        totalScore += score;
      } else {
        hasSubjective = true;
      }
      const ansId = generateId();
      await execute(env.DB, `INSERT INTO assessment_answers (id, submission_id, assessment_question_id, answer_text, selected_option, score) VALUES (?, ?, ?, ?, ?, ?)`,
        [ansId, submission.id, ans.question_id, ans.answer_text || null, ans.selected_option || null, score]);
    }
    const status = hasSubjective ? 'submitted' : 'graded';
    await execute(env.DB, `UPDATE assessment_submissions SET submitted_at = ?, status = ?, total_score = ? WHERE id = ?`, [now(), status, totalScore, submission.id]);
    return new Response(JSON.stringify({ success: true, status, total_score: totalScore }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
