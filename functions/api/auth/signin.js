import { hashPassword } from "../../_utils/auth.js";
import { signJWT } from "../../_utils/jwt.js";
import { queryOne } from "../../_shared/db.js";

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
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

    // 验证密码
    const { hash } = await hashPassword(password, user.salt);
    if (hash !== user.password_hash) {
      return new Response(JSON.stringify({ error: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 签名 JWT
    const jwtSecret = env.JWT_SECRET || "default_jwt_secret_key_change_me_in_prod";
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
