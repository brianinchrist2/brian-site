import { verifyAuth, requireRole, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const { total } = await queryOne(env.DB, `SELECT COUNT(*) as total FROM books`);
    const books = await queryAll(env.DB, `SELECT * FROM books ORDER BY created_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
    return new Response(JSON.stringify({ success: true, books, pagination: { total, limit, offset, hasMore: total > offset + limit } }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['admin']).ok) {
      return jsonError(403, "Forbidden");
    }

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    const { title, author, description, cover_url, language, source_path } = await request.json();
    if (!title) {
      return new Response(JSON.stringify({ error: "title is required" }), { status: 400 });
    }
    const id = generateId();
    await execute(env.DB, `INSERT INTO books (id, title, author, description, cover_url, language, source_path) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, title, author || null, description || null, cover_url || null, language || 'zh', source_path || null]);
    const book = await queryOne(env.DB, `SELECT * FROM books WHERE id = ?`, [id]);
    return new Response(JSON.stringify({ success: true, book }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
