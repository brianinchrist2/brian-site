#!/usr/bin/env node
// 阅读器高亮笔记 API 远程验收（设计文档 §7 P1 验收 3/4、§9.5）
//
//   BASE=https://jiadongli.online \
//   TEST_EMAIL=... TEST_PASSWORD=... \
//   TEST_EMAIL_2=... TEST_PASSWORD_2=... \
//   node scripts/verify_reader_annotations.cjs
//
// 也可直接提供 TEST_TOKEN / TEST_TOKEN_2 代替邮箱+密码。
// 账号 2 用于"非本人 PUT 同 id → 404"和"换账号 GET → 0 条"；缺省时这两步标记为 SKIP。
// 测试数据用随机 UUID，结束时 DELETE 清理。任何 FAIL 退出码为 1。

const crypto = require('crypto');

const BASE = (process.env.BASE || '').replace(/\/+$/, '');
if (!BASE) {
  console.error('缺少环境变量 BASE（如 https://jiadongli.online 或 http://localhost:8789）');
  process.exit(2);
}

const BOOK = 'lordship_gospel';
const CHAPTER = '11';
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function call(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const type = res.headers.get('content-type') || '';
  const text = await res.text();
  let json = null;
  if (/json/i.test(type)) {
    try { json = JSON.parse(text); } catch (_) { /* 非法 JSON，留给断言 */ }
  }
  return { status: res.status, type, json };
}

async function signIn(email, password) {
  const r = await call('POST', '/api/auth/signin', null, { email, password });
  if (r.status !== 200 || !r.json || !r.json.token) {
    throw new Error(`登录失败 ${email}: HTTP ${r.status} ${r.type}`);
  }
  return r.json.token;
}

async function getToken(tokenVar, emailVar, passwordVar) {
  if (process.env[tokenVar]) return process.env[tokenVar];
  if (process.env[emailVar] && process.env[passwordVar]) return signIn(process.env[emailVar], process.env[passwordVar]);
  return null;
}

function uuid() {
  return crypto.randomUUID();
}

function payload(extra) {
  return {
    book: BOOK, chapter: CHAPTER, color: 'yellow',
    quote: 'verify_reader_annotations 验收标记', note: '',
    anchor: {
      v: 1, rev: 'verify', len: 1000,
      start: { block: 0, offset: 0 }, end: { block: 0, offset: 20 },
      pos: { start: 0, end: 20 }, prefix: '', suffix: '',
      heading: { id: 'h1-verify', text: 'verify', tag: 'h2' },
    },
    ...extra,
  };
}

async function expectStatus(name, promise, status) {
  const r = await promise;
  record(name, r.status === status && /json/i.test(r.type), `HTTP ${r.status} ${r.type}（期望 ${status} 且为 JSON）`);
  return r;
}

(async () => {
  const token1 = await getToken('TEST_TOKEN', 'TEST_EMAIL', 'TEST_PASSWORD');
  if (!token1) {
    console.error('缺少测试账号：设置 TEST_EMAIL + TEST_PASSWORD（或 TEST_TOKEN）');
    process.exit(2);
  }
  const token2 = await getToken('TEST_TOKEN_2', 'TEST_EMAIL_2', 'TEST_PASSWORD_2');

  const id = uuid();
  const path = `/api/reader/annotations/${id}`;
  const listPath = `/api/reader/annotations?book=${BOOK}&chapter=${CHAPTER}`;

  try {
    // 路由必须命中 Functions（返回 JSON 而非 SPA HTML）：证明 _routes.json 匹配多段路径
    await expectStatus('未带 token GET → 401 JSON', call('GET', listPath), 401);
    await expectStatus('未登录 DELETE 多段路径 → 401 JSON（路由已部署）', call('DELETE', path), 401);

    await expectStatus('PUT 新 id → 201', call('PUT', path, token1, payload()), 201);
    const second = await expectStatus('同 id 再 PUT → 200', call('PUT', path, token1, payload({ note: 'v2' })), 200);
    record('覆盖后笔记已更新', !!second.json && second.json.annotation && second.json.annotation.note === 'v2');

    const list = await expectStatus('GET 本章 → 200', call('GET', listPath, token1), 200);
    const mine = list.json && Array.isArray(list.json.annotations) ? list.json.annotations.filter(a => a.id === id) : [];
    record('GET 本章包含该条且仅 1 条', mine.length === 1 && mine[0].note === 'v2');

    if (token2) {
      await expectStatus('他人 PUT 同 id → 404', call('PUT', path, token2, payload()), 404);
      await expectStatus('他人 DELETE 同 id → 404', call('DELETE', path, token2), 404);
      const other = await expectStatus('他人 GET 本章 → 200', call('GET', listPath, token2), 200);
      const leaked = other.json && Array.isArray(other.json.annotations) ? other.json.annotations.filter(a => a.id === id) : [null];
      record('他人 GET 不含该条（0 条）', leaked.length === 0);
    } else {
      record('他人 PUT / DELETE / GET 隔离（需 TEST_EMAIL_2 + TEST_PASSWORD_2）', null, '未提供第二个账号');
    }

    await expectStatus('DELETE → 200', call('DELETE', path, token1), 200);
    await expectStatus('再 DELETE → 200（幂等）', call('DELETE', path, token1), 200);
    await expectStatus('PUT 已删 id → 410', call('PUT', path, token1, payload()), 410);
    const after = await expectStatus('删除后 GET 本章 → 200', call('GET', listPath, token1), 200);
    const left = after.json && Array.isArray(after.json.annotations) ? after.json.annotations.filter(a => a.id === id) : [null];
    record('删除后 GET 不再返回该条', left.length === 0);
  } catch (err) {
    record('脚本执行', false, err.message);
  } finally {
    // 软删除墓碑，幂等；失败不影响退出码判定
    try { await call('DELETE', path, token1); } catch (_) { /* ignore */ }
  }

  const failed = results.filter(r => r.ok === false).length;
  const skipped = results.filter(r => r.ok === null).length;
  console.log(`\n${results.length - failed - skipped} PASS, ${failed} FAIL, ${skipped} SKIP`);
  process.exit(failed ? 1 : 0);
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
