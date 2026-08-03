import { verifyAuth, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

// GET /api/modules/students/answers?item_id=xxx - 获取答题记录
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const itemId = url.searchParams.get('item_id');
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    
    if (!itemId) {
      return new Response(JSON.stringify({ error: "item_id is required" }), { status: 400 });
    }
    
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const { total } = await queryOne(env.DB,
      'SELECT COUNT(*) as total FROM answers WHERE student_id = ? AND item_id = ?',
      [auth.payload.sub, itemId]
    );
    const answers = await queryAll(env.DB, `
      SELECT * FROM answers
      WHERE student_id = ? AND item_id = ?
      ORDER BY question_index ASC
      LIMIT ? OFFSET ?
    `, [auth.payload.sub, itemId, limit, offset]);
    
    return new Response(JSON.stringify({
      success: true,
      answers,
      pagination: { total, limit, offset, hasMore: total > offset + limit }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// POST /api/modules/students/answers - 保存答题记录
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    const { itemId, questionIndex, questionText, answerText } = await request.json();
    
    if (!itemId || questionIndex === undefined || !answerText) {
      return new Response(JSON.stringify({ error: "itemId, questionIndex, and answerText required" }), { status: 400 });
    }
    
    const answerId = generateId();
    const createdAt = now();
    
    // UPSERT 答题记录
    await execute(env.DB, `
      INSERT INTO answers (id, student_id, item_id, question_index, question_text, answer_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, item_id, question_index) DO UPDATE SET
        answer_text = excluded.answer_text,
        updated_at = excluded.updated_at
    `, [answerId, auth.payload.sub, itemId, questionIndex, questionText || null, answerText, createdAt, createdAt]);
    
    return new Response(JSON.stringify({
      success: true,
      message: "Answer saved"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
