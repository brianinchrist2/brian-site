/**
 * 用户数据迁移脚本：KV → D1
 * 
 * 使用方法：
 * 1. 确保 wrangler.toml 中已配置 USERS_KV 和 DB
 * 2. 部署后访问: https://organicchurch.dpdns.org/api/admin/migrate-users
 * 3. 或者本地运行: npx wrangler pages dev，然后访问 http://localhost:8788/api/admin/migrate-users
 */

import { verifyJWT } from "../../_utils/jwt.js";
import { queryOne } from "../../_shared/db.js";

export async function onRequestPost(context) {
  const { env, request } = context;

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]);
  const roles = JSON.parse(user.roles || '[]');
  if (!roles.includes('admin')) {
    return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  
  if (!env.USERS_KV) {
    return new Response(JSON.stringify({ error: "USERS_KV binding missing" }), { status: 500 });
  }
  
  if (!env.DB) {
    return new Response(JSON.stringify({ error: "DB binding missing" }), { status: 500 });
  }
  
  try {
    // 列出所有用户
    const { keys } = await env.USERS_KV.list({ prefix: 'user:' });
    
    const results = {
      total: keys.length,
      migrated: 0,
      skipped: 0,
      errors: []
    };
    
    for (const key of keys) {
      try {
        const userJson = await env.USERS_KV.get(key.name);
        if (!userJson) {
          results.skipped++;
          continue;
        }
        
        const user = JSON.parse(userJson);
        
        // 检查是否已存在
        const existing = await env.DB.prepare(
          'SELECT id FROM users WHERE id = ? OR email = ?'
        ).bind(user.id, user.email).first();
        
        if (existing) {
          results.skipped++;
          continue;
        }
        
        // 插入到 D1
        await env.DB.prepare(`
          INSERT INTO users (id, email, nickname, password_hash, salt, roles, created_at)
          VALUES (?, ?, ?, ?, ?, '["student"]', ?)
        `).bind(
          user.id,
          user.email,
          user.nickname,
          user.passwordHash,
          user.salt,
          user.createdAt || new Date().toISOString()
        ).run();
        
        results.migrated++;
      } catch (err) {
        results.errors.push({ key: key.name, error: err.message });
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: "Migration completed",
      results
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
