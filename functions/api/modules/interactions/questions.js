import { verifyAuth, requireRole, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";

// GET /api/modules/interactions/questions - 获取问题列表
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const courseId = url.searchParams.get('course_id');
    const itemId = url.searchParams.get('item_id');
    const status = url.searchParams.get('status');
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    // 构建查询条件
    let whereClauses = [];
    let params = [];
    
    if (courseId) {
      whereClauses.push("q.course_id = ?");
      params.push(courseId);
    }
    
    if (itemId) {
      whereClauses.push("q.item_id = ?");
      params.push(itemId);
    }
    
    if (status) {
      whereClauses.push("q.status = ?");
      params.push(status);
    }
    
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) {
      whereClauses.push("q.course_id IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')");
      params.push(auth.payload.sub);
    }
    const whereStr = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
    const { total } = await queryOne(env.DB, `SELECT COUNT(*) as total FROM questions q ${whereStr}`, params);
    const qParams = [...params, limit, offset];
    const questions = await queryAll(env.DB, `
      SELECT 
        q.*,
        u.nickname as student_name,
        u.avatar_url as student_avatar,
        (SELECT COUNT(*) FROM question_answers qa WHERE qa.question_id = q.id) as answer_count,
        (SELECT COUNT(*) FROM question_answers qa WHERE qa.question_id = q.id AND qa.is_official = 1) as official_answer_count
      FROM questions q
      JOIN users u ON q.student_id = u.id
      ${whereStr}
      ORDER BY q.has_official ASC, q.created_at DESC
      LIMIT ? OFFSET ?
    `, qParams);
    
    return new Response(JSON.stringify({
      success: true,
      questions,
      pagination: { total, limit, offset, hasMore: total > offset + limit }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// POST /api/modules/interactions/questions - 创建问题
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
    
    const { courseId, itemId, title, body } = await request.json();
    
    if (!courseId || !title) {
      return new Response(JSON.stringify({ error: "courseId and title required" }), { status: 400 });
    }
    
    const questionId = generateId();
    const createdAt = now();
    
    await execute(env.DB, `
      INSERT INTO questions (id, student_id, course_id, item_id, title, body, status, has_official, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', 0, ?, ?)
    `, [questionId, payload.sub, courseId, itemId || null, title, body || null, createdAt, createdAt]);
    
    return new Response(JSON.stringify({
      success: true,
      question: {
        id: questionId,
        courseId,
        itemId,
        title,
        body,
        status: 'open',
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
