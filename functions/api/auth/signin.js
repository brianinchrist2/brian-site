import { hashPassword } from "../../_utils/auth.js";
import { signJWT } from "../../_utils/jwt.js";

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    if (!env.USERS_KV) {
      return new Response(JSON.stringify({ error: "USERS_KV binding is missing." }), {
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
    const userJson = await env.USERS_KV.get(`user:${cleanEmail}`);
    if (!userJson) {
      return new Response(JSON.stringify({ error: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const user = JSON.parse(userJson);
    
    // Hash password with stored salt to verify
    const { hash } = await hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      return new Response(JSON.stringify({ error: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Sign JWT (expiring in 7 days)
    const jwtSecret = env.JWT_SECRET || "default_jwt_secret_key_change_me_in_prod";
    const payload = {
      sub: user.id,
      email: user.email,
      nickname: user.nickname,
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
        createdAt: user.createdAt
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
