import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/courses/catalog - 获取课程列表
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    
    // 验证身份
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 查询所有已发布的课程
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
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
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 检查管理员权限
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    if (!roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403 });
    }
    
    const { title, description, coverUrl, startDate, endDate } = await request.json();
    
    if (!title) {
      return new Response(JSON.stringify({ error: "Title is required" }), { status: 400 });
    }
    
    const courseId = generateId();
    const createdAt = now();
    
    await execute(env.DB, `
      INSERT INTO courses (id, title, description, cover_url, status, created_by, created_at, start_date, end_date)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `, [courseId, title, description || null, coverUrl || null, payload.sub, createdAt, startDate || null, endDate || null]);
    
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
