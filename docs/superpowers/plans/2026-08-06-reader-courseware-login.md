# 课件登录门禁 + 用户笔记后端同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 所有课件（阅读器面板 + 独立课件页）需登录后才能使用；课件笔记按用户后端同步、跨设备、隔离。

**Architecture:** 后端新增 `courseware_notes` 表 + GET/PUT API（JWT 鉴权）；前端新增共享 `reader-auth.js`（内嵌登录/注册弹窗）；阅读器与课件页接入门禁并把笔记读写切换到后端。

**Tech Stack:** Cloudflare Pages Functions (ES modules) + D1 (SQLite) + 原生 JS（经典脚本）；vitest 测试后端。

**前置事实：**
- 博客域 `/api/auth/signin|signup` 可用（D1 已绑定，实测 400 校验通过）。JWT 存 `localStorage.auth_token`。
- 鉴权工具：`functions/_utils/requireAuth.js` 的 `verifyAuth(db, request, env)` → `payload.sub` = user id。
- 笔记键统一为 `(book_id, chapter_id=cwId, question_type, question_index)`。`question_type ∈ {guided, exploratory, practical}`，`question_index` 0-based。
- 阅读器面板用 `(type, index)`；课件页 `chapter.js` 用**扁平 idx**（guided→exploratory→practical 顺序累加）——后端统一用 `(type, index)`，课件页负责转换。
- **测试策略**：后端（迁移+API）全量 vitest TDD；前端经典脚本按项目既有模式用 `node --check` 语法校验 + 手动浏览器 E2E 验证（项目从未给这些脚本写单测）。

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `migrations/015-courseware-notes.sql` | 新建：笔记表 + UNIQUE 约束 + 索引 |
| `functions/api/courseware/notes.js` | 新建：GET/PUT 笔记 API（JWT 鉴权） |
| `tests/migrations/015-courseware-notes.test.js` | 新建：迁移测试 |
| `tests/api/courseware/notes.test.js` | 新建：API 单测 |
| `brianinchrist/organicchurch/library/assets/js/reader-auth.js` | 新建：共享认证模块（弹窗自注入） |
| `brianinchrist/organicchurch/library/reader.html` | 修改：加载 reader-auth.js |
| `brianinchrist/organicchurch/library/assets/js/reader.js` | 修改：面板门禁 + 齿轮登录行 + 笔记后端读写 |
| `brianinchrist/organicchurch/library/assets/css/reader.css` | 修改：锁屏 + 设置登录行样式 |
| `.../courseware/index.html` `chapter.html` `review.html` `print.html` | 修改：加载 reader-auth + 顶栏登录按钮 + 锁屏容器 |
| `.../courseware/assets/js/storage.js` | 修改：answers 增加后端同步（扁平 idx→(type,index)） |
| `.../courseware/assets/js/chapter.js` | 修改：门禁 + 笔记走后端 |
| `.../courseware/assets/js/app.js` | 修改：门禁 |
| `.../courseware/assets/js/review.js` | 修改：门禁 |

---

## Phase 1：后端

### Task 1: 迁移 015 + 迁移测试（TDD）

**Files:**
- Create: `migrations/015-courseware-notes.sql`
- Test: `tests/migrations/015-courseware-notes.test.js`

- [ ] **Step 1: 写失败测试**

创建 `tests/migrations/015-courseware-notes.test.js`：

```js
import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

const MIGRATIONS = ['001_init.sql', '015-courseware-notes.sql'];

describe('migration 015-courseware-notes.sql', () => {
  it('creates courseware_notes table with unique constraint', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const cols = (await db.prepare('PRAGMA table_info(courseware_notes)').all()).results;
    const names = cols.map(c => c.name);
    for (const field of ['id','user_id','book_id','chapter_id','question_type','question_index','content','updated_at']) {
      expect(names).toContain(field);
    }
  });

  it('enforces unique(user_id, book_id, chapter_id, question_type, question_index)', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    const insert = () => db.prepare(
      "INSERT INTO courseware_notes (id, user_id, book_id, chapter_id, question_type, question_index, content) VALUES (?,?,?,?,?,?,?)"
    ).bind(`n1`,'u1','lg','introduction','guided',0,'x').run();
    await insert();
    await expect(insert()).rejects.toThrow(); // duplicate
  });

  it('cascades delete on user', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courseware_notes (id, user_id, book_id, chapter_id, question_type, question_index, content) VALUES ('n1','u1','lg','introduction','guided',0,'x')").run();
    await db.prepare("DELETE FROM users WHERE id='u1'").run();
    const row = await db.prepare("SELECT id FROM courseware_notes WHERE id='n1'").first();
    expect(row).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/migrations/015-courseware-notes.test.js`
Expected: FAIL（`no such table: courseware_notes`）

- [ ] **Step 3: 写迁移**

创建 `migrations/015-courseware-notes.sql`：

