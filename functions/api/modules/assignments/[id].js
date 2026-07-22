import { verifyJWT } from "../../../_utils/jwt.js";
import { queryOne, execute } from "../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    const assignment = await queryOne(env.DB, `SELECT * FROM assignments WHERE id = ?`, [params.id]);
    if (!assignment) return new Response(JSON.stringify({ error: "Assignment not found" }), { status: 404 });
    return new Response(JSON.stringify({ success: true, assignment }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}

export async function onRequestPut(context) {
  try {
    const { env, params, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    if (!payload.roles?.includes("teacher") && !payload.roles?.includes("admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const body = await request.json();
    const allowed = ['title', 'type', 'description', 'due_date', 'max_score', 'late_penalty', 'status'];
    const updates = [], values = [];
    for (const k of allowed) { if (body[k] !== undefined) { updates.push(`${k} = ?`); values.push(body[k]); } }
    if (updates.length === 0) return new Response(JSON.stringify({ error: "No fields to update" }), { status: 400 });
    values.push(params.id);
    await execute(env.DB, `UPDATE assignments SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`, values);
    const assignment = await queryOne(env.DB, `SELECT * FROM assignments WHERE id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true, assignment }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}

export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    if (!payload.roles?.includes("teacher") && !payload.roles?.includes("admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    await execute(env.DB, `DELETE FROM assignments WHERE id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
}
