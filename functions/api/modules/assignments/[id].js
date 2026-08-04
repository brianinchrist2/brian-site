import { verifyAuth, requireRole, jsonError } from "../../../_utils/requireAuth.js";
import { queryOne, execute, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const assignment = await queryOne(env.DB, `SELECT * FROM assignments WHERE id = ?`, [params.id]);
    if (!assignment) return new Response(JSON.stringify({ error: "Assignment not found" }), { status: 404 });
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
