import { verifyJWT } from "../../../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../../../_shared/db.js";

// GET /api/modules/interactions/highlights/[id]/replies - 获取回复列表
export async function onRequestGet(context) {
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
      SELECT 
        hr.*,
        u.nickname as author_name,
        u.avatar_url as author_avatar
      FROM highlight_replies hr
      JOIN users u ON hr.user_id = u.id
      WHERE hr.highlight_id = ?
      ORDER BY hr.created_at ASC
    `, [highlightId]);
    
    return new Response(JSON.stringify({
      success: true,
      replies
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// POST /api/modules/interactions/highlights/[id]/replies - 创建回复
export async function onRequestPost(context) {
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
      'SELECT id, user_id, visibility FROM highlights WHERE id = ?',
      [highlightId]
    );
    
    if (!highlight) {
      return new Response(JSON.stringify({ error: "Highlight not found" }), { status: 404 });
    }
    
    // 检查权限：只有高亮作者或公开高亮才能回复
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
    
    // 创建通知给高亮作者
    if (payload.sub !== highlight.user_id) {
      const replier = await queryOne(env.DB,
        'SELECT nickname FROM users WHERE id = ?',
        [payload.sub]
      );
      
      await execute(env.DB, `
        INSERT INTO notifications (id, user_id, type, title, content, entity_type, entity_id, created_at)
        VALUES (?, ?, 'highlight_reply', ?, ?, 'highlight', ?, ?)
      `, [
        generateId(),
        highlight.user_id,
        `${replier.nickname} 回复了你的高亮`,
        content.trim().substring(0, 100),
        highlightId,
        createdAt
      ]);
    }
    
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
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