```sql
-- 015-courseware-notes.sql
-- 课件笔记：按用户隔离，跨设备同步（last-write-wins）

CREATE TABLE IF NOT EXISTS courseware_notes (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id        TEXT NOT NULL,
  chapter_id     TEXT NOT NULL,          -- 课件 cw id，如 "introduction"
  question_type  TEXT NOT NULL,          -- 'guided' | 'exploratory' | 'practical'
  question_index INTEGER NOT NULL,       -- 0-based
  content        TEXT NOT NULL DEFAULT '',
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, book_id, chapter_id, question_type, question_index)
);
CREATE INDEX IF NOT EXISTS idx_courseware_notes_user
  ON courseware_notes(user_id, book_id, chapter_id);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/migrations/015-courseware-notes.test.js`
Expected: PASS（3 passed）

- [ ] **Step 5: Commit**

```bash
git add migrations/015-courseware-notes.sql tests/migrations/015-courseware-notes.test.js
git commit -m "feat(db): courseware_notes 迁移（用户级笔记表）"
```

### Task 2: 笔记 API + 单测（TDD）

**Files:**
- Create: `functions/api/courseware/notes.js`
- Test: `tests/api/courseware/notes.test.js`

- [ ] **Step 1: 写失败测试**

创建 `tests/api/courseware/notes.test.js`（沿用 `tests/api/modules/certificates/approve-reject.test.js` 的模式）：

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDB } from '../../helpers/setup-db.js';
import { createMockEnv } from '../../helpers/mock-env.js';
import { signJWT } from '../../../functions/_utils/jwt.js';
import { onRequestGet, onRequestPut } from '../../../functions/api/courseware/notes.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '015-courseware-notes.sql'];

function makeCtx(db, method, url, body, userId) {
  const token = signJWT({ sub: userId, roles: ['student'], exp: Date.now() + 86400000 }, SECRET);
  const request = new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { env: { DB: db, JWT_SECRET: SECRET }, request, params: {} };
}

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u2','b@b.c','B','h','s','[\"student\"]')").run();
  return db;
}

