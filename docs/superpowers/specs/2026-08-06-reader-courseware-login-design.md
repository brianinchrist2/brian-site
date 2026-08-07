# 设计文档：课件登录门禁 + 用户笔记后端同步

**日期**：2026-08-06
**状态**：已与用户确认（方案 1：全量实现）
**范围**：MD 在线阅读器（`organicchurch/library/reader.html`）与独立课件页的登录门禁，以及课件笔记的用户级后端同步。

## 背景与目标

阅读器与互动课件当前完全公开，课件内思考题笔记存于 `localStorage`（按浏览器、跨用户共享），无法与特定用户绑定。需求：

1. **所有课件相关部分需登录后才能使用**（阅读器右侧课件面板 + 独立课件页 index/chapter/review/print）。
2. **笔记必须与用户绑定**——通过后端同步，实现跨设备、按用户隔离。
3. 登录入口：阅读器右上角齿轮设置内新增「登录」按钮；课件页顶栏同样提供登录入口。
4. 登录/注册使用现有认证体系（`/api/auth/signin`、`/api/auth/signup`，JWT 存 `localStorage.auth_token`），博客域已验证可用。

## 架构总览

```
┌─ 后端 ─────────────────────────────────────────────┐
│ migration 015: courseware_notes 表                   │
│ functions/api/courseware/notes.js: GET/PUT（JWT 鉴权）│
└─────────────────────────────────────────────────────┘
          ▲ GET/PUT (Bearer JWT)            ▲
┌─────────┴──────────────┐   ┌──────────────┴───────────┐
│ 阅读器 reader.html      │   │ 独立课件页 courseware/*.html │
│  + reader-auth.js (共享)│   │  + reader-auth.js (共享)    │
│ 课件面板门禁 + 齿轮登录   │   │ 页面门禁 + 顶栏登录          │
│ 笔记后端读写（防抖）      │   │ 笔记后端读写（防抖）          │
└────────────────────────┘   └──────────────────────────┘
```

## A. 后端

### A1. 迁移 `migrations/015-courseware-notes.sql`

```sql
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

### A2. API `functions/api/courseware/notes.js`

复用 `verifyAuth(db, request, env)`（`functions/_utils/requireAuth.js`），`payload.sub` 为用户 id。

- **GET** `?book=<id>&chapter=<cwId>`：返回当前用户该书该章的全部笔记。
  - 响应：`{ success, notes: [{question_type, question_index, content, updated_at}] }`
- **PUT**：body `{ book, chapter, question_type, question_index, content }`，upsert。
  - `INSERT ... ON CONFLICT(user_id,book_id,chapter_id,question_type,question_index) DO UPDATE SET content=?, updated_at=datetime('now')`
  - 响应：`{ success: true }`

**安全**：
- `user_id` 只从 JWT `payload.sub` 取，**绝不信任请求体**。
- 输入校验：`book`/`chapter` 为非空字符串（限长 ≤100）；`question_type` ∈ 三枚举；`question_index` 为非负整数；`content` 限长（如 ≤20000 字符）。
- 错误统一 `{ error: message }` + 恰当状态码（401/400/500）。

## B. 共享认证模块 `library/assets/js/reader-auth.js`

经典脚本（非 ES module），暴露全局 `ReaderAuth`。阅读器与课件页通过 `<script src>` 引入。

```js
ReaderAuth = {
  isLoggedIn(), getToken(), setToken(), clearToken(),
  async getProfile(),            // GET /api/user/profile；401 清 token
  async signIn(email, pwd),      // POST /api/auth/signin → setToken
  async signUp(nick, email, pwd),// POST /api/auth/signup → setToken
  logout(),
  ensureLogin(),                 // Promise<user|null>：未登录则弹窗，成功返回 user
  openLoginModal(onSuccess),     // 注入登录/注册弹窗 DOM+样式
  onLogout(cb),                  // 登出回调（页面刷新 UI）
}
```

**内嵌弹窗**（自注入）：
- DOM + 内联 `<style>` 一次性注入 `<body>`（复用首页登录弹窗的交互模式：登录/注册切换、邮箱/密码/昵称）。
- 提交走 `/api/auth/signin|signup`，成功 → `setToken` → 关闭弹窗 → `onSuccess(user)`。
- 弹窗样式自包含，不依赖 reader.css / courseware.css，两个前端子系统均可渲染。

## C. 阅读器集成（`reader.html` + `reader.js` + `reader.css`）

1. `reader.html` 在 `reader.js` 前加载 `reader-auth.js`。
2. **课件面板门禁**：`renderCourseware()` 前检查登录态。
   - 未登录 → 面板渲染锁屏：图标 + "登录后可查看互动课件并保存笔记" + 「登录」按钮（点开弹窗）。
   - 已登录 → 正常渲染课件 + 从后端拉取笔记预填。
   - 登录成功后：重新渲染当前章课件面板（自动解锁）。
3. **齿轮设置**：`#rdr-settings` 新增一行：
   - 未登录：按钮「登录」（打开弹窗）。
   - 已登录：显示昵称/邮箱 + 「登出」按钮（清 token，刷新为锁屏）。
