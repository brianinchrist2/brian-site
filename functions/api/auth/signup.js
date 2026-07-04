import { hashPassword } from "../../_utils/auth.js";
import { queryOne, execute, generateId, now } from "../../_shared/db.js";

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB binding is missing." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { email, password, nickname } = await request.json();
    
    if (!email || !password || !nickname) {
      return new Response(JSON.stringify({ error: "Email, password, and nickname are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    
    // 检查用户是否已存在
    const existingUser = await queryOne(env.DB,
      'SELECT id FROM users WHERE email = ?',
      [cleanEmail]
    );
    
    if (existingUser) {
      return new Response(JSON.stringify({ error: "User already exists with this email." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 哈希密码
    const { hash, salt } = await hashPassword(password);
    
    const userId = generateId();
    const createdAt = now();
    
    // 插入到 D1
    await execute(env.DB, `
      INSERT INTO users (id, email, nickname, password_hash, salt, roles, created_at)
      VALUES (?, ?, ?, ?, ?, '["student"]', ?)
    `, [userId, cleanEmail, nickname.trim(), hash, salt, createdAt]);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "User registered successfully." 
    }), {
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
