import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/students/progress?course_id=xxx - 获取学习进度
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const courseId = url.searchParams.get('course_id');
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    if (!courseId) {
      return new Response(JSON.stringify({ error: "course_id is required" }), { status: 400 });
    }
    
    // 获取学生在该课程的所有进度
    const progress = await queryAll(env.DB, `
      SELECT p.*, ci.title as item_title, ci.type as item_type
      FROM progress p
      JOIN course_items ci ON p.item_id = ci.id
      WHERE p.student_id = ? AND p.course_id = ?
      ORDER BY p.started_at ASC
    `, [payload.sub, courseId]);
    
    // 计算总体进度
    const totalItems = await queryOne(env.DB,
      'SELECT COUNT(*) as count FROM course_items WHERE course_id = ? AND is_required = 1',
      [courseId]
    );
    
    const completedItems = progress.filter(p => p.status === 'completed').length;
    const progressPercent = totalItems.count > 0 
      ? Math.round((completedItems / totalItems.count) * 100) 
      : 0;
    
    return new Response(JSON.stringify({
      success: true,
      progress,
      summary: {
        total: totalItems.count,
        completed: completedItems,
        percent: progressPercent
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/students/progress - 更新学习进度
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
    
    const { itemId, courseId, status, score } = await request.json();
    
    if (!itemId || !courseId || !status) {
      return new Response(JSON.stringify({ error: "itemId, courseId, and status required" }), { status: 400 });
    }
    
    const progressId = generateId();
    const startedAt = now();
    const completedAt = status === 'completed' ? now() : null;
    
    // UPSERT 进度记录
    await execute(env.DB, `
      INSERT INTO progress (id, student_id, course_id, item_id, status, score, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, item_id) DO UPDATE SET
        status = excluded.status,
        score = excluded.score,
        completed_at = excluded.completed_at
    `, [progressId, payload.sub, courseId, itemId, status, score || null, startedAt, completedAt]);
    
    return new Response(JSON.stringify({
      success: true,
      message: "Progress updated"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