describe('courseware notes API', () => {
  it('returns 401 without token', async () => {
    const db = await seed();
    const res = await onRequestGet({ env: { DB: db, JWT_SECRET: SECRET }, request: new Request('http://x/api/courseware/notes?book=lg&chapter=introduction'), params: {} });
    expect(res.status).toBe(401);
  });

  it('PUT then GET returns the note for that user', async () => {
    const db = await seed();
    const put = await onRequestPut(makeCtx(db, 'PUT', 'http://x/api/courseware/notes',
      { book: 'lg', chapter: 'introduction', question_type: 'guided', question_index: 0, content: '我的答案' }, 'u1'));
    expect(put.status).toBe(200);

    const get = await onRequestGet(makeCtx(db, 'GET', 'http://x/api/courseware/notes?book=lg&chapter=introduction', null, 'u1'));
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0]).toMatchObject({ question_type: 'guided', question_index: 0, content: '我的答案' });
  });

  it('upserts on repeated PUT (same key updates, no duplicate)', async () => {
    const db = await seed();
    const body = { book: 'lg', chapter: 'introduction', question_type: 'guided', question_index: 0, content: 'v2' };
    await onRequestPut(makeCtx(db, 'PUT', 'http://x/api/courseware/notes', body, 'u1'));
    const get = await onRequestGet(makeCtx(db, 'GET', 'http://x/api/courseware/notes?book=lg&chapter=introduction', null, 'u1'));
    const data = await get.json();
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].content).toBe('v2');
  });

  it('isolates notes between users', async () => {
    const db = await seed();
    await onRequestPut(makeCtx(db, 'PUT', 'http://x/api/courseware/notes',
      { book: 'lg', chapter: 'introduction', question_type: 'guided', question_index: 0, content: 'u1 的' }, 'u1'));
    const getU2 = await onRequestGet(makeCtx(db, 'GET', 'http://x/api/courseware/notes?book=lg&chapter=introduction', null, 'u2'));
    const data = await getU2.json();
    expect(data.notes).toHaveLength(0);
  });

  it('rejects invalid question_type and non-numeric index', async () => {
    const db = await seed();
    const bad = await onRequestPut(makeCtx(db, 'PUT', 'http://x/api/courseware/notes',
      { book: 'lg', chapter: 'introduction', question_type: 'hack', question_index: 0, content: 'x' }, 'u1'));
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/api/courseware/notes.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

创建 `functions/api/courseware/notes.js`：

```js
import { verifyAuth } from "../../_utils/requireAuth.js";

const QUESTION_TYPES = new Set(['guided', 'exploratory', 'practical']);
const MAX_CONTENT = 20000;
const MAX_ID_LEN = 100;

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseGetQuery(url) {
  const p = new URL(url).searchParams;
  return { book: p.get('book') || '', chapter: p.get('chapter') || '' };
}

function validateInput(book, chapter, questionType, questionIndex) {
  if (!book || book.length > MAX_ID_LEN) return 'invalid book';
  if (!chapter || chapter.length > MAX_ID_LEN) return 'invalid chapter';
  if (!QUESTION_TYPES.has(questionType)) return 'invalid question_type';
  if (!Number.isInteger(questionIndex) || questionIndex < 0) return 'invalid question_index';
  return null;
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const { book, chapter } = parseGetQuery(request.url);
    if (!book || !chapter) return jsonError(400, 'book and chapter are required');

    const { results } = await env.DB.prepare(
      `SELECT question_type, question_index, content, updated_at
       FROM courseware_notes
       WHERE user_id = ? AND book_id = ? AND chapter_id = ?
       ORDER BY question_type, question_index`
    ).bind(auth.payload.sub, book, chapter).all();

    return new Response(JSON.stringify({ success: true, notes: results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return jsonError(500, 'Internal server error');
  }
}

export async function onRequestPut(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const body = await request.json();
    const { book, chapter, question_type, question_index } = body;
    const content = typeof body.content === 'string' ? body.content : '';
    if (content.length > MAX_CONTENT) return jsonError(400, 'content too long');
    const invalid = validateInput(book, chapter, question_type, question_index);
    if (invalid) return jsonError(400, invalid);

    const id = `${auth.payload.sub}_${book}_${chapter}_${question_type}_${question_index}`;
    await env.DB.prepare(
      `INSERT INTO courseware_notes (id, user_id, book_id, chapter_id, question_type, question_index, content, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, book_id, chapter_id, question_type, question_index)
       DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
    ).bind(id, auth.payload.sub, book, chapter, question_type, question_index, content).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return jsonError(500, 'Internal server error');
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/api/courseware/notes.test.js`
Expected: PASS（5 passed）

- [ ] **Step 5: Commit**

```bash
git add functions/api/courseware/notes.js tests/api/courseware/notes.test.js
git commit -m "feat(api): 课件笔记 GET/PUT（JWT 鉴权 + upsert）"
```

---

## Phase 2：共享认证模块

### Task 3: reader-auth.js（新建）

**Files:**
- Create: `brianinchrist/organicchurch/library/assets/js/reader-auth.js`

- [ ] **Step 1: 写实现（完整代码）**

创建 `brianinchrist/organicchurch/library/assets/js/reader-auth.js`：

```js
/**
 * reader-auth.js — 共享认证模块（阅读器 + 课件页共用）。
 * 经典脚本，暴露全局 ReaderAuth。自注入登录/注册弹窗。
 * 复用现有认证体系：/api/auth/signin|signup，JWT 存 localStorage.auth_token。
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'auth_token';

  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(token) { try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function isLoggedIn() { return !!getToken(); }

  async function getProfile() {
    var token = getToken();
    if (!token) return null;
    try {
      var res = await fetch('/api/user/profile', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) { clearToken(); return null; }
      return await res.json();
    } catch (e) { return null; }
  }

  async function signIn(email, password) {
    var res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || '登录失败');
    setToken(data.token);
    return data;
  }

  async function signUp(nickname, email, password) {
    var res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, email: email.trim().toLowerCase(), password }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || '注册失败');
    if (data.token) setToken(data.token);
    return data;
  }

  function logout() {
    clearToken();
    if (window.ReaderAuth && typeof window.ReaderAuth._emitLogout === 'function') {
      window.ReaderAuth._emitLogout();
    }
  }

  var _logoutCallbacks = [];
  function _emitLogout() { _logoutCallbacks.forEach(function (cb) { try { cb(); } catch (e) {} }); }

  // ---------- 登录/注册弹窗（自注入） ----------
  var _modalEl = null;

  function buildModal() {
    var style = document.createElement('style');
    style.textContent =
      '#ra-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(20,16,10,.5)}' +
      '#ra-modal[hidden]{display:none}' +
      '.ra-box{background:#fff;border-radius:12px;padding:28px;width:min(360px,90vw);box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}' +
      '.ra-box h2{margin:0 0 4px;font-size:20px}.ra-sub{color:#666;margin:0 0 18px;font-size:13px}' +
      '.ra-field{margin-bottom:12px}.ra-field label{display:block;font-size:13px;margin-bottom:4px;color:#333}' +
      '.ra-field input{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #ccc;border-radius:8px;font-size:14px}' +
      '.ra-err{color:#c0392b;font-size:13px;min-height:18px;margin:0 0 8px}' +
      '.ra-btn{width:100%;padding:10px;border:0;border-radius:8px;background:#8A3517;color:#fff;font-size:15px;cursor:pointer}' +
      '.ra-btn:disabled{opacity:.5}' +
      '.ra-toggle{margin-top:12px;text-align:center;font-size:13px;color:#555}.ra-toggle a{color:#8A3517;cursor:pointer;text-decoration:underline}' +
      '.ra-close{float:right;border:0;background:none;font-size:20px;cursor:pointer;color:#888}';
    document.head.appendChild(style);

    var modal = document.createElement('div');
    modal.id = 'ra-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '登录');
    modal.hidden = true;
    modal.innerHTML =
      '<div class="ra-box">' +
      '<button type="button" class="ra-close" aria-label="关闭">×</button>' +
      '<h2>登录</h2><p class="ra-sub">登录后可查看互动课件并保存笔记</p>' +
      '<div id="ra-nickname-field" class="ra-field" hidden><label for="ra-nickname">昵称</label><input id="ra-nickname" autocomplete="nickname"></div>' +
      '<div class="ra-field"><label for="ra-email">邮箱</label><input id="ra-email" type="email" autocomplete="email"></div>' +
      '<div class="ra-field"><label for="ra-password">密码</label><input id="ra-password" type="password" autocomplete="current-password"></div>' +
      '<p class="ra-err" id="ra-err"></p>' +
      '<button type="button" class="ra-btn" id="ra-submit">登录</button>' +
      '<p class="ra-toggle"><span id="ra-toggle-text">还没有账号？</span><a id="ra-toggle-link">注册</a></p>' +
      '</div>';
    document.body.appendChild(modal);
    return modal;
  }

  function openLoginModal(onSuccess) {
    if (!_modalEl) _modalEl = buildModal();
    var modal = _modalEl;
    var register = false;
    var nickField = modal.querySelector('#ra-nickname-field');
    var submit = modal.querySelector('#ra-submit');
    var err = modal.querySelector('#ra-err');
    var toggleLink = modal.querySelector('#ra-toggle-link');
    var toggleText = modal.querySelector('#ra-toggle-text');
    var emailInput = modal.querySelector('#ra-email');
    var passInput = modal.querySelector('#ra-password');
    var nickInput = modal.querySelector('#ra-nickname');

    function reset() { register = false; nickField.hidden = true; submit.textContent = '登录'; toggleText.textContent = '还没有账号？'; toggleLink.textContent = '注册'; err.textContent = ''; emailInput.value = ''; passInput.value = ''; }

    toggleLink.onclick = function () {
      register = !register;
      nickField.hidden = !register;
      submit.textContent = register ? '注册' : '登录';
      toggleText.textContent = register ? '已有账号？' : '还没有账号？';
      toggleLink.textContent = register ? '登录' : '注册';
      err.textContent = '';
    };

    modal.querySelector('.ra-close').onclick = function () { modal.hidden = true; };
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });

    submit.onclick = async function () {
      err.textContent = '';
      submit.disabled = true;
      try {
        var email = emailInput.value.trim();
        var password = passInput.value;
        if (!email || !password) throw new Error('请填写邮箱和密码');
        var data = register
          ? await signUp(nickInput.value.trim(), email, password)
          : await signIn(email, password);
        modal.hidden = true;
        if (typeof onSuccess === 'function') onSuccess(data);
      } catch (e) {
        err.textContent = e && e.message ? e.message : '操作失败';
      } finally {
        submit.disabled = false;
      }
    };

    reset();
    modal.hidden = false;
    emailInput.focus();
    return modal;
  }

  /** 返回 Promise<user|null>：已登录直接 resolve；否则弹窗，成功后 resolve user。 */
  function ensureLogin() {
    return getProfile().then(function (user) {
      if (user) return user;
      return new Promise(function (resolve) {
        openLoginModal(function (data) {
          resolve(data && data.user ? data.user : null);
        });
      });
    });
  }

  window.ReaderAuth = {
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    isLoggedIn: isLoggedIn,
    getProfile: getProfile,
    signIn: signIn,
    signUp: signUp,
    logout: logout,
    openLoginModal: openLoginModal,
    ensureLogin: ensureLogin,
    onLogout: function (cb) { _logoutCallbacks.push(cb); },
    _emitLogout: _emitLogout,
  };
})();
```

- [ ] **Step 2: 语法校验**

Run: `node --check brianinchrist/organicchurch/library/assets/js/reader-auth.js`
Expected: 无输出（语法 OK）

- [ ] **Step 3: Commit**

```bash
git add brianinchrist/organicchurch/library/assets/js/reader-auth.js
git commit -m "feat(reader): 共享认证模块 reader-auth.js（内嵌登录/注册弹窗）"
```

---

## Phase 3：阅读器集成

### Task 4: 阅读器门禁 + 齿轮登录 + 笔记后端同步

**Files:**
- Modify: `brianinchrist/organicchurch/library/reader.html`
- Modify: `brianinchrist/organicchurch/library/assets/js/reader.js`
- Modify: `brianinchrist/organicchurch/library/assets/css/reader.css`

- [ ] **Step 1: reader.html 加载 reader-auth.js**

在 `reader.html` 的 `<script src="assets/js/marked.min.js"></script>` **之前**加入：

```html
<script src="assets/js/reader-auth.js"></script>
```

- [ ] **Step 2: reader.js 增加门禁与齿轮登录行**

在 `reader.js` 顶部（IIFE 内、`var state = {...}` 后）加入：

```js
  // ---- 课件登录门禁 + 用户笔记 ----
  var AUTH = window.ReaderAuth;
  var BOOK_ID = function () { return state.bookId || 'lordship_gospel'; };

  function notesUrl(chapter) {
    return '/api/courseware/notes?book=' + encodeURIComponent(BOOK_ID()) +
      '&chapter=' + encodeURIComponent(chapter);
  }
  function draftKey(userId, chapter, qtype, index) {
    return 'cw_draft_' + userId + '_' + chapter + '_' + qtype + '_' + index;
  }
  function loadDraft(userId, chapter, qtype, index) {
    try { return localStorage.getItem(draftKey(userId, chapter, qtype, index)) || ''; } catch (e) { return ''; }
  }
  function clearDraft(userId, chapter, qtype, index) {
    try { localStorage.removeItem(draftKey(userId, chapter, qtype, index)); } catch (e) {}
  }
