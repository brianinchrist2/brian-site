import { hashPassword, verifyPassword, needsRehash } from "../../_utils/auth.js";
import { signJWT } from "../../_utils/jwt.js";
import { queryOne, execute } from "../../_shared/db.js";
import { rateLimit } from "../../_utils/rate-limit.js";

export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    const rl = await rateLimit(env, `signin:${clientIP}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfter) }
      });
    }
    
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB binding is missing." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    
    // 从 D1 查询用户
    const user = await queryOne(env.DB, 
      'SELECT * FROM users WHERE email = ?', 
      [cleanEmail]
    );
    
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const isValid = await verifyPassword(password, user.salt, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (needsRehash(user.password_hash)) {
      const { hash: newHash, salt: newSalt } = await hashPassword(password);
      await execute(env.DB, 'UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', [newHash, newSalt, user.id]);
    }

    // 签名 JWT
    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret) {
      return new Response(JSON.stringify({ error: "Server configuration error." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const payload = {
      sub: user.id,
      email: user.email,
      nickname: user.nickname,
      roles: JSON.parse(user.roles),
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    
    const token = await signJWT(payload, jwtSecret);

    return new Response(JSON.stringify({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        roles: JSON.parse(user.roles),
        createdAt: user.created_at
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
