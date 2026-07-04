import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/interactions/questions/[id] - 获取问题详情和答案
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const questionId = params.id;
    
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 获取问题详情
    const question = await queryOne(env.DB, `
      SELECT 
        q.*,
        u.nickname as student_name,
        u.avatar_url as student_avatar
      FROM questions q
      JOIN users u ON q.student_id = u.id
      WHERE q.id = ?
    `, [questionId]);
    
    if (!question) {
      return new Response(JSON.stringify({ error: "Question not found" }), { status: 404 });
    }
    
    // 获取答案列表（官方答案排前面）
    const answers = await queryAll(env.DB, `
      SELECT 
        qa.*,
        u.nickname as author_name,
        u.avatar_url as author_avatar,
        u.roles as author_roles
      FROM question_answers qa
      JOIN users u ON qa.user_id = u.id
      WHERE qa.question_id = ?
      ORDER BY qa.is_official DESC, qa.created_at ASC
    `, [questionId]);
    
    return new Response(JSON.stringify({
      success: true,
      question,
      answers
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// PUT /api/modules/interactions/questions/[id] - 更新问题状态（仅提问者）
export async function onRequestPut(context) {
  try {
    const { env, params, request } = context;
    const questionId = params.id;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 检查问题是否存在且属于当前用户
    const question = await queryOne(env.DB,
      'SELECT student_id FROM questions WHERE id = ?',
      [questionId]
    );
    
    if (!question) {
      return new Response(JSON.stringify({ error: "Question not found" }), { status: 404 });
    }
    
    if (question.student_id !== payload.sub) {
      return new Response(JSON.stringify({ error: "Cannot update other user's question" }), { status: 403 });
    }
    
    const { status } = await request.json();
    
    if (!['open', 'answered', 'closed'].includes(status)) {
      return new Response(JSON.stringify({ error: "Invalid status" }), { status: 400 });
    }
    
    await execute(env.DB, `
      UPDATE questions SET status = ?, updated_at = ? WHERE id = ?
    `, [status, now(), questionId]);
    
    return new Response(JSON.stringify({
      success: true,
      message: "Question status updated"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/interactions/questions/[id]/answers - 创建答案
export async function onPostAnswer(context) {
  try {
    const { env, params, request } = context;
    const questionId = params.id;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 检查问题是否存在
    const question = await queryOne(env.DB,
      'SELECT id, status FROM questions WHERE id = ?',
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
      const user = await queryOne(env.DB,
        'SELECT roles FROM users WHERE id = ?',
        [payload.sub]
      );
      const roles = JSON.parse(user.roles || '[]');
      if (roles.includes('teacher') || roles.includes('advisor') || roles.includes('admin')) {
        finalIsOfficial = 1;
      }
    }
    
    const answerId = generateId();
    const createdAt = now();
    
    await execute(env.DB, `
      INSERT INTO question_answers (id, question_id, user_id, content, is_official, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [answerId, questionId, payload.sub, content.trim(), finalIsOfficial, createdAt, createdAt]);
    
    // 如果有官方答案，更新问题的 has_official 和 status
    if (finalIsOfficial) {
      await execute(env.DB, `
        UPDATE questions SET has_official = 1, status = 'answered', updated_at = ? WHERE id = ?
      `, [createdAt, questionId]);
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
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
