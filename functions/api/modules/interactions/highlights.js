import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/interactions/highlights?item_id=xxx - 获取高亮列表（含可见性过滤）
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const itemId = url.searchParams.get('item_id');
    
    if (!itemId) {
      return new Response(JSON.stringify({ error: "item_id is required" }), { status: 400 });
    }
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 获取用户所在班级
    const userClasses = await queryAll(env.DB,
      'SELECT class_id FROM class_members WHERE student_id = ?',
      [payload.sub]
    );
    const classIds = userClasses.map(c => c.class_id);
    
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    let highlights;
    let total;
    
    if (classIds.length > 0) {
      const placeholders = classIds.map(() => '?').join(',');
      const visParams = [itemId, payload.sub, ...classIds];
      const visWhere = `
        h.item_id = ?
        AND (
          h.user_id = ?
          OR h.visibility = 'public'
          OR (h.visibility = 'class' AND (
            SELECT COUNT(*) FROM json_each(h.class_ids) je
            WHERE je.value IN (${placeholders})
          ) > 0)
        )
      `;
      const countResult = await queryOne(env.DB, `SELECT COUNT(*) as total FROM highlights h WHERE ${visWhere}`, visParams);
      total = countResult.total;
      highlights = await queryAll(env.DB, `
        SELECT h.*, u.nickname as author_name, u.avatar_url as author_avatar
        FROM highlights h
        JOIN users u ON h.user_id = u.id
        WHERE ${visWhere}
        ORDER BY json_extract(h.anchor_data, '$.position.start') ASC
        LIMIT ? OFFSET ?
      `, [...visParams, limit, offset]);
    } else {
      const visParams = [itemId, payload.sub];
      const visWhere = `h.item_id = ? AND (h.user_id = ? OR h.visibility = 'public')`;
      const countResult = await queryOne(env.DB, `SELECT COUNT(*) as total FROM highlights h WHERE ${visWhere}`, visParams);
      total = countResult.total;
      highlights = await queryAll(env.DB, `
        SELECT h.*, u.nickname as author_name, u.avatar_url as author_avatar
        FROM highlights h
        JOIN users u ON h.user_id = u.id
        WHERE ${visWhere}
        ORDER BY json_extract(h.anchor_data, '$.position.start') ASC
        LIMIT ? OFFSET ?
      `, [...visParams, limit, offset]);
    }
    
    const parsed = highlights.map(h => ({
      ...h,
      anchor_data: JSON.parse(h.anchor_data),
      class_ids: h.class_ids ? JSON.parse(h.class_ids) : null,
      can_edit: h.user_id === payload.sub
    }));
    
    return new Response(JSON.stringify({
      success: true,
      highlights: parsed,
      pagination: { total, limit, offset, hasMore: total > offset + limit }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// POST /api/modules/interactions/highlights - 创建高亮
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
    
    const { itemId, anchorData, comment, color, visibility, classIds } = await request.json();
    
    if (!itemId || !anchorData) {
      return new Response(JSON.stringify({ error: "itemId and anchorData required" }), { status: 400 });
    }
    
    // 验证锚定数据结构
    if (!anchorData.position || !anchorData.quote) {
      return new Response(JSON.stringify({ error: "anchorData must have position and quote" }), { status: 400 });
    }
    
    const highlightId = generateId();
    const createdAt = now();
    
    // 如果是 class 可见性但没有指定 classIds，获取用户所在班级
    let finalClassIds = classIds;
    if (visibility === 'class' && (!classIds || classIds.length === 0)) {
      const userClasses = await queryAll(env.DB,
        'SELECT class_id FROM class_members WHERE student_id = ?',
        [payload.sub]
      );
      finalClassIds = userClasses.map(c => c.class_id);
    }
    
    await execute(env.DB, `
      INSERT INTO highlights (id, user_id, item_id, anchor_data, comment, color, visibility, class_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      highlightId,
      payload.sub,
      itemId,
      JSON.stringify(anchorData),
      comment || null,
      color || 'yellow',
      visibility || 'private',
      finalClassIds ? JSON.stringify(finalClassIds) : null,
      createdAt,
      createdAt
    ]);
    
    return new Response(JSON.stringify({
      success: true,
      highlight: {
        id: highlightId,
        itemId,
        anchorData,
        comment,
        color: color || 'yellow',
        visibility: visibility || 'private',
        classIds: finalClassIds,
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
