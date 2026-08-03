import { verifyAuth, requireRole, jsonError } from "../../../../_utils/requireAuth.js";
import { queryAll, execute, generateId } from "../../../../_shared/db.js";
import { rateLimit } from "../../../../_utils/rate-limit.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const chapters = await queryAll(env.DB,
      `SELECT * FROM book_chapters WHERE book_id = ? ORDER BY sort_order, chapter_number`, [params.id]);
    return new Response(JSON.stringify({ success: true, chapters }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['admin']).ok) {
      return jsonError(403, "Forbidden");
    }

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    const { chapter_number, title, content_path, summary, sort_order } = await request.json();
    if (!title || !content_path) {
      return new Response(JSON.stringify({ error: "title and content_path are required" }), { status: 400 });
    }
    const id = generateId();
    await execute(env.DB,
      `INSERT INTO book_chapters (id, book_id, chapter_number, title, content_path, summary, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, params.id, chapter_number || 0, title, content_path, summary || null, sort_order || 0]);
    return new Response(JSON.stringify({ success: true, chapter_id: id }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
