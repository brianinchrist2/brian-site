import { verifyAuth, requireRole, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, execute, generateId, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

// GET /api/modules/classes/roster - 获取班级列表
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    
    const roles = auth.roles;
    
    let classes;
    
    if (roles.includes('admin') || roles.includes('advisor')) {
      // 管理员/班主任可以看到所有班级
      classes = await queryAll(env.DB, `
        SELECT c.*, u.nickname as advisor_name,
          (SELECT COUNT(*) FROM class_members WHERE class_id = c.id) as student_count
        FROM classes c
        JOIN users u ON c.advisor_id = u.id
        WHERE c.status = 'active'
        ORDER BY c.created_at DESC
      `);
    } else {
      // 学生只能看到自己所在的班级
      classes = await queryAll(env.DB, `
        SELECT c.*, u.nickname as advisor_name,
          (SELECT COUNT(*) FROM class_members WHERE class_id = c.id) as student_count
        FROM classes c
        JOIN users u ON c.advisor_id = u.id
        JOIN class_members cm ON c.id = cm.class_id
        WHERE cm.student_id = ? AND c.status = 'active'
        ORDER BY c.created_at DESC
      `, [auth.payload.sub]);
    }
    
    return new Response(JSON.stringify({
      success: true,
      classes
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// POST /api/modules/classes/roster - 创建班级（班主任/管理员）
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['advisor', 'admin']).ok) {
      return jsonError(403, "Advisor or admin access required");
    }

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    const { name, description, advisorId } = await request.json();
    
    if (!name) {
      return new Response(JSON.stringify({ error: "Name is required" }), { status: 400 });
    }
    
    const classId = generateId();
    const createdAt = now();
    const finalAdvisorId = advisorId || auth.payload.sub;
    
    await execute(env.DB, `
      INSERT INTO classes (id, name, description, advisor_id, status, created_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `, [classId, name, description || null, finalAdvisorId, createdAt]);
    
    return new Response(JSON.stringify({
      success: true,
      class: { id: classId, name }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
