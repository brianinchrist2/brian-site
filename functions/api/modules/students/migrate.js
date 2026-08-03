import { verifyAuth, jsonError } from "../../../_utils/requireAuth.js";
import { execute, generateId, batch, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

// POST /api/modules/students/migrate - 从 localStorage 迁移数据
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
    
    const { answers, progress } = await request.json();
    
    const results = {
      answersMigrated: 0,
      progressMigrated: 0,
      errors: []
    };
    
    // 迁移答题记录
    if (answers && typeof answers === 'object') {
      const statements = [];

      let total = 0;
      for (const [itemId, questionAnswers] of Object.entries(answers)) {
        for (const [qIndex, answerText] of Object.entries(questionAnswers)) {
          if (total >= 500) break;
          if (!Number.isInteger(parseInt(qIndex, 10)) || parseInt(qIndex, 10) < 0) continue;
          const ts = now();
          statements.push({
            sql: `INSERT OR IGNORE INTO answers (id, student_id, item_id, question_index, answer_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            params: [generateId(), auth.payload.sub, itemId, parseInt(qIndex, 10), answerText, ts, ts]
          });
          total++;
        }
      }
      
      if (statements.length > 0) {
        try {
          await batch(env.DB, statements);
          results.answersMigrated = statements.length;
        } catch (err) {
          results.errors.push({ type: 'answers', error: err.message });
        }
      }
    }
    
    // 迁移进度
    if (progress && Array.isArray(progress)) {
      const statements = progress.slice(0, 500).map(itemId => {
        const ts = now();
        return {
          sql: `INSERT OR IGNORE INTO progress (id, student_id, course_id, item_id, status, started_at, completed_at) VALUES (?, ?, (SELECT course_id FROM course_items WHERE id = ?), ?, 'completed', ?, ?)`,
          params: [generateId(), auth.payload.sub, itemId, itemId, ts, ts]
        };
      });
      
      if (statements.length > 0) {
        try {
          await batch(env.DB, statements);
          results.progressMigrated = statements.length;
        } catch (err) {
          results.errors.push({ type: 'progress', error: err.message });
        }
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: "Migration completed",
      results
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
