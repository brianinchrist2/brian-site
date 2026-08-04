# Architecture Knowledge
> Last verified: 2026-08-03 | Verified by: session 2026-08-03_p4-acceptance

## System Overview

Christian theology content site hosted on Cloudflare Pages. Two major subsystems:
1. **Static content site** — vanilla HTML/CSS/JS, deployed directly from `brianinchrist/`
2. **course-app** — course management system with CF Pages Functions backend

```
                     ┌─────────────────────────┐
                     │   Cloudflare Pages       │
                     │  (brianinchrist-site)    │
                     ├─────────────────────────┤
                     │  Static: brianinchrist/  │
                     │  ├── organicchurch/      │
                     │  │   ├── index.html      │
                     │  │   ├── assets/css/     │
                     │  │   └── {id}.html (250+)│
                     │  └── course-app/         │
                     │                          │
                     │  Serverless: functions/  │
                     │  ├── api/auth/           │
                     │  ├── api/user/           │
                     │  └── _utils/             │
                     │                          │
                     │  KV: USERS_KV            │
                     └─────────────────────────┘
```

## Module Map

| Module | Path | Responsibility |
|--------|------|----------------|
| Static Site | `brianinchrist/organicchurch/` | Blog listing + ~2500 HTML posts |
| Design System | `brianinchrist/organicchurch/assets/css/` | vars.css (tokens) + article.css |
| Auth | `functions/api/auth/` | Sign in/up endpoints |
| User | `functions/api/user/` | Profile GET/POST |
| Auth Utils | `functions/_utils/` | Password hashing, JWT |
| course-app | `course-app/` | Course management UI + logic |
| Blog Content | `oikos_church/{en,zh}/` | Source content for books/courseware |
| Python Scripts | Root `*.py` | Migration, asset cleanup |
| Migrations | `migrations/` | D1 database migrations |
| Tests | `tests/` | Unit + integration tests |

## Data Flow

```
Browser ──HTTP──> CF Pages ──route──> brianinchrist/ (static)
                                └──> functions/api/* (serverless)
                                          │
                                          ▼
                                     USERS_KV (KV store)
                                          │
                                          ▼
                                     D1 Database (course-app)
```

## Key Data Stores
- **USERS_KV** — KV namespace for user accounts (`user:{email}` → JSON blob)
- **D1 Database** — course-app relational data (courses, assignments, submissions, grades)
- **posts.json** — ~2500+ blog post metadata entries

## Tech Stack
- **Hosting**: Cloudflare Pages
- **Runtime**: CF Pages Functions (ES Modules, Workers runtime)
- **Database**: Cloudflare D1 (SQLite-based) + KV (USERS_KV)
- **Auth**: JWT (HMAC-SHA256, 7-day expiry, Bearer token)
- **Password Hashing**: PBKDF2 (upgraded from SHA-256 on 2026-07-23)
- **Frontend**: Vanilla HTML/CSS/JS — no framework
- **Design**: "Scriptorium" system — parchment palette, Noto Serif/Sans SC

## Known Constraints
- CF Pages Functions have limited runtime (CPU time, memory)
- KV has 1KB value size limit per entry (noted for user profiles)
- posts.json is ~2500 entries — avoid full rewrites
- Single branch: `master`
- No formatter/linter config (`.editorconfig`, `.prettierrc`)

## 授权公共层（requireAuth / requireRole）

- **后端** `functions/_utils/params.js`：`requireAuth`（验证 `Authorization: Bearer` JWT，注入 `env`/`userId`），各 `functions/api/modules/*` handler 统一调用；`requireRole([...])` 角色门禁（student/teacher/advisor/admin）。
- **前端** `course-app/assets/js/auth.js`：`CourseAuth` 模块（`getToken/setToken/requireAuth/requireRole/dashboardPath/getProfile/signIn/signUp/logout`），token 存 `localStorage.auth_token`，所有 course-app 页面（含 admin/*）顶部 `requireRole` 守卫，未认证跳 `/login.html`。
- 令牌流转：signin → JWT (HS256, 7-day) → `Authorization: Bearer` → KV `user:{email}` + D1 roles。

## D1 迁移 014（时间戳规范）

- `migrations/014_timestamp_unify.sql`：统一各表 `created_at/updated_at` 时间戳格式（UTC ISO .000Z）。
- ADR-003：时间戳 UPDATE 一律参数化绑定，禁止字符串内插。
- ADR-005：`courses.created_by` / `classes.advisor_id` 保留 NO ACTION 外键，不在 014 重建（NOT NULL + 高风险）。

## 设计令牌（Scriptorium tokens）

- `vars.css` ×2 副本（`course-app/assets/css/` + `brianinchrist/organicchurch/assets/css/`）——修改必须两处同步。
- 语义状态色：`--status-present #4A6741 / --status-absent #8A3517 / --status-late #8A4F00 / --status-excused #39637A`（ADR-006 加深至徽章 ≥4.5:1），另有 `--status-*-bg` 10% tint；`--success/--error`（toast）。
- 共享组件库 `course-app/assets/css/course.css`：`.topbar/.page-layout/.sidebar/.main-content/.main-header/.btn-*/.card/.history-table-wrap/.history-table/.badge--*/ .modal-*/.toast/.form-*/.error-msg` 等；全部页面（17 页）已收敛共享壳，页面仅保留 JS 运行期类名的最小 token 化特例。
- JS 层硬编码色已清零（attendance.js STATUS_COLORS 读 CSS 变量，ADR-006）。
