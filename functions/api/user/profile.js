import { verifyJWT } from "../../_utils/jwt.js";
import { queryOne, execute } from "../../_shared/db.js";

// GET profile
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized. Missing token." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = env.JWT_SECRET || "default_jwt_secret_key_change_me_in_prod";
    
    const payload = await verifyJWT(token, jwtSecret);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Unauthorized. Invalid or expired token." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 从 D1 查询用户
    const user = await queryOne(env.DB,
      'SELECT * FROM users WHERE email = ?',
      [payload.email]
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// POST to update profile
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = env.JWT_SECRET || "default_jwt_secret_key_change_me_in_prod";
    
    const payload = await verifyJWT(token, jwtSecret);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
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
      SET nickname = ?, avatar_url = ?, bio = ?, updated_at = datetime('now')
      WHERE email = ?
    `, [nickname.trim(), avatarUrl || null, bio || null, payload.email]);

    const user = await queryOne(env.DB,
      'SELECT * FROM users WHERE email = ?',
      [payload.email]
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
