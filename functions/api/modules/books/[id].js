import { verifyAuth, requireRole, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const book = await queryOne(env.DB, `SELECT * FROM books WHERE id = ?`, [params.id]);
    if (!book) {
      return new Response(JSON.stringify({ error: "Book not found" }), { status: 404 });
    }
    const chapters = await queryAll(env.DB, `SELECT * FROM book_chapters WHERE book_id = ? ORDER BY sort_order, chapter_number`, [params.id]);
    return new Response(JSON.stringify({ success: true, book, chapters }), {
      headers: { "Content-Type": "application/json" }
    });
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
    if (!requireRole(auth.roles, ['admin']).ok) {
      return jsonError(403, "Forbidden");
    }

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    const body = await request.json();
    const allowed = ['title', 'author', 'description', 'cover_url', 'language', 'status', 'source_path'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (body[key] !== undefined) { updates.push(`${key} = ?`); values.push(body[key]); }
    }
    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: "No fields to update" }), { status: 400 });
    }
    updates.push('updated_at = ?');
    values.push(now());
    values.push(params.id);
    await execute(env.DB, `UPDATE books SET ${updates.join(', ')} WHERE id = ?`, values);
    const book = await queryOne(env.DB, `SELECT * FROM books WHERE id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true, book }), {
      headers: { "Content-Type": "application/json" }
    });
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
    if (!requireRole(auth.roles, ['admin']).ok) {
      return jsonError(403, "Forbidden");
    }

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    await execute(env.DB, `DELETE FROM books WHERE id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
