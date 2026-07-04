import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/students/answers?item_id=xxx - 获取答题记录
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const itemId = url.searchParams.get('item_id');
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    if (!itemId) {
      return new Response(JSON.stringify({ error: "item_id is required" }), { status: 400 });
    }
    
    const answers = await queryAll(env.DB, `
      SELECT * FROM answers
      WHERE student_id = ? AND item_id = ?
      ORDER BY question_index ASC
    `, [payload.sub, itemId]);
    
    return new Response(JSON.stringify({
      success: true,
      answers
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/students/answers - 保存答题记录
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
    `, [answerId, payload.sub, itemId, questionIndex, questionText || null, answerText, createdAt, createdAt]);
    
    return new Response(JSON.stringify({
      success: true,
      message: "Answer saved"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
