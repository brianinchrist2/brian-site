import { verifyJWT } from "../../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId } from "../../../../_shared/db.js";

// GET /api/modules/attendance/sessions/:id - 获取单个课时详情
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const { id } = params;

    const session = await queryOne(env.DB, `
      SELECT cs.*, u.nickname as created_by_name, c.name as class_name,
        (SELECT COUNT(*) FROM attendance_records ar WHERE ar.class_session_id = cs.id AND ar.status = 'present') as present_count,
        (SELECT COUNT(*) FROM attendance_records ar WHERE ar.class_session_id = cs.id) as total_recorded,
        (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = cs.class_id) as total_students
      FROM class_sessions cs
      JOIN users u ON cs.created_by = u.id
      JOIN classes c ON cs.class_id = c.id
      WHERE cs.id = ?
    `, [id]);

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
    }

    const topics = await queryAll(env.DB, `
      SELECT st.*, ci.title as item_title
      FROM session_topics st
      LEFT JOIN course_items ci ON st.course_item_id = ci.id
      WHERE st.class_session_id = ?
    `, [id]);

    return new Response(JSON.stringify({ success: true, session, topics }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// PUT /api/modules/attendance/sessions/:id - 更新课时
export async function onRequestPut(context) {
  try {
    const { env, request, params } = context;
    const { id } = params;

    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }

    const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
    const roles = JSON.parse(user.roles);
    if (!roles.includes('teacher') && !roles.includes('advisor') && !roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Teacher, advisor, or admin access required" }), { status: 403 });
    }

    const existing = await queryOne(env.DB, 'SELECT id FROM class_sessions WHERE id = ?', [id]);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
    }

    const body = await request.json();
    const fields = ['title', 'description', 'session_date', 'start_time', 'end_time', 'location', 'session_type', 'meeting_url'];
    const updates = [];
    const params_list = [];

    for (const field of fields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        params_list.push(body[field]);
      }
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: "No fields to update" }), { status: 400 });
    }

    params_list.push(id);
    await execute(env.DB, `UPDATE class_sessions SET ${updates.join(', ')} WHERE id = ?`, params_list);

    return new Response(JSON.stringify({ success: true, message: "Session updated" }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// DELETE /api/modules/attendance/sessions/:id - 删除课时
export async function onRequestDelete(context) {
  try {
    const { env, request, params } = context;
    const { id } = params;

    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }

    const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
    const roles = JSON.parse(user.roles);
    if (!roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403 });
    }

    const existing = await queryOne(env.DB, 'SELECT id FROM class_sessions WHERE id = ?', [id]);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
    }

    await execute(env.DB, 'DELETE FROM class_sessions WHERE id = ?', [id]);

    return new Response(JSON.stringify({ success: true, message: "Session deleted" }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
