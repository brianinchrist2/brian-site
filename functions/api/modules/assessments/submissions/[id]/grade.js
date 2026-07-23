import { verifyJWT } from "../../../../../_utils/jwt.js";
import { queryAll, queryOne, execute } from "../../../../../_shared/db.js";

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
    const roles = JSON.parse(user.roles);
    if (!roles.includes('teacher') && !roles.includes('admin')) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const { answers } = await request.json();
    if (!answers || !Array.isArray(answers)) return new Response(JSON.stringify({ error: "answers array required" }), { status: 400 });
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
