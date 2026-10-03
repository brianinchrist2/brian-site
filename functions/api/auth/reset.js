import { hashPassword } from "../../_utils/auth.js";
import { queryOne, execute, now } from "../../_shared/db.js";
import { rateLimit } from "../../_utils/rate-limit.js";

/**
 * POST /api/auth/reset —— 凭邮件令牌设置新密码
 *
 * 令牌为 64 位十六进制（32 字节随机）；KV 仅存其 SHA-256 哈希，
 * 校验通过后立即删除（一次性），失败时返回 { code: "TOKEN_INVALID" }。
 */

const TOKEN_HEX_RE = /^[0-9a-f]{64}$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

function json(status, obj, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    if (!env.DB || !env.USERS_KV) {
      return json(500, { error: "Server configuration error." });
    }

    // 频控：同一 IP 每小时最多 10 次
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipLimit = await rateLimit(env, `reset:ip:${clientIP}`, 10, 60 * 60 * 1000);
    if (!ipLimit.allowed) {
      return json(429, { error: "Too many requests. Try again later." }, { "Retry-After": String(ipLimit.retryAfter) });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }

    const token = typeof body.token === "string" ? body.token.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!TOKEN_HEX_RE.test(token)) {
      return json(400, { error: "This reset link is invalid or has expired.", code: "TOKEN_INVALID" });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return json(400, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, code: "WEAK_PASSWORD" });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return json(400, { error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`, code: "WEAK_PASSWORD" });
    }

    const tokenHash = await sha256Hex(token);
    const raw = await env.USERS_KV.get(`reset:${tokenHash}`);
    if (!raw) {
      return json(400, { error: "This reset link is invalid or has expired.", code: "TOKEN_INVALID" });
    }

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!data || !data.uid) {
      await env.USERS_KV.delete(`reset:${tokenHash}`);
      return json(400, { error: "This reset link is invalid or has expired.", code: "TOKEN_INVALID" });
    }

    const user = await queryOne(env.DB, "SELECT id, email FROM users WHERE id = ?", [data.uid]);
    if (!user) {
      await env.USERS_KV.delete(`reset:${tokenHash}`);
      return json(400, { error: "This reset link is invalid or has expired.", code: "TOKEN_INVALID" });
    }

    const { hash, salt } = await hashPassword(password);
    await execute(env.DB, "UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?", [
      hash,
      salt,
      now(),
      user.id,
    ]);

    // 一次性：用后即删（哈希键 + 指针键）
    await env.USERS_KV.delete(`reset:${tokenHash}`);
    await env.USERS_KV.delete(`reset_uid:${user.id}`);

    return json(200, { success: true, email: user.email });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return json(500, { error: "Internal server error" });
  }
}
