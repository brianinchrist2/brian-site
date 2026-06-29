import { hashPassword } from "../../_utils/auth.js";

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    if (!env.USERS_KV) {
      return new Response(JSON.stringify({ error: "USERS_KV binding is missing." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { email, password, nickname } = await request.json();
    
    // Basic validation
    if (!email || !password || !nickname) {
      return new Response(JSON.stringify({ error: "Email, password, and nickname are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    
    // Check if user already exists
    const existingUser = await env.USERS_KV.get(`user:${cleanEmail}`);
    if (existingUser) {
      return new Response(JSON.stringify({ error: "User already exists with this email." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Hash password
    const { hash, salt } = await hashPassword(password);
    
    const userId = crypto.randomUUID();
    const newUser = {
      id: userId,
      email: cleanEmail,
      nickname: nickname.trim(),
      passwordHash: hash,
      salt: salt,
      createdAt: new Date().toISOString()
    };

    // Store in KV
    await env.USERS_KV.put(`user:${cleanEmail}`, JSON.stringify(newUser));

    return new Response(JSON.stringify({ success: true, message: "User registered successfully." }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
