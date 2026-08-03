import { verifyAuth, requireRole, isEnrolled, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

// GET /api/modules/courses/items?course_id=xxx - 获取课程内容单元
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const courseId = url.searchParams.get('course_id');

    if (!courseId) {
      return jsonError(400, "course_id is required");
    }

    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (!isStaff && !(await isEnrolled(env.DB, auth.payload.sub, courseId))) {
      return jsonError(403, "You are not enrolled in this course");
    }

    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
    const { total } = await queryOne(env.DB, `SELECT COUNT(*) as total FROM course_items WHERE course_id = ?`, [courseId]);
    const items = await queryAll(env.DB, `
      SELECT * FROM course_items
      WHERE course_id = ?
      ORDER BY sort_order ASC
      LIMIT ? OFFSET ?
    `, [courseId, limit, offset]);

    return new Response(JSON.stringify({
      success: true,
      items,
      pagination: { total, limit, offset, hasMore: total > offset + limit }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}

// POST /api/modules/courses/items - 添加内容单元（管理员）
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
    if (!requireRole(auth.roles, ['admin']).ok) return jsonError(403, "Admin access required");
    
    const { courseId, type, title, description, itemRef, sortOrder, isRequired, bookId, bookChapterId } = await request.json();
    
    if (!courseId || !type || !title || !itemRef) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }
    
    const itemId = generateId();
    
    await execute(env.DB, `
      INSERT INTO course_items (id, course_id, type, title, description, item_ref, sort_order, is_required, book_id, book_chapter_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [itemId, courseId, type, title, description || null, itemRef, sortOrder || 0, isRequired !== false ? 1 : 0, bookId || null, bookChapterId || null]);
    
    return new Response(JSON.stringify({
      success: true,
      item: { id: itemId }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