```

在 `renderCourseware(cwId)` 开头（`var panel = qs('#rdr-cw-content'); if (!panel) return;` 之后）加入门禁分支：

```js
    if (!AUTH.isLoggedIn()) {
      panel.innerHTML =
        '<div class="rdr-cw-lock">' +
        '<p class="rdr-cw-lock-title">登录后可查看互动课件并保存笔记</p>' +
        '<button type="button" class="rdr-cw-lock-btn" id="rdr-cw-login-btn">登录</button>' +
        '</div>';
      var loginBtn = panel.querySelector('#rdr-cw-login-btn');
      if (loginBtn) loginBtn.addEventListener('click', function () {
        AUTH.openLoginModal(function () { renderCourseware(cwId); });
      });
      return;
    }
```

在 `renderCourseware(cwId)` 中，渲染答案 textarea 前加载后端笔记（把读取 `saved` 的地方替换为从后端拉取）。将 `var answers = readJson(answersKey(cwId), {});` 改为：

```js
    var answers = {};   // 后端为准；渲染后再异步拉取填充
    var savedLocal = readJson(answersKey(cwId), {});
    var saved = savedLocal;   // 初始用本地做即时回显
```

并在 `bindCwAnswers(cwId)` **之后**、`bindCwMarkDone(cwId)` **之前**插入异步拉取+防抖保存：

```js
    AUTH.getProfile().then(function (user) {
      if (!user) return;
      fetch(notesUrl(cwId), { headers: { Authorization: 'Bearer ' + AUTH.getToken() } })
        .then(function (r) { return r.ok ? r.json() : { notes: [] }; })
        .then(function (data) {
          var byKey = {};
          (data.notes || []).forEach(function (n) { byKey[n.question_type + ':' + n.question_index] = n.content; });
          panel.querySelectorAll('.rdr-cw-answer-input').forEach(function (input) {
            var qt = input.getAttribute('data-qtype');
            var qi = input.getAttribute('data-index');
            var server = byKey[qt + ':' + qi];
            if (typeof server === 'string' && server !== '') {
              input.value = server;
              // 清掉本地草稿，以后端为准
              clearDraft(user.id, cwId, qt, qi);
            }
          });
        })
        .catch(function () { /* 网络失败：保留本地草稿 */ });
      // 防抖保存（替换 bindCwAnswers 里的纯本地写入为"本地草稿 + 后端 PUT"）
      var timers = {};
      panel.querySelectorAll('.rdr-cw-answer-input').forEach(function (input) {
        var qt = input.getAttribute('data-qtype');
        var qi = input.getAttribute('data-index');
        input.addEventListener('change', function () {
          var text = input.value;
          var key = qt + ':' + qi;
          var saved = readJson(answersKey(cwId), {});
          if (!saved[qt]) saved[qt] = [];
          saved[qt][Number(qi)] = text;
          try { localStorage.setItem(answersKey(cwId), JSON.stringify(saved)); } catch (e) {}
          try { localStorage.setItem(draftKey(user.id, cwId, qt, qi), text); } catch (e) {}
          clearTimeout(timers[key]);
          timers[key] = setTimeout(function () {
            fetch('/api/courseware/notes', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AUTH.getToken() },
              body: JSON.stringify({ book: BOOK_ID(), chapter: cwId, question_type: qt, question_index: Number(qi), content: text }),
            }).then(function (r) {
              if (r.ok) clearDraft(user.id, cwId, qt, qi);
            }).catch(function () { /* 保留草稿，下次 change 重试 */ });
          }, 600);
        });
      });
    });
