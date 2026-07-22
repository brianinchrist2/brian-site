import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId } from "../../../_shared/db.js";

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const submission = await queryOne(env.DB, `SELECT * FROM assessment_submissions WHERE assessment_id = ? AND student_id = ?`, [params.id, payload.sub]);
    if (!submission) return new Response(JSON.stringify({ error: "No submission found. Start the exam first." }), { status: 400 });
    if (submission.status === 'graded' || submission.status === 'submitted') return new Response(JSON.stringify({ error: "Already submitted" }), { status: 400 });
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
    await execute(env.DB, `UPDATE assessment_submissions SET submitted_at = datetime('now'), status = ?, total_score = ? WHERE id = ?`, [status, totalScore, submission.id]);
    return new Response(JSON.stringify({ success: true, status, total_score: totalScore }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}
