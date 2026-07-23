import { verifyJWT } from "../../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId } from "../../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    const chapters = await queryAll(env.DB,
      `SELECT * FROM book_chapters WHERE book_id = ? ORDER BY sort_order, chapter_number`, [params.id]);
    return new Response(JSON.stringify({ success: true, chapters }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
    const roles = JSON.parse(user.roles || '[]');
    if (!roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
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
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
