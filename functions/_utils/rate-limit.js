export async function rateLimit(env, key, limit, windowMs) {
  if (!env.USERS_KV) return { allowed: true };

  // 放宽本地开发环境的频控限制（用 ENVIRONMENT 显式判定，不再依赖密钥字符串）
  // 注意：不能用 !env.JWT_SECRET 判定开发环境——.dev.vars 会设置 JWT_SECRET，
  //       导致本地开发的放宽永不生效（曾因此导致 e2e 注册被 3 次/小时限制阻塞）
  const isDevOrTest = env.ENVIRONMENT === 'dev';
  if (isDevOrTest) {
    limit = 10000;
  }

  const kvKey = `rl:${key}`;
  const now = Date.now();
  let data;
  try {
    const raw = await env.USERS_KV.get(kvKey);
    data = raw ? JSON.parse(raw) : { count: 0, windowStart: now };
  } catch {
    data = { count: 0, windowStart: now };
  }
  if (now - data.windowStart > windowMs) {
    data = { count: 0, windowStart: now };
  }
  data.count++;
  await env.USERS_KV.put(kvKey, JSON.stringify(data), { expirationTtl: Math.ceil(windowMs / 1000) + 60 });
  if (data.count > limit) {
    const retryAfter = Math.ceil((data.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }
  return { allowed: true };
}
