import { verifyJWT } from "../../../_utils/jwt.js";
import { execute, generateId, batch } from "../../../_shared/db.js";

// POST /api/modules/students/migrate - 从 localStorage 迁移数据
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
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
      
      for (const [itemId, questionAnswers] of Object.entries(answers)) {
        for (const [qIndex, answerText] of Object.entries(questionAnswers)) {
          statements.push({
            sql: `INSERT OR IGNORE INTO answers (id, student_id, item_id, question_index, answer_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            params: [generateId(), payload.sub, itemId, parseInt(qIndex), answerText]
          });
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
      const statements = progress.map(itemId => ({
        sql: `INSERT OR IGNORE INTO progress (id, student_id, course_id, item_id, status, started_at, completed_at) VALUES (?, ?, (SELECT course_id FROM course_items WHERE id = ?), ?, 'completed', datetime('now'), datetime('now'))`,
        params: [generateId(), payload.sub, itemId, itemId]
      }));
      
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
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
