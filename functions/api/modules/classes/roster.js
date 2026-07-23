import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/classes/roster - 获取班级列表
export async function onRequestGet(context) {
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
    
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    
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
      `, [payload.sub]);
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
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    if (!roles.includes('advisor') && !roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Advisor or admin access required" }), { status: 403 });
    }
    
    const { name, description, advisorId } = await request.json();
    
    if (!name) {
      return new Response(JSON.stringify({ error: "Name is required" }), { status: 400 });
    }
    
    const classId = generateId();
    const createdAt = now();
    const finalAdvisorId = advisorId || payload.sub;
    
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
