import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute } from "../../../_shared/db.js";

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
    const book = await queryOne(env.DB, `SELECT * FROM books WHERE id = ?`, [params.id]);
    if (!book) {
      return new Response(JSON.stringify({ error: "Book not found" }), { status: 404 });
    }
    const chapters = await queryAll(env.DB, `SELECT * FROM book_chapters WHERE book_id = ? ORDER BY sort_order, chapter_number`, [params.id]);
    return new Response(JSON.stringify({ success: true, book, chapters }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPut(context) {
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
    if (!payload.roles?.includes("admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
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
    values.push(params.id);
    await execute(env.DB, `UPDATE books SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`, values);
    const book = await queryOne(env.DB, `SELECT * FROM books WHERE id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true, book }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
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
    if (!payload.roles?.includes("admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    await execute(env.DB, `DELETE FROM books WHERE id = ?`, [params.id]);
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
