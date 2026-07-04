import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId } from "../../../_shared/db.js";

// GET /api/modules/courses/items?course_id=xxx - 获取课程内容单元
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const courseId = url.searchParams.get('course_id');
    
    if (!courseId) {
      return new Response(JSON.stringify({ error: "course_id is required" }), { status: 400 });
    }
    
    const items = await queryAll(env.DB, `
      SELECT * FROM course_items
      WHERE course_id = ?
      ORDER BY sort_order ASC
    `, [courseId]);
    
    return new Response(JSON.stringify({
      success: true,
      items
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/courses/items - 添加内容单元（管理员）
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
    
    const { courseId, type, title, description, itemRef, sortOrder, isRequired } = await request.json();
    
    if (!courseId || !type || !title || !itemRef) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }
    
    const itemId = generateId();
    
    await execute(env.DB, `
      INSERT INTO course_items (id, course_id, type, title, description, item_ref, sort_order, is_required)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [itemId, courseId, type, title, description || null, itemRef, sortOrder || 0, isRequired !== false ? 1 : 0]);
    
    return new Response(JSON.stringify({
      success: true,
      item: { id: itemId }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
