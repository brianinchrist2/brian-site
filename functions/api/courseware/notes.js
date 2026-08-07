import { verifyAuth } from "../../_utils/requireAuth.js";
import { now } from "../../_shared/db.js";

const QUESTION_TYPES = new Set(['guided', 'exploratory', 'practical']);
const MAX_CONTENT = 20000;
const MAX_ID_LEN = 100;

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseGetQuery(url) {
  const p = new URL(url).searchParams;
  return { book: p.get('book') || '', chapter: p.get('chapter') || '' };
}

function validateInput(book, chapter, questionType, questionIndex) {
  if (!book || book.length > MAX_ID_LEN) return 'invalid book';
  if (!chapter || chapter.length > MAX_ID_LEN) return 'invalid chapter';
  if (!QUESTION_TYPES.has(questionType)) return 'invalid question_type';
  if (!Number.isInteger(questionIndex) || questionIndex < 0) return 'invalid question_index';
  return null;
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const { book, chapter } = parseGetQuery(request.url);
    if (!book || !chapter) return jsonError(400, 'book and chapter are required');

    const { results } = await env.DB.prepare(
      `SELECT question_type, question_index, content, updated_at
       FROM courseware_notes
       WHERE user_id = ? AND book_id = ? AND chapter_id = ?
       ORDER BY question_type, question_index`
    ).bind(auth.payload.sub, book, chapter).all();

    return new Response(JSON.stringify({ success: true, notes: results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return jsonError(500, 'Internal server error');
  }
}

export async function onRequestPut(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const body = await request.json();
    const { book, chapter, question_type, question_index } = body;
    const content = typeof body.content === 'string' ? body.content : '';
    if (content.length > MAX_CONTENT) return jsonError(400, 'content too long');
    const invalid = validateInput(book, chapter, question_type, question_index);
    if (invalid) return jsonError(400, invalid);

    const id = `${auth.payload.sub}_${book}_${chapter}_${question_type}_${question_index}`;
    const ts = now();
    await env.DB.prepare(
      `INSERT INTO courseware_notes (id, user_id, book_id, chapter_id, question_type, question_index, content, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, book_id, chapter_id, question_type, question_index)
       DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
    ).bind(id, auth.payload.sub, book, chapter, question_type, question_index, content, ts).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return jsonError(500, 'Internal server error');
  }
}
