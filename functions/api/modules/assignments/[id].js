import { verifyAuth, requireRole, isEnrolled, canManageCourse, jsonError } from "../../../_utils/requireAuth.js";
import { queryOne, execute, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const assignment = await queryOne(env.DB, `SELECT * FROM assignments WHERE id = ?`, [params.id]);
    if (!assignment) return new Response(JSON.stringify({ error: "Assignment not found" }), { status: 404 });
    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (!isStaff && !(await isEnrolled(env.DB, auth.payload.sub, assignment.course_id))) {
      return jsonError(403, "You are not enrolled in this course");
    }
    if (isStaff && !requireRole(auth.roles, ['admin']).ok) {
      const manages = await canManageCourse(env.DB, auth.payload.sub, assignment.course_id);
      const advisesClass = await queryOne(env.DB,
        `SELECT cc.course_id FROM class_courses cc JOIN classes cl ON cl.id = cc.class_id WHERE cc.course_id = ? AND cl.advisor_id = ?`,
        [assignment.course_id, auth.payload.sub]);
      if (!manages && !advisesClass) {
        return jsonError(403, "You do not manage this course");
      }
    }
    return new Response(JSON.stringify({ success: true, assignment }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

export async function onRequestPut(context) {
  try {
    const { env, params, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const existing = await queryOne(env.DB, `SELECT id, course_id FROM assignments WHERE id = ?`, [params.id]);
    if (!existing) return jsonError(404, "Assignment not found");
    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageCourse(env.DB, auth.payload.sub, existing.course_id))) {
      return jsonError(403, "You do not manage this course");
    }
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
    const body = await request.json();
    const allowed = ['title', 'type', 'description', 'due_date', 'max_score', 'late_penalty', 'status'];
    const updates = [], values = [];
    for (const k of allowed) { if (body[k] !== undefined) { updates.push(`${k} = ?`); values.push(body[k]); } }
    if (updates.length === 0) return new Response(JSON.stringify({ error: "No fields to update" }), { status: 400 });
    values.push(params.id);
    await execute(env.DB, `UPDATE assignments SET ${updates.join(', ')} WHERE id = ?`, [...values]);
    const assignment = await queryOne(env.DB, `SELECT * FROM assignments WHERE id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true, assignment }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const existing = await queryOne(env.DB, `SELECT id, course_id FROM assignments WHERE id = ?`, [params.id]);
    if (!existing) return jsonError(404, "Assignment not found");
    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageCourse(env.DB, auth.payload.sub, existing.course_id))) {
      return jsonError(403, "You do not manage this course");
    }
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
    await execute(env.DB, `DELETE FROM assignments WHERE id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
