import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    const books = await queryAll(env.DB, `SELECT * FROM books ORDER BY created_at DESC`);
    return new Response(JSON.stringify({ success: true, books }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
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
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