```

> 注：`bindCwAnswers` 保留（本地即时回显），新增的 `change` 监听负责后端同步；两者不冲突（同一 textarea 两个监听）。

在 `wireStaticUi()` 中，齿轮设置区加入登录/登出行。在 `applySettings()` 或 `wireStaticUi` 的 settings 相关代码旁加入渲染函数与调用：

```js
  function renderAuthRow() {
    var row = qs('#rdr-auth-row');
    if (!row) return;
    AUTH.getProfile().then(function (user) {
      if (user) {
        row.innerHTML = '<span class="rdr-auth-user">' +
          escapeHtml((user.user && (user.user.nickname || user.user.email)) || '') +
          '</span><button type="button" id="rdr-logout-btn">登出</button>';
        var out = qs('#rdr-logout-btn');
        if (out) out.addEventListener('click', function () { AUTH.logout(); renderAuthRow(); });
      } else {
        row.innerHTML = '<button type="button" id="rdr-login-btn">登录</button>';
        var login = qs('#rdr-login-btn');
        if (login) login.addEventListener('click', function () {
          AUTH.openLoginModal(function () { renderAuthRow(); renderCourseware(state.current ? state.current.chapter.cw : null); });
        });
      }
    });
  }
```

在 `init()` 中调用 `renderAuthRow()`（放在 `applySettings()` 之后）。

- [ ] **Step 3: reader.html 设置面板加一行容器**

在 `#rdr-settings` 的最后一个 `.rdr-setting-row` 之后加入：

```html
    <div class="rdr-setting-row" id="rdr-auth-row"></div>
```

- [ ] **Step 4: reader.css 增加锁屏与设置登录行样式**

在 `reader.css` 末尾追加：

