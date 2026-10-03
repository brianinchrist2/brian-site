import { queryOne } from "../../_shared/db.js";
import { rateLimit } from "../../_utils/rate-limit.js";

/**
 * POST /api/auth/forgot —— 忘记密码：发送重置链接邮件
 *
 * 安全要点：
 * - 防枚举：无论邮箱是否存在都返回相同的成功响应
 * - 令牌只存 SHA-256 哈希（KV），明文仅出现在邮件链接里
 * - 同一用户仅保留最新令牌（新请求即吊销旧链接）
 * - 频控：IP 5 次/小时；同一邮箱 3 次/小时
 */

const ACCOUNT_ID = "6e9339b83107a6bc144c96454092da3d";
const SEND_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/email/sending/send`;
const FROM_ADDRESS = "no-reply@jiadongli.online";
const RESET_PAGE = "https://jiadongli.online/reset.html";
const TOKEN_TTL_SECONDS = 60 * 60; // 1 小时

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

function buildEmail({ nickname, link }) {
  const hi = nickname ? `${nickname} 你好：` : "你好：";
  const html =
    '<div style="max-width:520px;margin:0 auto;padding:8px 4px;font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#2f2a22;">' +
    '<h2 style="color:#8A3517;font-size:20px;margin:0 0 16px;">重置密码</h2>' +
    `<p style="font-size:14px;line-height:1.8;margin:0 0 8px;">${hi}</p>` +
    '<p style="font-size:14px;line-height:1.8;margin:0 0 8px;">我们收到了你的密码重置请求。点击下面的按钮设置新密码（链接 1 小时内有效）：</p>' +
    `<p style="margin:20px 0;"><a href="${link}" style="display:inline-block;background:#8A3517;color:#ffffff;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:14px;">设置新密码</a></p>` +
    `<p style="font-size:12px;color:#8a8375;line-height:1.8;margin:0 0 8px;word-break:break-all;">如果按钮无法点击，请复制以下链接到浏览器打开：<br>${link}</p>` +
    '<p style="font-size:12px;color:#8a8375;line-height:1.8;margin:0 0 8px;">如果这不是你本人的操作，忽略本邮件即可，你的密码不会被更改。</p>' +
    '<p style="font-size:12px;color:#a09a8c;margin:24px 0 0;">— 有机教会 · jiadongli.online</p>' +
    "</div>";
  const text =
    `${hi}\n\n` +
    "我们收到了你的密码重置请求。请在 1 小时内打开以下链接设置新密码：\n\n" +
    `${link}\n\n` +
    "如果这不是你本人的操作，忽略本邮件即可，你的密码不会被更改。\n\n" +
    "— 有机教会 · jiadongli.online";
  return { html, text };
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    if (!env.DB || !env.USERS_KV || !env.CF_EMAIL_TOKEN) {
      return json(500, { error: "Server configuration error." });
    }

    // 频控：同一 IP 每小时最多 5 次
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipLimit = await rateLimit(env, `forgot:ip:${clientIP}`, 5, 60 * 60 * 1000);
    if (!ipLimit.allowed) {
      return json(429, { error: "Too many requests. Try again later." }, { "Retry-After": String(ipLimit.retryAfter) });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !email.includes("@")) {
      return json(400, { error: "A valid email is required." });
    }

    // 频控：同一邮箱每小时最多 3 次（防止对特定地址轰炸）
    const emailLimit = await rateLimit(env, `forgot:email:${email}`, 3, 60 * 60 * 1000);
    if (!emailLimit.allowed) {
      return json(429, { error: "Too many requests. Try again later." }, { "Retry-After": String(emailLimit.retryAfter) });
    }

    const user = await queryOne(env.DB, "SELECT id, email, nickname FROM users WHERE email = ?", [email]);
    if (!user) {
      // 防枚举：邮箱不存在也返回成功
      return json(200, { success: true });
    }

    // 生成一次性令牌；KV 只存哈希
    const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const tokenHash = await sha256Hex(rawToken);

    // 吊销该用户之前未使用的重置链接
    const prevHash = await env.USERS_KV.get(`reset_uid:${user.id}`);
    if (prevHash) await env.USERS_KV.delete(`reset:${prevHash}`);

    await env.USERS_KV.put(
      `reset:${tokenHash}`,
      JSON.stringify({ uid: user.id, email: user.email, createdAt: Date.now() }),
      { expirationTtl: TOKEN_TTL_SECONDS }
    );
    await env.USERS_KV.put(`reset_uid:${user.id}`, tokenHash, { expirationTtl: TOKEN_TTL_SECONDS });

    const link = `${RESET_PAGE}?token=${rawToken}`;
    const { html, text } = buildEmail({ nickname: user.nickname, link });

    const resp = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_EMAIL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: user.email,
        from: FROM_ADDRESS,
        subject: "【有机教会】重置密码链接",
        html,
        text,
      }),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data || !data.success) {
      const first = data && data.errors && data.errors[0] ? data.errors[0] : null;
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          error: "forgot: email send failed",
          status: resp.status,
          code: first ? first.code : null,
          message: first ? first.message : null,
        })
      );
      return json(500, { error: "Failed to send email. Please try again later." });
    }

    return json(200, { success: true });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return json(500, { error: "Internal server error" });
  }
}
