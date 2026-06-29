import { verifyJWT } from "../../_utils/jwt.js";

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

    // Retrieve full info from KV if needed (like updated nicknames, etc.)
    const userJson = await env.USERS_KV.get(`user:${payload.email}`);
    if (!userJson) {
      return new Response(JSON.stringify({ error: "User not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const user = JSON.parse(userJson);
    return new Response(JSON.stringify({
      success: true,
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

    const { nickname } = await request.json();
    if (!nickname || !nickname.trim()) {
      return new Response(JSON.stringify({ error: "Nickname cannot be empty." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const userJson = await env.USERS_KV.get(`user:${payload.email}`);
    if (!userJson) {
      return new Response(JSON.stringify({ error: "User not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const user = JSON.parse(userJson);
    user.nickname = nickname.trim();
    
    // Save back to KV
    await env.USERS_KV.put(`user:${payload.email}`, JSON.stringify(user));

    return new Response(JSON.stringify({
      success: true,
      message: "Profile updated successfully.",
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
