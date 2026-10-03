import { verifyAuth, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll } from "../../../_shared/db.js";

const BOOK_RE = /^[a-z0-9_]{1,64}$/;
const CHAPTER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PER_USER = 5000;

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    if (!env.DB) return jsonError(500, "DB binding is missing.");
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const p = new URL(request.url).searchParams;
    const book = p.get("book") || "";
    const chapter = p.get("chapter");
    if (!BOOK_RE.test(book)) return jsonError(400, "invalid book");
    if (chapter !== null && !CHAPTER_RE.test(chapter)) return jsonError(400, "invalid chapter");

    let sql = `SELECT id, book_id, chapter_id, color, quote, note, anchor, created_at, updated_at
       FROM reader_annotations
       WHERE user_id = ? AND book_id = ?`;
    const binds = [auth.payload.sub, book];
    if (chapter !== null) {
      sql += ` AND chapter_id = ?`;
      binds.push(chapter);
    }
    sql += ` AND deleted_at IS NULL ORDER BY chapter_id, pos_start, created_at LIMIT ${MAX_PER_USER}`;

    const rows = await queryAll(env.DB, sql, binds);
    const annotations = rows.map((r) => ({ ...r, anchor: JSON.parse(r.anchor) }));
    return new Response(JSON.stringify({ success: true, annotations }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
