import { describe, it, expect, vi, afterEach } from 'vitest';
import { setupTestDB } from '../../helpers/setup-db.js';
import { createMockEnv } from '../../helpers/mock-env.js';
import { onRequestPost as forgot } from '../../../functions/api/auth/forgot.js';
import { onRequestPost as reset } from '../../../functions/api/auth/reset.js';
import { verifyPassword } from '../../../functions/_utils/auth.js';

/**
 * 忘记密码 / 重置密码 API 测试
 * - D1：node:sqlite（真实 SQL）
 * - KV：内存 mock（含 _store 便于断言）
 * - 邮件：stub 全局 fetch，拦截对 Email Sending REST API 的调用
 */

const LINK_RE = /https:\/\/jiadongli\.online\/reset\.html\?token=([0-9a-f]{64})/;

function ctx(env, url, body) {
  return {
    env,
    request: new Request('https://jiadongli.online' + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: {},
  };
}

async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function seedEnv({ withEmailToken = true } = {}) {
  const db = await setupTestDB(['001_init.sql']);
  await db
    .prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','alice@example.com','Alice','pbkdf2:aa','0011','[\"student\"]')")
    .run();
  await db
    .prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u2','bob@example.com','Bob','pbkdf2:bb','2233','[\"student\"]')")
    .run();
  const env = createMockEnv({ DB: db });
  if (withEmailToken) env.CF_EMAIL_TOKEN = 'test-token';
  return { db, env };
}

function stubMail({ fail = false } = {}) {
  const calls = [];
  const fetchStub = vi.fn(async (url, opts) => {
    calls.push({ url: String(url), body: JSON.parse(opts.body), auth: opts.headers.Authorization });
    if (fail) {
      return new Response(JSON.stringify({ success: false, errors: [{ code: 10203, message: 'email.sending.error.email.sending_disabled' }] }), { status: 403 });
    }
    return new Response(JSON.stringify({ success: true, errors: [], result: { delivered: ['x'], permanent_bounces: [], queued: [] } }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchStub);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/auth/forgot', () => {
  it('缺少邮箱 → 400', async () => {
    stubMail();
    const { env } = await seedEnv();
    const res = await forgot(ctx(env, '/api/auth/forgot', {}));
    expect(res.status).toBe(400);
  });

  it('邮箱不存在 → 同样返回成功且不发信（防枚举）', async () => {
    const calls = stubMail();
    const { env } = await seedEnv();
    const res = await forgot(ctx(env, '/api/auth/forgot', { email: 'nobody@example.com' }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(calls.length).toBe(0);
    // KV 中不应有任何 reset 键
    expect([...env.USERS_KV._store.keys()].filter((k) => k.startsWith('reset')).length).toBe(0);
  });

  it('已注册邮箱 → 200，发信内容含重置链接，KV 存哈希不存明文', async () => {
    const calls = stubMail();
    const { env } = await seedEnv();
    const res = await forgot(ctx(env, '/api/auth/forgot', { email: 'Alice@Example.com ' }));
    expect(res.status).toBe(200);

    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain('/accounts/6e9339b83107a6bc144c96454092da3d/email/sending/send');
    expect(calls[0].auth).toBe('Bearer test-token');
    const mail = calls[0].body;
    expect(mail.to).toBe('alice@example.com');
    expect(mail.from).toBe('no-reply@jiadongli.online');
    expect(mail.subject).toContain('重置密码');

    const m = (mail.text + mail.html).match(LINK_RE);
    expect(m).toBeTruthy();
    const rawToken = m[1];
    const tokenHash = await sha256Hex(rawToken);

    const stored = await env.USERS_KV.get(`reset:${tokenHash}`);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored).uid).toBe('u1');
    expect(await env.USERS_KV.get('reset_uid:u1')).toBe(tokenHash);
    // 明文 token 不应出现在 KV
    expect(env.USERS_KV._store.has(`reset:${rawToken}`)).toBe(false);
  });

  it('再次请求会吊销上一次的重置链接', async () => {
    stubMail();
    const { env } = await seedEnv();
    await forgot(ctx(env, '/api/auth/forgot', { email: 'alice@example.com' }));
    const h1 = await env.USERS_KV.get('reset_uid:u1');
    expect(env.USERS_KV._store.has(`reset:${h1}`)).toBe(true);

    await forgot(ctx(env, '/api/auth/forgot', { email: 'alice@example.com' }));
    const h2 = await env.USERS_KV.get('reset_uid:u1');
    expect(h2).not.toBe(h1);
    expect(env.USERS_KV._store.has(`reset:${h1}`)).toBe(false);
    expect(env.USERS_KV._store.has(`reset:${h2}`)).toBe(true);
  });

  it('同一邮箱每小时最多 3 次 → 第 4 次 429', async () => {
    stubMail();
    const { env } = await seedEnv();
    for (let i = 0; i < 3; i++) {
      const r = await forgot(ctx(env, '/api/auth/forgot', { email: 'alice@example.com' }));
      expect(r.status).toBe(200);
    }
    const r4 = await forgot(ctx(env, '/api/auth/forgot', { email: 'alice@example.com' }));
    expect(r4.status).toBe(429);
    expect(r4.headers.get('Retry-After')).toBeTruthy();
  });

  it('邮件服务失败 → 500', async () => {
    stubMail({ fail: true });
    const { env } = await seedEnv();
    const res = await forgot(ctx(env, '/api/auth/forgot', { email: 'alice@example.com' }));
    expect(res.status).toBe(500);
  });

  it('缺少 CF_EMAIL_TOKEN 配置 → 500', async () => {
    stubMail();
    const { env } = await seedEnv({ withEmailToken: false });
    const res = await forgot(ctx(env, '/api/auth/forgot', { email: 'alice@example.com' }));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/reset', () => {
  it('令牌格式非法 → 400 TOKEN_INVALID', async () => {
    const { env } = await seedEnv();
    const res = await reset(ctx(env, '/api/auth/reset', { token: 'not-a-token', password: 'newpass123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('TOKEN_INVALID');
  });

  it('令牌不存在 → 400 TOKEN_INVALID', async () => {
    const { env } = await seedEnv();
    const res = await reset(ctx(env, '/api/auth/reset', { token: 'cd'.repeat(32), password: 'newpass123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('TOKEN_INVALID');
  });

  it('密码过短 → 400 WEAK_PASSWORD', async () => {
    const { env } = await seedEnv();
    const res = await reset(ctx(env, '/api/auth/reset', { token: 'ab'.repeat(32), password: '12345' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('WEAK_PASSWORD');
  });

  it('成功重置：密码更新为 PBKDF2、令牌一次性', async () => {
    const { db, env } = await seedEnv();
    const raw = 'ab'.repeat(32);
    const hash = await sha256Hex(raw);
    await env.USERS_KV.put(`reset:${hash}`, JSON.stringify({ uid: 'u1', email: 'alice@example.com', createdAt: Date.now() }), { expirationTtl: 3600 });
    await env.USERS_KV.put('reset_uid:u1', hash, { expirationTtl: 3600 });

    const res = await reset(ctx(env, '/api/auth/reset', { token: raw, password: 'newpass123' }));
    expect(res.status).toBe(200);
    expect((await res.json()).email).toBe('alice@example.com');

    const row = await db.prepare('SELECT password_hash, salt FROM users WHERE id = ?').bind('u1').first();
    expect(row.password_hash.startsWith('pbkdf2:')).toBe(true);
    expect(await verifyPassword('newpass123', row.salt, row.password_hash)).toBe(true);

    // 旧密码不应再通过校验
    expect(await verifyPassword('wrong-old', row.salt, row.password_hash)).toBe(false);

    // 令牌用后即删
    expect(env.USERS_KV._store.has(`reset:${hash}`)).toBe(false);
    expect(env.USERS_KV._store.has('reset_uid:u1')).toBe(false);

    // 同一令牌不能二次使用
    const res2 = await reset(ctx(env, '/api/auth/reset', { token: raw, password: 'another123' }));
    expect(res2.status).toBe(400);
    expect((await res2.json()).code).toBe('TOKEN_INVALID');

    // 其他用户不受影响
    const bob = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind('u2').first();
    expect(bob.password_hash).toBe('pbkdf2:bb');
  });

  it('令牌指向的账号不存在 → 400 TOKEN_INVALID 并清理令牌', async () => {
    const { env } = await seedEnv();
    const raw = 'ef'.repeat(32);
    const hash = await sha256Hex(raw);
    await env.USERS_KV.put(`reset:${hash}`, JSON.stringify({ uid: 'ghost', email: 'ghost@example.com' }), { expirationTtl: 3600 });
    const res = await reset(ctx(env, '/api/auth/reset', { token: raw, password: 'newpass123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('TOKEN_INVALID');
    expect(env.USERS_KV._store.has(`reset:${hash}`)).toBe(false);
  });
});
