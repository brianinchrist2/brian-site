import { verifyAuth, jsonError } from "../../../_utils/requireAuth.js";
import { queryOne, execute, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOOK_RE = /^[a-z0-9_]{1,64}$/;
const CHAPTER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const COLORS = new Set(["yellow", "green", "blue", "pink", "purple", "none"]);
const MAX_QUOTE = 5000;
const MAX_NOTE = 20000;
const MAX_ANCHOR_BYTES = 4096;
const MAX_CONTEXT = 64;
const MAX_PER_USER = 5000;

function json(status, body, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

async function guard(context) {
  const { env, request } = context;
  if (!env.DB) return { res: jsonError(500, "DB binding is missing.") };
  const auth = await verifyAuth(env.DB, request, env);
  if (!auth.ok) return { res: jsonError(auth.status, auth.error) };
  const rl = await rateLimit(env, "w:" + auth.payload.sub, 60, 60000);
  if (!rl.allowed) {
    return { res: json(429, { error: "Too many requests" }, { "Retry-After": String(rl.retryAfter || 60) }) };
  }
  return { sub: auth.payload.sub };
}

function isPos(n) {
  return Number.isInteger(n) && n >= 0;
}

function isPoint(pt) {
  return !!pt && typeof pt === "object" && isPos(pt.block) && isPos(pt.offset);
}

function validateAnchor(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return "invalid anchor";
  if (a.v !== 1) return "invalid anchor";
  if (!isPoint(a.start) || !isPoint(a.end)) return "invalid anchor";
  if (!a.pos || !isPos(a.pos.start) || !isPos(a.pos.end) || a.pos.end <= a.pos.start) return "invalid anchor";
  for (const k of ["prefix", "suffix"]) {
    if (typeof a[k] !== "string" || a[k].length > MAX_CONTEXT) return "invalid anchor";
  }
  if (new TextEncoder().encode(JSON.stringify(a)).length > MAX_ANCHOR_BYTES) return "anchor too large";
  return null;
}

function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "invalid body" };
  if (typeof body.book !== "string" || !BOOK_RE.test(body.book)) return { error: "invalid book" };
  if (typeof body.chapter !== "string" || !CHAPTER_RE.test(body.chapter)) return { error: "invalid chapter" };
  if (!COLORS.has(body.color)) return { error: "invalid color" };
  if (typeof body.quote !== "string" || body.quote.length < 1 || body.quote.length > MAX_QUOTE) {
    return { error: "invalid quote" };
  }
  const note = body.note === undefined ? "" : body.note;
  if (typeof note !== "string") return { error: "invalid note" };
  if (note.length > MAX_NOTE) return { error: "note too long" };
  const anchorError = validateAnchor(body.anchor);
  if (anchorError) return { error: anchorError };
  return {
    value: { book: body.book, chapter: body.chapter, color: body.color, quote: body.quote, note, anchor: body.anchor },
  };
}

export async function onRequestPut(context) {
  try {
    const { env, request, params } = context;
    const g = await guard(context);
    if (g.res) return g.res;
    const sub = g.sub;

    if (!ID_RE.test(params.id || "")) return jsonError(400, "invalid id");
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "invalid body");
    }
    const v = validateBody(body);
    if (v.error) return jsonError(400, v.error);
    const { book, chapter, color, quote, note, anchor } = v.value;
    const anchorJson = JSON.stringify(anchor);
    const ts = now();
    const annotation = (createdAt) => ({
      id: params.id, book_id: book, chapter_id: chapter, color, quote, note, anchor,
      created_at: createdAt, updated_at: ts,
    });

    const existing = await queryOne(
      env.DB,
      `SELECT user_id, book_id, chapter_id, created_at, deleted_at FROM reader_annotations WHERE id = ?`,
      [params.id]
    );

    if (!existing) {
      const count = await queryOne(
        env.DB,
        `SELECT COUNT(*) AS n FROM reader_annotations WHERE user_id = ? AND deleted_at IS NULL`,
        [sub]
      );
      if (count.n >= MAX_PER_USER) return jsonError(403, "annotation quota exceeded");
      try {
        await execute(
          env.DB,
          `INSERT INTO reader_annotations
             (id, user_id, book_id, chapter_id, color, quote, note, anchor, pos_start, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [params.id, sub, book, chapter, color, quote, note, anchorJson, anchor.pos.start, ts, ts]
        );
      } catch (err) {
        if (/UNIQUE constraint failed/i.test(err.message)) return jsonError(409, "conflict, retry");
        throw err;
      }
      return json(201, { success: true, annotation: annotation(ts) });
    }

    if (existing.user_id !== sub) return jsonError(404, "Not found");
    if (existing.deleted_at) return jsonError(410, "Gone");
    if (existing.book_id !== book || existing.chapter_id !== chapter) {
      return jsonError(400, "book/chapter mismatch");
    }

    await execute(
      env.DB,
      `UPDATE reader_annotations
       SET color = ?, quote = ?, note = ?, anchor = ?, pos_start = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [color, quote, note, anchorJson, anchor.pos.start, ts, params.id, sub]
    );
    return json(200, { success: true, annotation: annotation(existing.created_at) });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}

export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const g = await guard(context);
    if (g.res) return g.res;
    const sub = g.sub;

    if (!ID_RE.test(params.id || "")) return jsonError(400, "invalid id");
    const existing = await queryOne(
      env.DB,
      `SELECT user_id, deleted_at FROM reader_annotations WHERE id = ?`,
      [params.id]
    );
    if (!existing || existing.user_id !== sub) return jsonError(404, "Not found");
    if (!existing.deleted_at) {
      const ts = now();
      await execute(
        env.DB,
        `UPDATE reader_annotations SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        [ts, ts, params.id, sub]
      );
    }
    return json(200, { success: true });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
