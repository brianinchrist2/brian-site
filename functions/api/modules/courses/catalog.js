import { verifyAuth, requireRole, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";

// GET /api/modules/courses/catalog - 获取课程列表
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    
    // 验证身份
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    // 查询所有已发布的课程
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
    const { total } = await queryOne(env.DB, `SELECT COUNT(*) as total FROM courses c WHERE c.status = 'published'`);
    const courses = await queryAll(env.DB, `
      SELECT c.*, u.nickname as creator_name,
        (SELECT COUNT(*) FROM course_items WHERE course_id = c.id) as item_count
      FROM courses c
      JOIN users u ON c.created_by = u.id
      WHERE c.status = 'published'
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    return new Response(JSON.stringify({
      success: true,
      courses,
      pagination: { total, limit, offset, hasMore: total > offset + limit }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// POST /api/modules/courses/catalog - 创建新课程（管理员）
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['admin']).ok) return jsonError(403, "Admin access required");
    
    const { title, description, coverUrl, startDate, endDate } = await request.json();
    
    if (!title) {
      return new Response(JSON.stringify({ error: "Title is required" }), { status: 400 });
    }
    
    const courseId = generateId();
    const createdAt = now();
    
    await execute(env.DB, `
      INSERT INTO courses (id, title, description, cover_url, status, created_by, created_at, start_date, end_date)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `, [courseId, title, description || null, coverUrl || null, auth.payload.sub, createdAt, startDate || null, endDate || null]);
    
    return new Response(JSON.stringify({
      success: true,
      course: { id: courseId, title, status: 'draft' }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
