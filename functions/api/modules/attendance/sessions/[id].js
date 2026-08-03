import { verifyAuth, requireRole, canManageClass, jsonError } from "../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId } from "../../../../_shared/db.js";
import { rateLimit } from "../../../../_utils/rate-limit.js";

// GET /api/modules/attendance/sessions/:id - 获取单个课时详情
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const { id } = params;

    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

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
      return jsonError(404, "Session not found");
    }

    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (!isStaff) {
      const member = await queryOne(env.DB,
        'SELECT 1 as x FROM class_members WHERE class_id = ? AND student_id = ?',
        [session.class_id, auth.payload.sub]);
      if (!member) return jsonError(403, "Forbidden");
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

    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) {
      return jsonError(403, "Teacher, advisor, or admin access required");
    }

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    const existing = await queryOne(env.DB, 'SELECT id FROM class_sessions WHERE id = ?', [id]);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
    }

    const session = await queryOne(env.DB, 'SELECT class_id FROM class_sessions WHERE id = ?', [id]);
    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageClass(env.DB, auth.payload.sub, session.class_id))) {
      return new Response(JSON.stringify({ error: "You do not manage this class" }), { status: 403 });
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

    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['admin']).ok) return jsonError(403, "Admin access required");

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
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