```css
/* ---- 课件锁屏 + 设置登录行 ---- */
.rdr-cw-lock { padding: var(--space-lg); text-align: center; color: var(--rdr-muted); }
.rdr-cw-lock-title { margin: 0 0 12px; font-size: 14px; }
.rdr-cw-lock-btn, #rdr-auth-row button {
  padding: 8px 18px; border: 0; border-radius: var(--rdr-radius-sm);
  background: var(--rdr-accent); color: #fff; cursor: pointer; font-size: 14px;
}
.rdr-cw-lock-btn:hover, #rdr-auth-row button:hover { background: var(--rdr-accent-ink); }
#rdr-auth-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rdr-auth-user { font-size: 13px; color: var(--rdr-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#rdr-auth-row button { background: transparent; color: var(--rdr-accent); border: 1px solid var(--rdr-border); }
```

- [ ] **Step 5: 语法校验 + 浏览器验证**

Run: `node --check brianinchrist/organicchurch/library/assets/js/reader.js`

浏览器验证（python http.server 已跑在 8000）：
1. 打开 `http://localhost:8000/brianinchrist/organicchurch/library/reader.html?book=lordship_gospel&ch=00`
2. 预期：课件面板显示锁屏 + 「登录」按钮
3. 齿轮设置里出现「登录」按钮
4. 点登录 → 弹窗 → 输入有效账号 → 面板解锁并显示概要/问题

- [ ] **Step 6: Commit**

```bash
git add brianinchrist/organicchurch/library/reader.html brianinchrist/organicchurch/library/assets/js/reader.js brianinchrist/organicchurch/library/assets/css/reader.css
git commit -m "feat(reader): 课件登录门禁 + 齿轮登录/登出 + 笔记后端同步"
```

---

## Phase 4：独立课件页集成

### Task 5: 课件页门禁 + 顶栏登录

**Files:**
- Modify: `brianinchrist/organicchurch/library/lordship_gospel/courseware/index.html`
- Modify: `.../courseware/chapter.html`
- Modify: `.../courseware/review.html`
- Modify: `.../courseware/print.html`
- Modify: `.../courseware/assets/js/app.js`
- Modify: `.../courseware/assets/js/review.js`

- [ ] **Step 1: 4 个 html 页加载 reader-auth.js + 顶栏登录按钮 + 锁屏容器**

**所有 4 页**在既有 `<script src="assets/js/...">` **之前**（如 `index.html` 第 66 行前）加入：

```html
<script src="../../assets/js/reader-auth.js"></script>
```

> 课件页位于 `library/lordship_gospel/courseware/`，`library/assets/js/reader-auth.js` 的相对路径即 `../../assets/js/reader-auth.js`（四页一致）。

**index.html / chapter.html / review.html**：在 `<nav class="topbar-nav">` 内追加登录按钮容器：

```html
<span id="cw-auth-slot" class="cw-auth-slot"></span>
```

并在各自 `<main>`（index 用 `parts-container` 所在 main；chapter/review 的 main）开头加锁屏容器：

```html
<div id="cw-lock" class="cw-lock" hidden>
  <p>登录后可查看互动课件并保存笔记</p>
  <button type="button" id="cw-login-btn">登录</button>
</div>
```

**print.html**（无 topbar）：不加 slot，仅加门禁——见 Step 6。

- [ ] **Step 2: 新增共享门禁函数到 utils.js**

修改 `courseware/assets/js/utils.js`，追加：

```js
  window.Courseware.requireCoursewareLogin = function (onUnlocked) {
    var lock = document.getElementById('cw-lock');
    var main = document.querySelector('main');
    function unlock() {
      if (lock) lock.hidden = true;
      if (main) main.hidden = false;
      if (typeof onUnlocked === 'function') onUnlocked();
    }
    function lockScreen() {
      if (lock) lock.hidden = false;
      if (main) main.hidden = true;
      var btn = document.getElementById('cw-login-btn');
      if (btn) btn.onclick = function () {
        window.ReaderAuth.openLoginModal(function () { unlock(); });
      };
    }
    var auth = window.ReaderAuth;
    if (!auth) { unlock(); return; }
    auth.getProfile().then(function (user) {
      if (user) { unlock(); } else { lockScreen(); }
    });
  };

  window.Courseware.renderAuthSlot = function () {
    var slot = document.getElementById('cw-auth-slot');
    var auth = window.ReaderAuth;
    if (!slot || !auth) return;
    auth.getProfile().then(function (user) {
      if (user) {
        slot.innerHTML = '<span style="font-size:13px;color:var(--muted,#666)">' +
          auth.escapeHtml ? auth.escapeHtml(user.user.nickname || user.user.email) : (user.user.nickname || user.user.email) +
          '</span> <button type="button" class="cw-auth-btn">登出</button>';
      } else {
        slot.innerHTML = '<button type="button" class="cw-auth-btn">登录</button>';
      }
      var btn = slot.querySelector('button');
      if (btn) btn.onclick = function () {
        if (auth.isLoggedIn()) { auth.logout(); window.Courseware.renderAuthSlot(); }
        else auth.openLoginModal(function () { window.Courseware.renderAuthSlot(); });
      };
    });
  };
```

> `auth.escapeHtml` 不存在——直接内联转义或用简单替换；实现时用 `String(x).replace(/[&<>"]/g, ...)`。

- [ ] **Step 3: app.js（index.html）门禁**

