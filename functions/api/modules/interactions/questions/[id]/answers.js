import { verifyAuth, requireRole, jsonError } from "../../../../../_utils/requireAuth.js";
import { queryOne, execute, generateId, now } from "../../../../../_shared/db.js";
import { rateLimit } from "../../../../../_utils/rate-limit.js";

// POST /api/modules/interactions/questions/[id]/answers - 创建答案
export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const questionId = params.id;
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
    
    // 检查问题是否存在
    const question = await queryOne(env.DB,
      'SELECT id, status, student_id FROM questions WHERE id = ?',
      [questionId]
    );
    
    if (!question) {
      return new Response(JSON.stringify({ error: "Question not found" }), { status: 404 });
    }
    
    if (question.status === 'closed') {
      return new Response(JSON.stringify({ error: "Cannot answer closed question" }), { status: 400 });
    }
    
    const { content, isOfficial } = await request.json();
    
    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: "Content is required" }), { status: 400 });
    }
    
    // 检查用户是否有权限标记为官方答案
    let finalIsOfficial = 0;
    if (isOfficial) {
      if (requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) {
        finalIsOfficial = 1;
      }
    }
    
    const answerId = generateId();
    const createdAt = now();
    
    await execute(env.DB, `
      INSERT INTO question_answers (id, question_id, user_id, content, is_official, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [answerId, questionId, auth.payload.sub, content.trim(), finalIsOfficial, createdAt, createdAt]);
    
    // 如果有官方答案，更新问题的 has_official 和 status
    if (finalIsOfficial) {
      await execute(env.DB, `
        UPDATE questions SET has_official = 1, status = 'answered', updated_at = ? WHERE id = ?
      `, [createdAt, questionId]);
    }
    
    // 创建通知给提问者
    if (auth.payload.sub !== question.student_id) {
      const answerer = await queryOne(env.DB,
        'SELECT nickname FROM users WHERE id = ?',
        [auth.payload.sub]
      );
      
      await execute(env.DB, `
        INSERT INTO notifications (id, user_id, type, title, content, entity_type, entity_id, created_at)
        VALUES (?, ?, 'question_answer', ?, ?, 'question', ?, ?)
      `, [
        generateId(),
        question.student_id,
        `${answerer.nickname} 回答了你的问题`,
        content.trim().substring(0, 100),
        questionId,
        createdAt
      ]);
    }
    
    return new Response(JSON.stringify({
      success: true,
      answer: {
        id: answerId,
        questionId,
        content: content.trim(),
        isOfficial: finalIsOfficial === 1,
        createdAt
      }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
