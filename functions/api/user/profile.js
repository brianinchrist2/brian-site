import { verifyAuth, jsonError } from "../../_utils/requireAuth.js";
import { queryOne, execute, now } from "../../_shared/db.js";
import { rateLimit } from "../../_utils/rate-limit.js";

// GET profile
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    // 从 D1 查询用户
    const user = await queryOne(env.DB,
      'SELECT * FROM users WHERE email = ?',
      [auth.payload.email]
    );
    
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        roles: JSON.parse(user.roles),
        avatarUrl: user.avatar_url,
        bio: user.bio,
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

// POST to update profile
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    const { nickname, avatarUrl, bio } = await request.json();
    
    if (!nickname || !nickname.trim()) {
      return new Response(JSON.stringify({ error: "Nickname cannot be empty." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 更新用户信息
    await execute(env.DB, `
      UPDATE users 
      SET nickname = ?, avatar_url = ?, bio = ?, updated_at = ?
      WHERE email = ?
    `, [nickname.trim(), avatarUrl || null, bio || null, now(), auth.payload.email]);

    const user = await queryOne(env.DB,
      'SELECT * FROM users WHERE email = ?',
      [auth.payload.email]
    );

    return new Response(JSON.stringify({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        roles: JSON.parse(user.roles),
        avatarUrl: user.avatar_url,
        bio: user.bio,
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