4. **笔记后端同步**：
   - 渲染课件时 `GET /api/courseware/notes?book=&chapter=` → 按 `(type,index)` 预填 textarea。
   - textarea `input` → 防抖 600ms → `PUT` 保存；单键局部草稿缓存（写失败不丢字）。
   - 旧的 `courseware_answers_<cwId>` localStorage 逻辑：登录后一次性迁移到后端，随后不再写入。

## D. 独立课件页集成（`courseware/index.html` / `chapter.html` / `review.html` / `print.html`）

1. 各页加载 `reader-auth.js`；页面初始化先 `ensureLogin()`，未登录显示锁屏（登录后可继续），成功继续渲染。
2. `chapter.js`：笔记读写从 `storage.js`（localStorage）切换到后端；`storage.js` 适配为"先内存/本地草稿 + 防抖写后端"。
3. 课件页顶栏加「登录/登出」按钮（复用 ReaderAuth 弹窗）。

## E. 边界与错误处理

- **离线/写失败**：PUT 失败不阻塞输入——内容保留在内存+本地草稿 key，标记"待同步"，下次成功写入后清除。
- **迁移**：登录后若存在旧 `courseware_answers_<cwId>`，逐条 PUT 到后端，成功后删除本地 key（幂等，可重试）。
- **多标签页**：不主动跨标签同步（依赖后端为准）；不做实时冲突合并（last-write-wins）。

## F. 安全

- notes API 全程 JWT 鉴权；`user_id` 服务端派生，防越权。
- 输入白名单校验（type 枚举、index 非负整数、长度上限）。
- 笔记内容按文本存，前端渲染走 `escapeHtml`（沿用 reader.js 既有模式），无 HTML 注入。

## G. 测试

- **notes API 单测**（vitest，沿用 `tests/api/` 模式 + `setupTestDB`）：鉴权 401、GET 返回本人笔记、PUT upsert、越权隔离（用户 A 看不到用户 B 笔记）、输入校验。
- **迁移测试**：015 建表 + UNIQUE 约束（沿用 `tests/migrations/` 模式）。
- **手动 E2E**：登出 → 面板锁屏 → 登录 → 解锁+笔记预填 → 输入防抖保存 → 刷新仍在 → 另一账号隔离。

## H. 明确不做（YAGNI）

- 不做笔记的多设备实时同步/冲突合并（last-write-wins 足够）。
- 不做课件页的注册页（复用弹窗内注册 tab）。
- 不改造既有 `book2/`（旧静态章节）——其不在本方案门禁范围，仅新阅读器体系。

## 待确认的实现细节（进入 writing-plans 前）
- 防抖间隔取 600ms；本地草稿 key `cw_draft_<userId>_<chapter>_<type>_<index>`。
- 课件页门禁顺序：index/chapter/review/print 全部门禁（保持一致）。
