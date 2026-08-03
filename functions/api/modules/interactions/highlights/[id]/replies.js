import { verifyAuth, jsonError } from "../../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../../../_shared/db.js";
import { rateLimit } from "../../../../../_utils/rate-limit.js";

// GET /api/modules/interactions/highlights/[id]/replies - 获取回复列表
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const highlightId = params.id;
    
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const highlight = await queryOne(env.DB, 'SELECT id, user_id, visibility FROM highlights WHERE id = ?', [highlightId]);
    if (!highlight) return jsonError(404, "Highlight not found");
    // 与 POST 相同的可见性判定：私有高亮仅作者可见
    if (highlight.visibility === 'private' && highlight.user_id !== auth.payload.sub) {
      return jsonError(403, "Cannot view private highlight");
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
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
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
    if (highlight.visibility === 'private' && highlight.user_id !== auth.payload.sub) {
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
    `, [replyId, highlightId, auth.payload.sub, content.trim(), createdAt, createdAt]);
    
    // 创建通知给高亮作者
    if (auth.payload.sub !== highlight.user_id) {
      const replier = await queryOne(env.DB,
        'SELECT nickname FROM users WHERE id = ?',
        [auth.payload.sub]
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