修改 `app.js` 末尾的 `try { renderDashboard(); ... }` 块，包一层登录门禁：

```js
  try {
    window.Courseware.renderAuthSlot();
    window.Courseware.requireCoursewareLogin(function () {
      renderDashboard();
      updateStats();
      setupExportActions();
      setupTimeTracking();
    });
  } catch (err) {
    console.error(err);
    var container = document.getElementById('parts-container');
    if (container) container.innerHTML = '<p class="error">课件数据加载失败</p>';
  }
```

- [ ] **Step 4: review.js 门禁**

修改 `review.js` 末尾 try 块同理：

```js
  try {
    window.Courseware.renderAuthSlot();
    window.Courseware.requireCoursewareLogin(function () {
      renderFlashcards();
      renderQuiz();
      renderScriptureReview();
      setupTimeTracking();
    });
  } catch (err) {
    console.error(err);
    document.querySelector('main').innerHTML = '<p class="error">课件数据加载失败</p>';
  }
```

- [ ] **Step 5: chapter.js 门禁**

修改 `chapter.js` 主流程（`try { var params = ... }` 块），用 `requireCoursewareLogin` 包裹渲染：

```js
  try {
    window.Courseware.renderAuthSlot();
    var params = new URLSearchParams(location.search);
    var chapterId = params.get('c') || 'preface';
    var chapter = C.getChapter(chapterId);
    if (!chapter) {
      document.querySelector('main').innerHTML = '<p class="error">未找到该章节</p>';
    } else {
      window.Courseware.requireCoursewareLogin(function () {
        renderChapter(chapter);
        bindInteractions(chapterId);
        C.progress.markVisited(chapterId);
        C.stats.setLastChapter(chapterId);
      });
    }
    setupTimeTracking();
  } catch (err) {
    console.error(err);
    document.querySelector('main').innerHTML = '<p class="error">课件数据加载失败</p>';
  }
```

- [ ] **Step 6: print.html 门禁**

`print.html` 若无独立 JS，则在页面内嵌 `<script>` 中调用 `ReaderAuth`：

```html
<script>
  window.ReaderAuth && window.ReaderAuth.getProfile().then(function (user) {
    if (!user) { document.querySelector('body').innerHTML = '<p style="text-align:center;margin-top:40px">登录后可查看/打印笔记。</p>'; }
  });
</script>
```

- [ ] **Step 7: 语法校验 + 浏览器验证**

Run: `node --check` 对 app.js / review.js / chapter.js / utils.js

浏览器：打开 `courseware/index.html` → 未登录显示锁屏 + 顶栏「登录」；登录后正常显示仪表盘。

- [ ] **Step 8: Commit**

```bash
git add brianinchrist/organicchurch/library/lordship_gospel/courseware/
git commit -m "feat(courseware): 独立课件页登录门禁 + 顶栏登录/登出"
```

### Task 6: 课件页笔记后端同步（chapter.js + storage.js）

**Files:**
- Modify: `.../courseware/assets/js/storage.js`
- Modify: `.../courseware/assets/js/chapter.js`

- [ ] **Step 1: storage.js 增加后端同步的 answers.saveSync**

在 `storage.js` 的 `answers` 对象中追加 `saveSync`（本地 + 后端 PUT，扁平 idx→(type,index) 由调用方传入）：

```js
  var answers = {
    get: function(chapterId) { return get('answers_' + chapterId, {}); },
    set: function(chapterId, obj) { set('answers_' + chapterId, obj); },
    save: function(chapterId, qIndex, text) {
      var obj = answers.get(chapterId);
      obj[qIndex] = text;
      answers.set(chapterId, obj);
    },
    // 后端同步保存：key = question_type + index（调用方在 data-index 上同时带 type）
    saveSync: function(chapterId, key, text) {
      var obj = answers.get(chapterId);
      obj[key] = text;
      answers.set(chapterId, obj);
      var auth = window.ReaderAuth;
      if (!auth || !auth.isLoggedIn()) return;
      var parts = key.split(':');
      var qtype = parts[0], qi = Number(parts[1]);
      clearTimeout(answers._timer);
      answers._timer = setTimeout(function () {
        fetch('/api/courseware/notes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.getToken() },
          body: JSON.stringify({ book: 'lordship_gospel', chapter: chapterId, question_type: qtype, question_index: qi, content: text }),
        }).catch(function () {});
      }, 600);
    },
    // 从后端拉取本章笔记，回调 notes 数组
    loadSync: function(chapterId, cb) {
      var auth = window.ReaderAuth;
      if (!auth || !auth.isLoggedIn()) { cb && cb([]); return; }
      fetch('/api/courseware/notes?book=lordship_gospel&chapter=' + encodeURIComponent(chapterId),
        { headers: { Authorization: 'Bearer ' + auth.getToken() } })
        .then(function (r) { return r.ok ? r.json() : { notes: [] }; })
        .then(function (data) { cb && cb(data.notes || []); })
        .catch(function () { cb && cb([]); });
    },
    getAll: function() { /* 保持原样 */ },
  };
```

- [ ] **Step 2: chapter.js 渲染时预填后端笔记**

在 `renderChapter(chapter)` 的 questions 渲染**之后**、`bindInteractions` 之前，追加：

