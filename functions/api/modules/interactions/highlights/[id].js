import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// DELETE /api/modules/interactions/highlights/[id] - 删除高亮（仅所有者）
export async function onDelete(context) {
  try {
    const { env, params } = context;
    const highlightId = params.id;
    
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 检查高亮是否存在且属于当前用户
    const highlight = await queryOne(env.DB,
      'SELECT user_id FROM highlights WHERE id = ?',
      [highlightId]
    );
    
    if (!highlight) {
      return new Response(JSON.stringify({ error: "Highlight not found" }), { status: 404 });
    }
    
    if (highlight.user_id !== payload.sub) {
      return new Response(JSON.stringify({ error: "Cannot delete other user's highlight" }), { status: 403 });
    }
    
    await execute(env.DB, 'DELETE FROM highlights WHERE id = ?', [highlightId]);
    
    return new Response(JSON.stringify({
      success: true,
      message: "Highlight deleted"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// GET /api/modules/interactions/highlights/[id]/replies - 获取回复
export async function onGetReplies(context) {
  try {
    const { env, params } = context;
    const highlightId = params.id;
    
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const replies = await queryAll(env.DB, `
      SELECT r.*, u.nickname as author_name, u.avatar_url as author_avatar
      FROM highlight_replies r
      JOIN users u ON r.user_id = u.id
      WHERE r.highlight_id = ?
      ORDER BY r.created_at ASC
    `, [highlightId]);
    
    return new Response(JSON.stringify({
      success: true,
      replies
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/interactions/highlights/[id]/replies - 创建回复
export async function onPostReply(context) {
  try {
    const { env, params, request } = context;
    const highlightId = params.id;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 检查高亮是否存在
    const highlight = await queryOne(env.DB,
      'SELECT id, visibility, user_id FROM highlights WHERE id = ?',
      [highlightId]
    );
    
    if (!highlight) {
      return new Response(JSON.stringify({ error: "Highlight not found" }), { status: 404 });
    }
    
    // 检查是否有权限回复（公开高亮或自己的高亮）
    if (highlight.visibility === 'private' && highlight.user_id !== payload.sub) {
      return new Response(JSON.stringify({ error: "Cannot reply to private highlight" }), { status: 403 });
    }
    
    const { content } = await request.json();
    
    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: "Content is required" }), { status: 400 });
    }
    
    const replyId = generateId();
    const createdAt = now();
    
    await execute(env.DB, `
      INSERT INTO highlight_replies (id, highlight_id, user_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [replyId, highlightId, payload.sub, content.trim(), createdAt, createdAt]);
    
    return new Response(JSON.stringify({
      success: true,
      reply: {
        id: replyId,
        highlightId,
        content: content.trim(),
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