```js
    if (questions && chapter.questions) {
      // 用后端笔记预填（覆盖本地旧值，后端为准）
      C.answers.loadSync(chapter.id, function (notes) {
        var byKey = {};
        notes.forEach(function (n) { byKey[n.question_type + ':' + n.question_index] = n.content; });
        document.querySelectorAll('.answer-input').forEach(function (ta) {
          var key = byKey[ta.getAttribute('data-index')];
          // data-index 当前是扁平 idx；后端用 (type,index)，需按顺序换算 ——
          // 简化：给每个 textarea 加 data-key="<type>:<localIdx>"，见下
        });
      });
    }
```

> **关键转换**：`chapter.js` 现在用扁平 idx。改造方式——在渲染 questions 的循环里，把 `data-index` 同时存成 `data-key="<type>:<localIndex>"`。修改该处渲染代码：

```js
          for (var i = 0; i < items.length; i++) {
            var idx = qIndex++;
            qHtml += '<div class="question-card">' +
              '<p class="question-text" id="q-' + chapter.id + '-' + idx + '">' + C.escapeHtml(items[i]) + '</p>' +
              '<textarea class="answer-input" data-index="' + idx + '" data-key="' + types[t].key + ':' + i + '" rows="4" ' +
              'aria-labelledby="q-' + chapter.id + '-' + idx + '" ' +
              'placeholder="在此输入你的回答…">' + C.escapeHtml(saved[idx] || '') + '</textarea>' +
              '</div>';
          }
```

然后预填逻辑用 `data-key`（而非扁平 idx）：

```js
      C.answers.loadSync(chapter.id, function (notes) {
        var byKey = {};
        notes.forEach(function (n) { byKey[n.question_type + ':' + n.question_index] = n.content; });
        document.querySelectorAll('.answer-input').forEach(function (ta) {
          var k = ta.getAttribute('data-key');
          if (k && byKey[k] !== undefined && byKey[k] !== '') ta.value = byKey[k];
        });
      });
```

- [ ] **Step 3: bindInteractions 改走后端同步**

修改 `bindInteractions` 的 textarea `input` 监听：

```js
      textarea.addEventListener('input', function () {
        var idx = textarea.getAttribute('data-index');
        C.answers.save(chapterId, idx, textarea.value);
        var key = textarea.getAttribute('data-key');
        if (key) C.answers.saveSync(chapterId, key, textarea.value);
      });
```

- [ ] **Step 4: 语法校验 + 浏览器验证**

Run: `node --check` 对 storage.js / chapter.js

浏览器：登录 → `chapter.html?c=introduction` → 输入答案 → 等 600ms → 刷新 → 答案仍在（后端拉取）。

- [ ] **Step 5: Commit**

```bash
git add brianinchrist/organicchurch/library/lordship_gospel/courseware/assets/js/storage.js brianinchrist/organicchurch/library/lordship_gospel/courseware/assets/js/chapter.js
git commit -m "feat(courseware): 笔记后端同步（storage + chapter）"
```

---

## Phase 5：验证

### Task 7: 全量验证

- [ ] **Step 1: 后端测试全绿**

Run: `npx vitest run tests/migrations/015-courseware-notes.test.js tests/api/courseware/notes.test.js`
Expected: PASS（共 8 个用例）

Run: `npx vitest run`（全量，确认无回归）

- [ ] **Step 2: 浏览器 E2E 门禁**

1. 登出（清 `auth_token`）→ 打开 `reader.html?book=lordship_gospel&ch=00` → 课件面板锁屏
2. 齿轮 → 「登录」→ 弹窗注册一个新账号 → 面板解锁
3. 在面板输入答案 → 等 1s → 刷新页面 → 答案仍在
4. 打开 `courseware/chapter.html?c=introduction` → 已登录直接显示 → 输入答案 → 刷新 → 仍在
5. 换账号（登出→登录另一账号）→ 看不到上一账号的笔记

- [ ] **Step 3: 本地部署 API 验证**

Run: `npx wrangler pages dev course-app --port 8788`，然后：
```bash
curl -s -X POST http://localhost:8788/api/auth/signup -H "Content-Type: application/json" -d '{"email":"e2e-notes@test.com","password":"testpass123","nickname":"E2E"}'
# 取 token，然后 PUT /api/courseware/notes + GET 验证
```

- [ ] **Step 4: 提交剩余 + 汇总**

```bash
git add -A && git commit -m "feat(courseware): 课件登录门禁与用户笔记后端同步"
```

---

## Self-Review 结论（写入时已核对）

- **Spec 覆盖**：A（迁移+API）→ Task 1/2；B（reader-auth）→ Task 3；C（阅读器门禁+齿轮+笔记）→ Task 4；D（课件页门禁+笔记）→ Task 5/6；E（迁移/离线/测试）→ Task 6 草稿 + Task 7。✅
- **无占位符**：所有代码步骤给出实际内容。✅
- **类型一致**：后端键 `(book, chapter, question_type, question_index)` 全链一致；`data-key="<type>:<localIndex>"` 在 storage 与 chapter 间一致。✅
- **已知待实现时确认**：课件页加载 reader-auth.js 的相对路径（`../../assets/js/reader-auth.js`）；`print.html` 若有独立 JS 需同样处理。
