# course-app 全量修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按四阶段修复 course-app 的 40+ 个安全/UX/UI 问题（无认证端点、IDOR、考试作弊链、教师越权、时间戳双轨制、成绩/证书/批改断链、三套 UI 体系），每阶段可独立部署。

**Architecture:** P1 先建统一授权层（`functions/_utils/requireAuth.js`）再全量替换 45 个端点的认证样板并补洞；P2 新增 D1 迁移 014 统一时间戳/补索引/幂等化 011-013；P3 打通学生/教师主路径（成绩、证书、批改、班级管理、选课）；P4 以 `student/attendance.html` 为基准渐进收敛全部页面。

**Tech Stack:** CF Pages Functions (ES Modules)、Cloudflare D1、USERS_KV、vitest（node:sqlite 真库）、vanilla HTML/CSS/JS。

## Global Constraints

- 所有 SQL 必须参数化（`prepare + bind`），禁止把用户输入拼进 SQL 字符串
- 阶段顺序不可交换：P1 → P2 → P3 → P4；每阶段结束跑 `npm run test:unit` 并通过后才进入下一阶段
- 数据库变更只走 `migrations/` + `wrangler d1 migrations apply`；014 执行前必须 `wrangler d1 export` 备份
- 错误响应统一 `{ error: message }` + 对应状态码（401/403/404/400/429/500）
- 提交规范：Conventional Commits（`fix:`/`feat:`/`chore:`）
- 测试模式：vitest + `tests/helpers/setup-db.js`（真实 node:sqlite + migrations 文件），JWT 用 `signJWT` 生成，签名密钥 `'test-secret'`
- 前端所有用户内容用 `textContent` 渲染，禁止 `innerHTML` 注入用户输入
- 不动 `functions/_utils/auth.js`（PBKDF2）与 `functions/_utils/jwt.js`（HS256）——只在其上封装

---

# Phase 1: 安全止血

## Task 1: 新建授权公共库 requireAuth.js + params.js

**Files:**
- Create: `functions/_utils/requireAuth.js`
- Create: `functions/_utils/params.js`
- Test: `tests/_utils/requireAuth.test.js`

**Interfaces:**
- Produces: `verifyAuth(db, request, env) → { ok, status, error, payload, roles }`、`requireRole(roles, allowed) → { ok }`、`getRoles(db, userId) → string[]`、`isEnrolled(db, studentId, courseId) → bool`、`canManageClass(db, teacherId, classId) → bool`、`canManageCourse(db, teacherId, courseId) → bool`、`jsonError(status, message) → Response`、`clampLimit(raw, def=20, max=100) → number`、`clampOffset(raw) → number`
- Consumes: `verifyJWT` from `./jwt.js`、`queryOne` from `../_shared/db.js`

- [ ] **Step 1: 写失败测试**

Create `tests/_utils/requireAuth.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';
import { signJWT } from '../../functions/_utils/jwt.js';
import { verifyAuth, requireRole, getRoles, isEnrolled, canManageClass, canManageCourse, clampLimit, clampOffset } from '../../functions/_utils/requireAuth.js';

const SECRET = 'test-secret';

async function makeAuth(token) {
  const db = await setupTestDB(['001_init.sql']);
  const request = new Request('http://localhost/x', {
    headers: { Authorization: token ? `Bearer ${token}` : {} }
  });
  return { db, request };
}

describe('requireAuth', () => {
  it('rejects missing Authorization header', async () => {
    const { db, request } = await makeAuth(null);
    const res = await verifyAuth(db, request, { JWT_SECRET: SECRET });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('rejects invalid token', async () => {
    const { db, request } = await makeAuth('not.a.jwt');
    const res = await verifyAuth(db, request, { JWT_SECRET: SECRET });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('returns payload and roles for valid token', async () => {
    const db = await setupTestDB(['001_init.sql']);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    const token = await signJWT({ sub: 'u1', exp: Date.now() + 60000 }, SECRET);
    const request = new Request('http://localhost/x', { headers: { Authorization: `Bearer ${token}` } });
    const res = await verifyAuth(db, request, { JWT_SECRET: SECRET });
    expect(res.ok).toBe(true);
    expect(res.payload.sub).toBe('u1');
    expect(res.roles).toEqual(['student']);
  });

  it('getRoles returns [] for missing user or corrupted roles', async () => {
    const db = await setupTestDB(['001_init.sql']);
    expect(await getRoles(db, 'nobody')).toEqual([]);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u2','b@b.c','B','h','s','not-json')").run();
    expect(await getRoles(db, 'u2')).toEqual([]);
  });

  it('requireRole enforces whitelist', async () => {
    expect(requireRole(['student'], ['admin']).ok).toBe(false);
    expect(requireRole(['admin'], ['admin', 'teacher']).ok).toBe(true);
  });

  it('isEnrolled / canManageClass / canManageCourse query correctly', async () => {
    const db = await setupTestDB(['001_init.sql']);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C','published','t1')").run();
    await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl1','CL','t1')").run();
    await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
    expect(await isEnrolled(db, 's1', 'c1')).toBe(true);
    expect(await isEnrolled(db, 's1', 'c2')).toBe(false);
    expect(await canManageCourse(db, 't1', 'c1')).toBe(true);
    expect(await canManageCourse(db, 't1', 'c2')).toBe(false);
    expect(await canManageClass(db, 't1', 'cl1')).toBe(true);
    expect(await canManageClass(db, 't1', 'cl2')).toBe(false);
  });

  it('clampLimit/clampOffset normalize pagination', () => {
    expect(clampLimit('-5')).toBe(1);
    expect(clampLimit('9999')).toBe(100);
    expect(clampLimit('abc')).toBe(20);
    expect(clampLimit('10')).toBe(10);
    expect(clampOffset('-3')).toBe(0);
    expect(clampOffset('8')).toBe(8);
    expect(clampOffset('x')).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/_utils/requireAuth.test.js`
Expected: FAIL — `Cannot find module '../../functions/_utils/requireAuth.js'`

- [ ] **Step 3: 写实现**

Create `functions/_utils/requireAuth.js`:

```js
import { verifyJWT } from "./jwt.js";
import { queryOne } from "../_shared/db.js";

export async function getRoles(db, userId) {
  try {
    const user = await queryOne(db, "SELECT roles FROM users WHERE id = ?", [userId]);
    if (!user || !user.roles) return [];
    const parsed = JSON.parse(user.roles);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function verifyAuth(db, request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized", payload: null, roles: [] };
  }
  const payload = await verifyJWT(authHeader.split(" ")[1], env.JWT_SECRET);
  if (!payload) {
    return { ok: false, status: 401, error: "Invalid token", payload: null, roles: [] };
  }
  const roles = await getRoles(db, payload.sub);
  return { ok: true, status: 200, error: null, payload, roles };
}

export function requireRole(roles, allowed) {
  if (!allowed.some((r) => roles.includes(r))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}

export async function isEnrolled(db, studentId, courseId) {
  const row = await queryOne(
    db,
    "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'active'",
    [studentId, courseId]
  );
  return !!row;
}

export async function canManageCourse(db, teacherId, courseId) {
  const row = await queryOne(db, "SELECT id FROM courses WHERE id = ? AND created_by = ?", [courseId, teacherId]);
  return !!row;
}

export async function canManageClass(db, teacherId, classId) {
  const row = await queryOne(db, "SELECT id FROM classes WHERE id = ? AND advisor_id = ?", [classId, teacherId]);
  return !!row;
}

export function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
```

Create `functions/_utils/params.js`:

```js
export function clampLimit(raw, def = 20, max = 100) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(1, Math.min(n, max));
}

export function clampOffset(raw) {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/_utils/requireAuth.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 提交**

```bash
git add functions/_utils/requireAuth.js functions/_utils/params.js tests/_utils/requireAuth.test.js
git commit -m "feat(security): add shared requireAuth helpers (verifyAuth/requireRole/ownership)"
```

---

## Task 2: courses/items.js GET 认证 + 选课校验；catalog.js 样板替换

**Files:**
- Modify: `functions/api/modules/courses/items.js`（GET 认证块 + 导入）
- Modify: `functions/api/modules/courses/catalog.js`（GET/POST 认证样板）
- Test: `tests/api/modules/courses/items.test.js`

**Interfaces:**
- Consumes: `verifyAuth`、`requireRole`、`isEnrolled`、`jsonError`、`clampLimit`、`clampOffset` from `../../../_utils/requireAuth.js` / `../../../_utils/params.js`
- Produces: items.js GET 返回 401（未认证）/ 403（未选课学生）/ 200（已选课或教师）

- [ ] **Step 1: 写失败测试**

Create `tests/api/modules/courses/items.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/courses/items.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u-student','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u-teacher','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','Course','published','u-teacher')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','Other','published','u-teacher')").run();
  await db.prepare("INSERT INTO course_items (id, course_id, type, title, item_ref, sort_order) VALUES ('i1','c1','video','V1','ref1',0)").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','u-student','c1','active')").run();
  return db;
}

async function getItems(db, url, token) {
  const request = new Request(url, { headers: { Authorization: token ? `Bearer ${token}` : {} } });
  return onRequestGet({ env: { DB: db, JWT_SECRET: SECRET }, request });
}

describe('courses/items GET', () => {
  it('rejects anonymous request', async () => {
    const db = await seed();
    const res = await getItems(db, 'http://localhost/api/modules/courses/items?course_id=c1', null);
    expect(res.status).toBe(401);
  });

  it('rejects unenrolled student', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'u-student', exp: Date.now() + 60000 }, SECRET);
    const res = await getItems(db, 'http://localhost/api/modules/courses/items?course_id=c2', token);
    expect(res.status).toBe(403);
  });

  it('allows enrolled student', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'u-student', exp: Date.now() + 60000 }, SECRET);
    const res = await getItems(db, 'http://localhost/api/modules/courses/items?course_id=c1', token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('i1');
  });

  it('allows teacher without enrollment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'u-teacher', exp: Date.now() + 60000 }, SECRET);
    const res = await getItems(db, 'http://localhost/api/modules/courses/items?course_id=c2', token);
    expect(res.status).toBe(200);
  });

  it('rejects limit=-1 by clamping to 1', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 'u-teacher', exp: Date.now() + 60000 }, SECRET);
    const res = await getItems(db, 'http://localhost/api/modules/courses/items?course_id=c1&limit=-1', token);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/api/modules/courses/items.test.js`
Expected: FAIL — 第一个测试返回 200 而非 401

- [ ] **Step 3: 修改 items.js**

替换 `functions/api/modules/courses/items.js` 头部导入（第 1-2 行）：

```js
import { verifyAuth, requireRole, isEnrolled, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";
```

将 `onRequestGet` 替换为：

```js
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const courseId = url.searchParams.get('course_id');

    if (!courseId) {
      return jsonError(400, "course_id is required");
    }

    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (!isStaff && !(await isEnrolled(env.DB, auth.payload.sub, courseId))) {
      return jsonError(403, "You are not enrolled in this course");
    }

    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
    const { total } = await queryOne(env.DB, `SELECT COUNT(*) as total FROM course_items WHERE course_id = ?`, [courseId]);
    const items = await queryAll(env.DB, `
      SELECT * FROM course_items
      WHERE course_id = ?
      ORDER BY sort_order ASC
      LIMIT ? OFFSET ?
    `, [courseId, limit, offset]);

    return new Response(JSON.stringify({
      success: true,
      items,
      pagination: { total, limit, offset, hasMore: total > offset + limit }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
```

`onRequestPost` 保持原逻辑，但替换认证样板（第 43-63 行）为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['admin']).ok) return jsonError(403, "Admin access required");
```

并删除不再使用的 `verifyJWT` import（已由上面新 import 替代）。

- [ ] **Step 4: 替换 catalog.js 认证样板（同模式）**

`functions/api/modules/courses/catalog.js`：
- 替换 import 行（第 1-2 行）为：

```js
import { verifyAuth, requireRole, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";
```

- GET（第 10-19 行认证块）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    // 查询所有已发布的课程
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
```

- POST（第 54-74 行认证+角色块）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['admin']).ok) return jsonError(403, "Admin access required");
```

- 删除两处 `const payload = await verifyJWT(...)` 后的 `payload` 依赖检查——POST 中 `payload.sub` 改为 `auth.payload.sub`

- [ ] **Step 5: 运行测试**

Run: `npx vitest run tests/api/modules/courses/items.test.js tests/api/modules/auth/role-boundaries.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add functions/api/modules/courses/items.js functions/api/modules/courses/catalog.js tests/api/modules/courses/items.test.js
git commit -m "fix(security): require auth+enrollment on courses/items GET; migrate catalog to requireAuth"
```

---

## Task 3: 考勤模块 IDOR 与缺失认证（stats / records / sessions/[id]）

**Files:**
- Modify: `functions/api/modules/attendance/stats.js`（GET 学生归属强制）
- Modify: `functions/api/modules/attendance/records.js`（GET 学生归属强制；POST 教师班级归属）
- Modify: `functions/api/modules/attendance/sessions/[id].js`（GET 补认证 + 班级成员校验）
- Test: `tests/api/modules/attendance/attendance-idor.test.js`

**Interfaces:**
- Consumes: `verifyAuth`、`requireRole`、`canManageClass`、`jsonError`、`clampLimit`、`clampOffset`
- Produces: 学生只能查自己的考勤；教师只能操作自己班主任的班级

- [ ] **Step 1: 写失败测试**

Create `tests/api/modules/attendance/attendance-idor.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet as statsGet } from '../../../../functions/api/modules/attendance/stats.js';
import { onRequestGet as recordsGet } from '../../../../functions/api/modules/attendance/records.js';
import { onRequestGet as sessionGet } from '../../../../functions/api/modules/attendance/sessions/[id].js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '002-attendance.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl1','CL1','t1')").run();
  await db.prepare("INSERT INTO class_members (class_id, student_id) VALUES ('cl1','s1')").run();
  await db.prepare("INSERT INTO class_sessions (id, class_id, title, created_by, session_date) VALUES ('se1','cl1','Sess','t1','2026-08-01')").run();
  return db;
}

async function call(handler, db, url, token, params = {}) {
  const request = new Request(url, { headers: { Authorization: token ? `Bearer ${token}` : {} } });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params });
}

describe('attendance IDOR', () => {
  it('anonymous cannot read session detail', async () => {
    const db = await seed();
    const res = await call(sessionGet, db, 'http://x/api/modules/attendance/sessions/se1', null, { id: 'se1' });
    expect(res.status).toBe(401);
  });

  it('student can read own class session detail', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(sessionGet, db, 'http://x/api/modules/attendance/sessions/se1', token, { id: 'se1' });
    expect(res.status).toBe(200);
  });

  it('student cannot read another class session detail', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO classes (id, name, advisor_id) VALUES ('cl2','CL2','t2')").run();
    await db.prepare("INSERT INTO class_sessions (id, class_id, title, created_by, session_date) VALUES ('se2','cl2','Sess2','t2','2026-08-02')").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(sessionGet, db, 'http://x/api/modules/attendance/sessions/se2', token, { id: 'se2' });
    expect(res.status).toBe(403);
  });

  it('student stats forced to own student_id even when querying others', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO class_members (class_id, student_id) VALUES ('cl1','s2')").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(statsGet, db, 'http://x/api/modules/attendance/stats?class_id=cl1&student_id=s2', token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.students).toHaveLength(1);
    expect(body.stats.students[0].student_id).toBe('s1');
  });

  it('teacher who is not advisor cannot view any class stats', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(statsGet, db, 'http://x/api/modules/attendance/stats?class_id=cl1', token);
    expect(res.status).toBe(403);
  });

  it('records GET forces own student_id for students', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO attendance_records (id, class_session_id, student_id, status, recorded_by, recorded_at) VALUES ('r1','se1','s1','present','t1','2026-08-01T10:00:00Z')").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(recordsGet, db, 'http://x/api/modules/attendance/records?student_id=s1&session_id=se1', token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0].student_id).toBe('s1');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/api/modules/attendance/attendance-idor.test.js`
Expected: FAIL — 匿名请求返回 200、越权请求返回 200

- [ ] **Step 3: 修改 sessions/[id].js GET**

`functions/api/modules/attendance/sessions/[id].js` — 替换 import（第 1-2 行）：

```js
import { verifyAuth, requireRole, jsonError } from "../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId } from "../../../../_shared/db.js";
```

替换 `onRequestGet` 开头（第 6-9 行）为：

```js
  try {
    const { env, params } = context;
    const { id } = params;

    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const session = await queryOne(env.DB, `
      SELECT cs.*, u.nickname as created_by_name, c.name as class_name,
        (SELECT COUNT(*) FROM attendance_records ar WHERE ar.class_session_id = cs.id AND ar.status = 'present') as present_count,
        (SELECT COUNT(*) FROM attendance_records ar WHERE ar.class_session_id = cs.id) as total_recorded,
        (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = cs.class_id) as total_students
      FROM class_sessions cs
      JOIN users u ON cs.created_by = u.id
      JOIN classes c ON cs.class_id = c.id
      WHERE cs.id = ?
    `, [id]);

    if (!session) {
      return jsonError(404, "Session not found");
    }

    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (!isStaff) {
      const member = await queryOne(env.DB,
        'SELECT 1 as x FROM class_members WHERE class_id = ? AND student_id = ?',
        [session.class_id, auth.payload.sub]);
      if (!member) return jsonError(403, "Forbidden");
    }
```

（原文件第 10-23 行的查询与 404 检查原样保留，本步只改认证开头并在 404 检查后插入归属检查；后续 `topics` 查询与返回保持不变。）

- [ ] **Step 4: 修改 stats.js GET**

`functions/api/modules/attendance/stats.js` — 替换 import（第 1-2 行）：

```js
import { verifyAuth, requireRole, canManageClass, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne } from "../../../_shared/db.js";
```

替换认证块（第 10-19 行）为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const classId = url.searchParams.get("class_id");
    let studentId = url.searchParams.get("student_id");

    if (!classId) {
      return jsonError(400, "class_id is required");
    }

    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (isStaff) {
      if (!requireRole(auth.roles, ['admin']).ok && !(await canManageClass(env.DB, auth.payload.sub, classId))) {
        return jsonError(403, "You do not manage this class");
      }
    } else {
      // 学生只能查询自己的考勤
      studentId = auth.payload.sub;
      const member = await queryOne(env.DB,
        'SELECT 1 as x FROM class_members WHERE class_id = ? AND student_id = ?',
        [classId, auth.payload.sub]);
      if (!member) return jsonError(403, "You are not a member of this class");
    }
```

（原第 21-22 行的 `classId`/`studentId` 声明行删除，已上移。）

- [ ] **Step 5: 修改 records.js GET + POST**

`functions/api/modules/attendance/records.js` — 替换 import（第 1-2 行）：

```js
import { verifyAuth, requireRole, canManageClass, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, batch, generateId, now } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";
```

GET 认证块（第 10-19 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const sessionId = url.searchParams.get("session_id");
    let studentId = url.searchParams.get("student_id");

    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (!isStaff) {
      // 学生只能查询自己的考勤记录
      studentId = auth.payload.sub;
    }
    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
```

POST 认证+角色块（第 59-74 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) {
      return jsonError(403, "Teacher, advisor, or admin access required");
    }

    const body = await request.json();
    const { session_id, records } = body;

    if (!session_id || !Array.isArray(records) || records.length === 0) {
      return jsonError(400, "session_id and non-empty records array required");
    }

    const session = await queryOne(env.DB, 'SELECT id, class_id FROM class_sessions WHERE id = ?', [session_id]);
    if (!session) {
      return jsonError(404, "Session not found");
    }

    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageClass(env.DB, auth.payload.sub, session.class_id))) {
      return jsonError(403, "You do not manage this class");
    }
```

（原 76-88 行的重复校验删除；`payload.sub` 出现处改为 `auth.payload.sub`。）

- [ ] **Step 6: 运行测试**

Run: `npx vitest run tests/api/modules/attendance/attendance-idor.test.js`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add functions/api/modules/attendance/
git commit -m "fix(security): close attendance IDOR - force own student_id, require class ownership"
```

---

## Task 4: 考试完整性（questions / start / submit）

**Files:**
- Modify: `functions/api/modules/assessments/[id]/questions.js`（GET 选课+状态校验）
- Modify: `functions/api/modules/assessments/[id]/start.js`（选课校验、时间窗前移、重考上限）
- Modify: `functions/api/modules/assessments/[id]/submit.js`（服务端时限）
- Test: `tests/api/modules/assessments/assessment-integrity.test.js`

**Interfaces:**
- Consumes: `verifyAuth`、`requireRole`、`isEnrolled`、`jsonError`
- Produces: 未选课学生无法拉题/开考/提交；重考 ≤3 次；超时拒绝提交

- [ ] **Step 1: 写失败测试**

Create `tests/api/modules/assessments/assessment-integrity.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet as qGet } from '../../../../functions/api/modules/assessments/[id]/questions.js';
import { onRequestGet as startGet } from '../../../../functions/api/modules/assessments/[id]/start.js';
import { onRequestPost as submitPost } from '../../../../functions/api/modules/assessments/[id]/submit.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '009-assessments.sql', '011-assessment-retakes.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C','published','t1')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  await db.prepare("INSERT INTO assessments (id, course_id, title, status, duration_minutes, created_by) VALUES ('a1','c1','Quiz','published',60,'t1')").run();
  await db.prepare("INSERT INTO assessment_questions (id, assessment_id, question_text, question_type, correct_answer, points, sort_order) VALUES ('q1','a1','Q1','multiple_choice','B',10,0)").run();
  return db;
}

function call(handler, db, url, token, params = {}, method = 'GET', body = null) {
  const init = { method, headers: { Authorization: token ? `Bearer ${token}` : {} } };
  if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const request = new Request(url, init);
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params });
}

describe('assessment integrity', () => {
  it('unenrolled student cannot fetch questions', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(qGet, db, 'http://x/a1/questions', token, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('enrolled student cannot fetch questions before starting', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(qGet, db, 'http://x/a1/questions', token, { id: 'a1' });
    expect(res.status).toBe(400);
  });

  it('enrolled student can fetch questions with in_progress submission', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, is_latest, attempt_number) VALUES ('sub1','a1','s1','in_progress',1,1)").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(qGet, db, 'http://x/a1/questions', token, { id: 'a1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions[0].correct_answer).toBeUndefined();
  });

  it('unenrolled student cannot start assessment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(startGet, db, 'http://x/a1/start', token, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('retake blocked after max attempts (3)', async () => {
    const db = await seed();
    for (let i = 1; i <= 3; i++) {
      await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, is_latest, attempt_number) VALUES (?, 'a1','s1','graded',0,?)").run();
    }
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(startGet, db, 'http://x/a1/start', token, { id: 'a1' });
    expect(res.status).toBe(403);
  });

  it('draft assessment cannot be started by student', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO assessments (id, course_id, title, status, created_by) VALUES ('a2','c1','Draft','draft','t1')").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(startGet, db, 'http://x/a2/start', token, { id: 'a2' });
    expect(res.status).toBe(403);
  });

  it('submit rejected when over duration limit', async () => {
    const db = await seed();
    await db.prepare("INSERT INTO assessment_submissions (id, assessment_id, student_id, status, is_latest, attempt_number, started_at) VALUES ('sub2','a1','s1','in_progress',1,1,'2026-08-01T00:00:00.000Z')").run();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(submitPost, db, 'http://x/a1/submit', token, { id: 'a1' }, 'POST', { answers: [{ question_id: 'q1', selected_option: 'B' }] });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/api/modules/assessments/assessment-integrity.test.js`
Expected: FAIL — 未选课学生返回 200

- [ ] **Step 3: 修改 questions.js GET**

`functions/api/modules/assessments/[id]/questions.js` — 替换 import（第 1-2 行）：

```js
import { verifyAuth, requireRole, isEnrolled, jsonError } from "../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId } from "../../../../_shared/db.js";
```

替换 `onRequestGet`（第 4-25 行）为：

```js
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const assessment = await queryOne(env.DB, `SELECT * FROM assessments WHERE id = ?`, [params.id]);
    if (!assessment) return jsonError(404, "Assessment not found");

    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (!isStaff) {
      if (assessment.status !== 'published') return jsonError(403, "Assessment is not available");
      if (!(await isEnrolled(env.DB, auth.payload.sub, assessment.course_id))) return jsonError(403, "You are not enrolled in this course");
      const started = await queryOne(env.DB,
        `SELECT id FROM assessment_submissions WHERE assessment_id = ? AND student_id = ? AND status = 'in_progress' AND is_latest = 1`,
        [params.id, auth.payload.sub]);
      if (!started) return jsonError(400, "Start the assessment first");
    }

    let questions = await queryAll(env.DB, `SELECT * FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order`, [params.id]);
    if (!isStaff) {
      questions = questions.map(function(q) { delete q.correct_answer; delete q.explanation; return q; });
    }
    return new Response(JSON.stringify({ success: true, assessment, questions }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
```

`onRequestPost` 认证块（第 30-36 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
```

- [ ] **Step 4: 修改 start.js**

`functions/api/modules/assessments/[id]/start.js` — 替换 import（第 1-2 行）：

```js
import { verifyAuth, requireRole, isEnrolled, jsonError } from "../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId } from "../../../../_shared/db.js";
```

文件顶部加常量：

```js
const MAX_ATTEMPTS = 3;
```

替换 `onRequestGet` 主体为：

```js
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const assessment = await queryOne(env.DB, `SELECT * FROM assessments WHERE id = ?`, [params.id]);
    if (!assessment) return jsonError(404, "Assessment not found");

    const isStaff = requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok;
    if (!isStaff) {
      if (assessment.status !== 'published') return jsonError(403, "Assessment is not available");
      if (!(await isEnrolled(env.DB, auth.payload.sub, assessment.course_id))) return jsonError(403, "You are not enrolled in this course");
    }

    // 时间窗检查对所有人（含重考）生效
    if (assessment.available_from && new Date() < new Date(assessment.available_from)) return jsonError(400, "Not yet available");
    if (assessment.available_until && new Date() > new Date(assessment.available_until)) return jsonError(400, "No longer available");

    const existing = await queryOne(env.DB, `SELECT * FROM assessment_submissions WHERE assessment_id = ? AND student_id = ? AND is_latest = 1`, [params.id, auth.payload.sub]);
    if (existing && existing.status === 'in_progress') return new Response(JSON.stringify({ error: "Already started", submission: existing }), { status: 400, headers: { "Content-Type": "application/json" } });
    if (existing && (existing.status === 'submitted' || existing.status === 'graded')) {
      if (!isStaff && (existing.attempt_number || 1) >= MAX_ATTEMPTS) {
        return jsonError(403, "Maximum attempts reached");
      }
      await execute(env.DB, `UPDATE assessment_submissions SET is_latest = 0 WHERE id = ?`, [existing.id]);
      const nextAttempt = (existing.attempt_number || 1) + 1;
      const subId = generateId();
      await execute(env.DB, `INSERT INTO assessment_submissions (id, assessment_id, student_id, status, attempt_number, is_latest) VALUES (?, ?, ?, 'in_progress', ?, 1)`, [subId, params.id, auth.payload.sub, nextAttempt]);
      const questions = await queryAll(env.DB, `SELECT id, question_text, question_type, options, points, sort_order FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order`, [params.id]);
      return new Response(JSON.stringify({ success: true, submission_id: subId, attempt_number: nextAttempt, questions }), { headers: { "Content-Type": "application/json" } });
    }
    const subId = generateId();
    await execute(env.DB, `INSERT INTO assessment_submissions (id, assessment_id, student_id, status) VALUES (?, ?, ?, 'in_progress')`, [subId, params.id, auth.payload.sub]);
    const questions = await queryAll(env.DB, `SELECT id, question_text, question_type, options, points, sort_order FROM assessment_questions WHERE assessment_id = ? ORDER BY sort_order`, [params.id]);
    return new Response(JSON.stringify({ success: true, submission_id: subId, questions }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
```

- [ ] **Step 5: 修改 submit.js（服务端时限）**

`functions/api/modules/assessments/[id]/submit.js` — 替换 import（第 1-2 行）：

```js
import { verifyAuth, jsonError } from "../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../../_shared/db.js";
```

文件顶部加辅助函数：

```js
// 兼容空格格式（datetime('now')）与 ISO 格式两种时间戳
function toMs(value) {
  if (!value) return null;
  const s = String(value);
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}
```

替换 `onRequestPost` 认证块（第 7-10 行）与时限检查（第 11 行后插入）：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const submission = await queryOne(env.DB, `SELECT * FROM assessment_submissions WHERE assessment_id = ? AND student_id = ? AND is_latest = 1`, [params.id, auth.payload.sub]);
    if (!submission) return jsonError(400, "No submission found. Start the exam first.");
    if (submission.status === 'graded' || submission.status === 'submitted') return jsonError(400, "Already submitted");

    // 服务端时限校验：started_at + duration_minutes
    const assessment = await queryOne(env.DB, `SELECT duration_minutes FROM assessments WHERE id = ?`, [params.id]);
    if (assessment && assessment.duration_minutes) {
      const started = toMs(submission.started_at);
      if (started !== null && Date.now() > started + assessment.duration_minutes * 60000) {
        return jsonError(400, "Time limit exceeded");
      }
    }
```

（`payload.sub` 其余出现处改为 `auth.payload.sub`。）

- [ ] **Step 6: 运行测试**

Run: `npx vitest run tests/api/modules/assessments/`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add functions/api/modules/assessments/ tests/api/modules/assessments/
git commit -m "fix(security): enforce enrollment, published status, attempt cap and server-side duration on assessments"
```

---

## Task 5: 内容边界过滤（assignments / videos / interactions）

**Files:**
- Modify: `functions/api/modules/assignments/index.js`（GET 学生选课过滤 + POST 教师归属）
- Modify: `functions/api/modules/assignments/[id]/submit.js`（选课校验）
- Modify: `functions/api/modules/videos/index.js`（GET 学生选课过滤 + POST 教师归属）
- Modify: `functions/api/modules/videos/[id].js`（GET 选课校验 + DELETE 教师归属）
- Modify: `functions/api/modules/interactions/questions.js`（GET 学生选课过滤）
- Modify: `functions/api/modules/interactions/highlights/[id]/replies.js`（GET 可见性校验）
- Test: `tests/api/modules/content-boundaries.test.js`

- [ ] **Step 1: 写失败测试**

Create `tests/api/modules/content-boundaries.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../helpers/setup-db.js';
import { signJWT } from '../../../functions/_utils/jwt.js';
import { onRequestGet as assignmentsGet } from '../../../functions/api/modules/assignments/index.js';
import { onRequestPost as assignmentSubmit } from '../../../functions/api/modules/assignments/[id]/submit.js';
import { onRequestGet as videosGet } from '../../../functions/api/modules/videos/index.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '007-assignments.sql', '008-videos.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s2','s2@b.c','S2','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t1')").run();
  await db.prepare("INSERT INTO enrollments (id, student_id, course_id, status) VALUES ('e1','s1','c1','active')").run();
  await db.prepare("INSERT INTO assignments (id, course_id, title, status, created_by) VALUES ('a1','c1','HW1','published','t1')").run();
  await db.prepare("INSERT INTO assignments (id, course_id, title, status, created_by) VALUES ('a2','c2','HW2','published','t1')").run();
  await db.prepare("INSERT INTO video_lessons (id, course_id, title, status, video_url, created_by) VALUES ('v1','c1','V1','published','https://x/1.mp4','t1')").run();
  await db.prepare("INSERT INTO video_lessons (id, course_id, title, status, video_url, created_by) VALUES ('v2','c2','V2','published','https://x/2.mp4','t1')").run();
  return db;
}

function call(handler, db, url, token, method = 'GET', body = null, params = {}) {
  const init = { method, headers: { Authorization: token ? `Bearer ${token}` : {} } };
  if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request: new Request(url, init), params });
}

describe('content boundaries', () => {
  it('student sees only enrolled-course assignments', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(assignmentsGet, db, 'http://x/api/modules/assignments', token);
    const body = await res.json();
    expect(body.assignments.map(a => a.id).sort()).toEqual(['a1']);
  });

  it('teacher sees all assignments', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(assignmentsGet, db, 'http://x/api/modules/assignments', token);
    const body = await res.json();
    expect(body.assignments).toHaveLength(2);
  });

  it('unenrolled student cannot submit to assignment', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(assignmentSubmit, db, 'http://x/a2/submit', token, 'POST', { content: 'x' }, { id: 'a2' });
    expect(res.status).toBe(403);
  });

  it('student sees only enrolled-course videos', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 's1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(videosGet, db, 'http://x/api/modules/videos', token);
    const body = await res.json();
    expect(body.videos.map(v => v.id).sort()).toEqual(['v1']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/api/modules/content-boundaries.test.js`
Expected: FAIL — 学生列表返回 2 条

- [ ] **Step 3: 修改 assignments/index.js**

import（第 1-2 行）替换为：

```js
import { verifyAuth, requireRole, canManageCourse, isEnrolled, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now, batch } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";
```

GET：认证块（第 8-11 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const courseId = url.searchParams.get("course_id");
    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
    let sql = `SELECT a.*, c.title as course_title FROM assignments a JOIN courses c ON a.course_id = c.id WHERE 1=1`;
    let countSql = `SELECT COUNT(*) as total FROM assignments a WHERE 1=1`;
    let params = [];
    let countParams = [];
    if (courseId) { sql += ` AND a.course_id = ?`; params.push(courseId); countSql += ` AND a.course_id = ?`; countParams.push(courseId); }
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) {
      sql += ` AND a.course_id IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')`;
      countSql += ` AND a.course_id IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')`;
      params.push(auth.payload.sub);
      countParams.push(auth.payload.sub);
    }
```

POST：认证+角色块（第 34-40 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const { course_id, title, type, description, due_date, max_score, late_penalty } = await request.json();
    if (!course_id || !title) return jsonError(400, "course_id and title are required");
    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageCourse(env.DB, auth.payload.sub, course_id))) {
      return jsonError(403, "You do not manage this course");
    }
```

（`payload.sub` 出现处改为 `auth.payload.sub`。）

- [ ] **Step 4: 修改 assignments/[id]/submit.js**

import（第 1-2 行）替换为：

```js
import { verifyAuth, isEnrolled, jsonError } from "../../../../_utils/requireAuth.js";
import { queryOne, execute, generateId } from "../../../../_shared/db.js";
```

认证块（第 7-10 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const { content } = await request.json();
    const assignment = await queryOne(env.DB, `SELECT * FROM assignments WHERE id = ?`, [params.id]);
    if (!assignment) return jsonError(404, "Assignment not found");
    if (!(await isEnrolled(env.DB, auth.payload.sub, assignment.course_id))) {
      return jsonError(403, "You are not enrolled in this course");
    }
```

（`payload.sub` 其余出现处改为 `auth.payload.sub`。）

- [ ] **Step 5: 修改 videos/index.js 与 videos/[id].js**

`videos/index.js` import 替换为：

```js
import { verifyAuth, requireRole, canManageCourse, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";
```

GET 认证块（第 8-11 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const courseId = url.searchParams.get("course_id");
    const classId = url.searchParams.get("class_id");
    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
    let sql = `SELECT * FROM video_lessons WHERE status = 'published'`;
    let countSql = `SELECT COUNT(*) as total FROM video_lessons WHERE status = 'published'`;
    let params = [];
    let countParams = [];
    if (courseId) { sql += ` AND course_id = ?`; params.push(courseId); countSql += ` AND course_id = ?`; countParams.push(courseId); }
    if (classId) { sql += ` AND class_id = ?`; params.push(classId); countSql += ` AND class_id = ?`; countParams.push(classId); }
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) {
      sql += ` AND course_id IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')`;
      countSql += ` AND course_id IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')`;
      params.push(auth.payload.sub);
      countParams.push(auth.payload.sub);
    }
```

POST 认证+角色块（第 36-42 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const { course_id, class_id, title, video_url, thumbnail_url, duration_minutes, video_type } = await request.json();
    if (!title || !video_url) return jsonError(400, "title and video_url are required");
    if (course_id && !requireRole(auth.roles, ['admin']).ok && !(await canManageCourse(env.DB, auth.payload.sub, course_id))) {
      return jsonError(403, "You do not manage this course");
    }
```

`videos/[id].js`：import 替换为：

```js
import { verifyAuth, requireRole, isEnrolled, canManageCourse, jsonError } from "../../../_utils/requireAuth.js";
import { queryOne, execute } from "../../../_shared/db.js";
```

GET 认证块（第 7-10 行）替换为：

```js
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const video = await queryOne(env.DB, `SELECT * FROM video_lessons WHERE id = ?`, [params.id]);
    if (!video) return jsonError(404, "Video not found");
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok && !(await isEnrolled(env.DB, auth.payload.sub, video.course_id))) {
      return jsonError(403, "You are not enrolled in this course");
    }
```

DELETE 认证+角色块（第 24-30 行）替换为：

```js
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const video = await queryOne(env.DB, `SELECT course_id FROM video_lessons WHERE id = ?`, [params.id]);
    if (!video) return jsonError(404, "Video not found");
    if (video.course_id && !requireRole(auth.roles, ['admin']).ok && !(await canManageCourse(env.DB, auth.payload.sub, video.course_id))) {
      return jsonError(403, "You do not manage this course");
    }
```

- [ ] **Step 6: 修改 interactions/questions.js 与 highlights/[id]/replies.js**

`interactions/questions.js` import 替换为：

```js
import { verifyAuth, requireRole, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";
import { clampLimit, clampOffset } from "../../../_utils/params.js";
```

GET 认证块（第 13-22 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
```

并在 `whereStr` 构造后（第 43 行后）插入学生过滤：

```js
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) {
      whereClauses.push("q.course_id IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')");
      params.push(auth.payload.sub);
    }
    const whereStr = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

    const limit = clampLimit(url.searchParams.get('limit'));
    const offset = clampOffset(url.searchParams.get('offset'));
```

`interactions/highlights/[id]/replies.js` GET：import 替换为：

```js
import { verifyAuth, jsonError } from "../../../../../_utils/requireAuth.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../../../_shared/db.js";
```

GET 认证块（第 10-19 行）替换为：

```js
    const auth = await verifyAuth(env.DB, context.request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const highlight = await queryOne(env.DB, 'SELECT id, user_id, visibility FROM highlights WHERE id = ?', [highlightId]);
    if (!highlight) return jsonError(404, "Highlight not found");
    // 与 POST 相同的可见性判定：私有高亮仅作者可见
    if (highlight.visibility === 'private' && highlight.user_id !== auth.payload.sub) {
      return jsonError(403, "Cannot view private highlight");
    }
```

POST 认证块（第 50-59 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
```

（POST 中 `payload.sub` 出现处改为 `auth.payload.sub`；GET 中原 `const replies` 查询保留。）

- [ ] **Step 7: 运行测试**

Run: `npx vitest run tests/api/modules/content-boundaries.test.js`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add functions/api/modules/assignments/ functions/api/modules/videos/ functions/api/modules/interactions/ tests/api/modules/content-boundaries.test.js
git commit -m "fix(security): filter lists by enrollment, enforce course ownership on writes"
```

---

## Task 6: 教师写操作归属校验（grade ×2 / attendance 写 / 其他）

**Files:**
- Modify: `functions/api/modules/assignments/submissions/[id]/grade.js`
- Modify: `functions/api/modules/assessments/submissions/[id]/grade.js`（同模式）
- Modify: `functions/api/modules/attendance/sessions.js`（POST）
- Modify: `functions/api/modules/attendance/sessions/[id].js`（PUT）
- Modify: `functions/api/modules/classes/enroll.js`、`functions/api/modules/classes/assign-course.js`（advisor 归属）
- Modify: `functions/api/modules/reports/index.js`（评语归属）
- Test: `tests/api/modules/grade-ownership.test.js`

- [ ] **Step 1: 写失败测试**

Create `tests/api/modules/grade-ownership.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../helpers/setup-db.js';
import { signJWT } from '../../../functions/_utils/jwt.js';
import { onRequestPost as gradeAssignment } from '../../../functions/api/modules/assignments/submissions/[id]/grade.js';

const SECRET = 'test-secret';
const MIGRATIONS = ['001_init.sql', '007-assignments.sql'];

async function seed() {
  const db = await setupTestDB(MIGRATIONS);
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t1','t@b.c','T','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('t2','t2@b.c','T2','h','s','[\"teacher\"]')").run();
  await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('s1','s@b.c','S','h','s','[\"student\"]')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C1','published','t1')").run();
  await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C2','published','t2')").run();
  await db.prepare("INSERT INTO assignments (id, course_id, title, status, created_by) VALUES ('a1','c1','HW','published','t1')").run();
  await db.prepare("INSERT INTO assignment_submissions (id, assignment_id, student_id, content, status) VALUES ('sub1','a1','s1','x','submitted')").run();
  return db;
}

function call(handler, db, url, token, body, params) {
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return handler({ env: { DB: db, JWT_SECRET: SECRET }, request, params });
}

describe('grade ownership', () => {
  it('teacher who does not own the course cannot grade submission', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't2', exp: Date.now() + 60000 }, SECRET);
    const res = await call(gradeAssignment, db, 'http://x/sub1/grade', token, { score: 90 }, { id: 'sub1' });
    expect(res.status).toBe(403);
  });

  it('owning teacher can grade submission', async () => {
    const db = await seed();
    const token = await signJWT({ sub: 't1', exp: Date.now() + 60000 }, SECRET);
    const res = await call(gradeAssignment, db, 'http://x/sub1/grade', token, { score: 90 }, { id: 'sub1' });
    expect(res.status).toBe(200);
    const row = await db.prepare('SELECT score FROM assignment_grades WHERE submission_id = ?').bind('sub1').first();
    expect(row.score).toBe(90);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/api/modules/grade-ownership.test.js`
Expected: FAIL — t2 返回 200

- [ ] **Step 3: 修改 assignments/submissions/[id]/grade.js**

import（第 1-2 行）替换为：

```js
import { verifyAuth, requireRole, canManageCourse, jsonError } from "../../../../../_utils/requireAuth.js";
import { queryOne, execute, generateId } from "../../../../../_shared/db.js";
```

认证+角色块（第 7-13 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'admin']).ok) return jsonError(403, "Forbidden");
    const { score, feedback } = await request.json();
    if (score === undefined) return jsonError(400, "score is required");
    const submission = await queryOne(env.DB, `SELECT * FROM assignment_submissions WHERE id = ?`, [params.id]);
    if (!submission) return jsonError(404, "Submission not found");
    if (!requireRole(auth.roles, ['admin']).ok) {
      const assignment = await queryOne(env.DB, `SELECT course_id FROM assignments WHERE id = ?`, [submission.assignment_id]);
      if (!assignment || !(await canManageCourse(env.DB, auth.payload.sub, assignment.course_id))) {
        return jsonError(403, "You do not manage this course");
      }
    }
```

（`payload.sub` 其余出现处改为 `auth.payload.sub`。）

- [ ] **Step 4: 同模式修改 assessments/submissions/[id]/grade.js**

读 `functions/api/modules/assessments/submissions/[id]/grade.js` 后按同样模式：
- import 换 requireAuth
- 认证块换 `verifyAuth`
- 角色校验后，查 `assessment_submissions` 行 → 查 `assessments.course_id` → `canManageCourse`（admin 跳过）
- `payload.sub` → `auth.payload.sub`

- [ ] **Step 5: attendance 写操作 + classes/reports 归属**

`sessions.js` POST（约 74-78 行角色校验处）加：

```js
    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageClass(env.DB, auth.payload.sub, body.class_id))) {
      return jsonError(403, "You do not manage this class");
    }
```

`sessions/[id].js` PUT：在 `existing` 校验后加：

```js
    const session = await queryOne(env.DB, 'SELECT class_id FROM class_sessions WHERE id = ?', [id]);
    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageClass(env.DB, auth.payload.sub, session.class_id))) {
      return jsonError(403, "You do not manage this class");
    }
```

`classes/enroll.js`：在 `classId`/`studentIds` 校验后加：

```js
    if (studentIds.length > 100) return jsonError(400, "Too many students (max 100)");
    if (!requireRole(auth.roles, ['admin']).ok && !(await canManageClass(env.DB, auth.payload.sub, classId))) {
      return jsonError(403, "You do not manage this class");
    }
```

`classes/assign-course.js`：同样加数组/归属校验（body 是 `{ classId, courseId }`，无数组——只加归属校验）。

`reports/index.js`（约 110-128 行评语 POST）：先读该文件确认结构，然后：校验学生存在 + 教师与课程/班级归属（用 `enrollments` 判断学生是否在该课程中；教师用 `canManageCourse` 或 `classes.advisor_id`，admin 跳过）。

- [ ] **Step 6: 运行测试**

Run: `npx vitest run tests/api/modules/grade-ownership.test.js tests/api/modules/attendance/attendance-idor.test.js`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add functions/api/modules/assignments/submissions/ functions/api/modules/assessments/submissions/ functions/api/modules/attendance/sessions.js functions/api/modules/classes/ tests/api/modules/grade-ownership.test.js
git commit -m "fix(security): require course/class ownership for teacher write operations"
```

---

## Task 7: 批量/分页/限速收尾（migrate-users 开关、migrate 上限、certificates、progress、rate-limit）

**Files:**
- Modify: `functions/api/admin/migrate-users.js`（环境变量开关）
- Modify: `functions/api/modules/students/migrate.js`（条目上限 + 参数化 now()）
- Modify: `functions/api/modules/certificates/index.js`（申请选课校验）
- Modify: `functions/api/modules/students/progress.js`（POST item 归属校验）
- Modify: `functions/_utils/rate-limit.js`（去掉密钥字符串比对，改 ENVIRONMENT）
- Modify: `tests/helpers/mock-env.js`（加 `ENVIRONMENT: 'test'`）
- Test: `tests/_utils/rate-limit.test.js`

- [ ] **Step 1: 写失败测试（rate-limit）**

Create `tests/_utils/rate-limit.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rateLimit } from '../../functions/_utils/rate-limit.js';
import { createMockEnv } from '../helpers/mock-env.js';

describe('rateLimit', () => {
  it('applies limit in test env', async () => {
    const env = createMockEnv();
    let last;
    for (let i = 0; i < 5; i++) {
      last = await rateLimit(env, 'u:abc', 3, 60000);
    }
    expect(last.allowed).toBe(false);
  });

  it('does not bypass when JWT_SECRET equals old dev strings', async () => {
    const env = createMockEnv({ JWT_SECRET: 'a_very_long_secure_random_key_for_jwt_auth_1298471928' });
    let last;
    for (let i = 0; i < 5; i++) {
      last = await rateLimit(env, 'u:def', 3, 60000);
    }
    expect(last.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/_utils/rate-limit.test.js`
Expected: FAIL — 第一用例因 mock-env 无 ENVIRONMENT 且 JWT_SECRET='test-jwt-secret' 走真限速，但第二个用例在旧实现下会因字符串匹配被放宽为 10000 而 allowed=true

- [ ] **Step 3: 修改 rate-limit.js 与 mock-env.js**

`functions/_utils/rate-limit.js` 第 4-10 行替换为：

```js
  // 放宽本地开发与测试环境的频控限制（用 ENVIRONMENT 显式判定，不再依赖密钥字符串）
  const isDevOrTest = !env.JWT_SECRET || env.ENVIRONMENT === 'dev' || env.ENVIRONMENT === 'test';
  if (isDevOrTest) {
    limit = 10000;
  }
```

`tests/helpers/mock-env.js` 的 `createMockEnv` 返回对象中加：

```js
    ENVIRONMENT: 'test',
```

- [ ] **Step 4: 修改 migrate-users.js（开关）**

`functions/api/admin/migrate-users.js` 第 26-28 行角色校验后加：

```js
  if (env.MIGRATION_ENABLED !== 'true') {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
```

- [ ] **Step 5: 修改 students/migrate.js（上限 + 参数化）**

import 行改为：

```js
import { verifyAuth, jsonError } from "../../../_utils/requireAuth.js";
import { execute, generateId, batch, now } from "../../../_shared/db.js";
```

认证块（第 9-18 行）替换为：

```js
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
```

`answers` 循环前加：

```js
    if (answers && typeof answers === 'object') {
      const statements = [];

      let total = 0;
      for (const [itemId, questionAnswers] of Object.entries(answers)) {
        for (const [qIndex, answerText] of Object.entries(questionAnswers)) {
          if (total >= 500) break;
          if (!Number.isInteger(parseInt(qIndex, 10)) || parseInt(qIndex, 10) < 0) continue;
          const ts = now();
          statements.push({
            sql: `INSERT OR IGNORE INTO answers (id, student_id, item_id, question_index, answer_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            params: [generateId(), auth.payload.sub, itemId, parseInt(qIndex, 10), answerText, ts, ts]
          });
          total++;
        }
      }
```

（原循环体与 `${now()}` 内插删除，用 `ts` 参数。）

`progress` 段同理：数组超 500 截断，`${now()}` 内插改参数。

- [ ] **Step 6: 修改 certificates/index.js（选课校验）与 progress.js（item 归属）**

`certificates/index.js` POST 在 `existing` 检查之前（第 113 行前）加：

```js
    // 校验选课关系
    const enrolled = await queryOne(env.DB,
      "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'active'",
      [payload.sub, courseId]
    );
    if (!enrolled) {
      return new Response(JSON.stringify({ error: "You are not enrolled in this course" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
```

`students/progress.js` POST：在 `itemId`/`courseId`/`status` 校验后加：

```js
    // 服务端校验 item 归属课程
    const item = await queryOne(env.DB, 'SELECT id FROM course_items WHERE id = ? AND course_id = ?', [itemId, courseId]);
    if (!item) {
      return new Response(JSON.stringify({ error: "Invalid item for this course" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
```

（若学生未选课，progress 查询本身受限——GET 已按 `payload.sub` 过滤；POST 的 UPSERT 只写自己，风险点是伪造 itemId/score，上面校验已覆盖。）

- [ ] **Step 7: 运行测试**

Run: `npx vitest run tests/_utils/rate-limit.test.js`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add functions/_utils/rate-limit.js functions/api/admin/migrate-users.js functions/api/modules/students/ functions/api/modules/certificates/ tests/helpers/mock-env.js tests/_utils/rate-limit.test.js
git commit -m "fix(security): guard migrate endpoint, cap batch sizes, validate enrollment/item ownership, env-based rate limit"
```

---

## Task 8: 全量样板替换 sweep + 全量验证

**Files:**
- Modify: `functions/api/**/*.js`（除 Task 2-7 已改文件）——批量替换认证样板
- Test: 现有全部测试

- [ ] **Step 1: 列出剩余样板文件**

Run: `rg -l "verifyJWT" functions/api`
Expected: 输出 Task 2-7 未覆盖的文件清单（auth/signin、signup、user/profile、health 等）

对每个文件执行以下机械替换（相对路径按文件深度调整）：
- import 替换：`import { verifyJWT } from "<depth>/_utils/jwt.js";` → `import { verifyAuth, requireRole, jsonError } from "<depth>/_utils/requireAuth.js";`（按需加 `isEnrolled`/`canManageCourse`/`canManageClass`）
- 认证块（见 Task 2 的 before/after 模式）替换为 `verifyAuth`
- 角色检查块（`const user = await queryOne(env.DB, 'SELECT roles FROM users WHERE id = ?', [payload.sub]); const roles = JSON.parse(user.roles); if (!roles.includes(...))`）替换为 `requireRole(auth.roles, [...])`
- 删除不再使用的 `queryOne`/`verifyJWT` import
- 保留各端点原有的业务逻辑不变

**注意**：signin.js/signup.js 保持现状（认证端点本身不要求登录，只保留限速）；`health.js` 保持公开。

- [ ] **Step 2: 验证零残留**

Run: `rg -n "verifyJWT|JSON.parse\(user.roles\)" functions/api`
Expected: 0 匹配（除 requireAuth.js 内部对 verifyJWT 的引用——在 functions/_utils 下不属 functions/api）

- [ ] **Step 3: 给写端点加用户级限速**

Run: `rg -l "onRequestPost|onRequestPut|onRequestDelete" functions/api` 列出所有写端点，在 `verifyAuth` 之后加：

```js
    const rl = await rateLimit(env, 'w:' + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }
```

（import 加 `rateLimit` from `<depth>/_utils/rate-limit.js`；已限速的 signin/signup 不动。默认每用户 60 次/分钟。）

- [ ] **Step 4: 全量测试**

Run: `npm run test:unit`
Expected: 全部 PASS。若有失败：先修测试 mock（如 role-boundaries 的 `sql.includes('SELECT roles FROM users')` 匹配仍有效，因 verifyAuth 查询字符串与之一致），不修改业务代码来迁就测试。

- [ ] **Step 5: 冒烟验证**

Run: `npx wrangler pages dev` 并手动请求：
- `GET /api/modules/courses/items?course_id=x` 无 token → 401
- 学生 token 查未选课 course → 403
- 教师 token 批改非本人课程作业 → 403

- [ ] **Step 6: 提交并部署**

```bash
git add functions/ tests/
git commit -m "refactor(security): replace per-file auth boilerplate with shared requireAuth across all endpoints"
npx wrangler pages deploy
```

- [ ] **Step 7: 更新记忆**

更新 `.memory/sessions/_active.md`：记录 P1 完成、部署时间、`MIGRATION_ENABLED` 需要生产环境变量说明。

---

# Phase 2: 数据层

## Task 9: 迁移 014（时间戳统一 + 索引 + FK）

**Files:**
- Create: `migrations/014_timestamp_unify.sql`
- Test: `tests/migrations/014-timestamp-unify.test.js`

- [ ] **Step 1: 写失败测试**

Create `tests/migrations/014-timestamp-unify.test.js`：

```js
import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../../helpers/setup-db.js';

const MIGRATIONS = ['001_init.sql', '014_timestamp_unify.sql'];

describe('014 timestamp unification', () => {
  it('converts space-format timestamps to ISO in known tables', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c1','C','published','u1')").run();
    await db.prepare("INSERT INTO progress (id, student_id, course_id, item_id, status, started_at) VALUES ('p1','u1','c1','x1','started','2026-08-01 12:00:00')").run();
    const row = await db.prepare('SELECT started_at FROM progress WHERE id = ?').bind('p1').first();
    expect(row.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(row.started_at).not.toContain(' ');
  });

  it('leaves ISO timestamps untouched', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u2','b@b.c','B','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, status, created_by) VALUES ('c2','C','published','u2')").run();
    await db.prepare("INSERT INTO progress (id, student_id, course_id, item_id, status, started_at) VALUES ('p2','u2','c2','x2','started','2026-08-01T12:00:00.000Z')").run();
    const row = await db.prepare('SELECT started_at FROM progress WHERE id = ?').bind('p2').first();
    expect(row.started_at).toBe('2026-08-01T12:00:00.000Z');
  });

  it('creates required indexes', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const idx = await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_progress_item_id','idx_enrollments_class_id','idx_class_courses_course_id','idx_session_topics_session')").all();
    expect(idx.results).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/migrations/014-timestamp-unify.test.js`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 写迁移文件**

Create `migrations/014_timestamp_unify.sql`：

```sql
-- 统一时间戳格式：空格格式 (datetime('now')) → ISO 8601 (2026-08-01T12:00:00.000Z)
-- 幂等：WHERE 条件天然可重复执行
-- 执行前请先备份: wrangler d1 export DB_NAME --output backup.sql

UPDATE class_members SET joined_at = REPLACE(joined_at, ' ', 'T') || 'Z'
  WHERE joined_at NOT LIKE '%T%' AND joined_at <> '';

UPDATE answers SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE answers SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE progress SET started_at = REPLACE(started_at, ' ', 'T') || 'Z'
  WHERE started_at NOT LIKE '%T%' AND started_at <> '';
UPDATE progress SET completed_at = REPLACE(completed_at, ' ', 'T') || 'Z'
  WHERE completed_at NOT LIKE '%T%' AND completed_at <> '';

UPDATE notifications SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE users SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE users SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE courses SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE courses SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE course_items SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE classes SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE classes SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE class_courses SET assigned_at = REPLACE(assigned_at, ' ', 'T') || 'Z'
  WHERE assigned_at NOT LIKE '%T%' AND assigned_at <> '';

UPDATE enrollments SET enrolled_at = REPLACE(enrolled_at, ' ', 'T') || 'Z'
  WHERE enrolled_at NOT LIKE '%T%' AND enrolled_at <> '';

UPDATE class_sessions SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE class_sessions SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE attendance_records SET recorded_at = REPLACE(recorded_at, ' ', 'T') || 'Z'
  WHERE recorded_at NOT LIKE '%T%' AND recorded_at <> '';

UPDATE session_topics SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE assessment_submissions SET started_at = REPLACE(started_at, ' ', 'T') || 'Z'
  WHERE started_at NOT LIKE '%T%' AND started_at <> '';
UPDATE assessment_submissions SET submitted_at = REPLACE(submitted_at, ' ', 'T') || 'Z'
  WHERE submitted_at NOT LIKE '%T%' AND submitted_at <> '';

UPDATE assignment_submissions SET submitted_at = REPLACE(submitted_at, ' ', 'T') || 'Z'
  WHERE submitted_at NOT LIKE '%T%' AND submitted_at <> '';

UPDATE assignment_grades SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE questions SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';
UPDATE questions SET updated_at = REPLACE(updated_at, ' ', 'T') || 'Z'
  WHERE updated_at NOT LIKE '%T%' AND updated_at <> '';

UPDATE question_answers SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE certificates SET applied_at = REPLACE(applied_at, ' ', 'T') || 'Z'
  WHERE applied_at NOT LIKE '%T%' AND applied_at <> '';
UPDATE certificates SET approved_at = REPLACE(approved_at, ' ', 'T') || 'Z'
  WHERE approved_at NOT LIKE '%T%' AND approved_at <> '';

UPDATE reports SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE video_lessons SET created_at = REPLACE(created_at, ' ', 'T') || 'Z'
  WHERE created_at NOT LIKE '%T%' AND created_at <> '';

UPDATE video_watch_logs SET watched_at = REPLACE(watched_at, ' ', 'T') || 'Z'
  WHERE watched_at NOT LIKE '%T%' AND watched_at <> '';

-- 索引补齐（M9）
CREATE INDEX IF NOT EXISTS idx_progress_item_id ON progress(item_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_courses_course_id ON class_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_session_topics_session ON session_topics(class_session_id);
```

**注意**：执行前先跑 `PRAGMA table_info` 核对列名（`wrangler d1 execute --command "PRAGMA table_info(video_watch_logs)"`），如 `watched_at` 等列名不符则删掉对应 UPDATE；测试只验证确定存在的列。

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/migrations/014-timestamp-unify.test.js`
Expected: PASS

- [ ] **Step 5: 幂等化 011-013 迁移文件**

逐个读取 `migrations/011-assessment-retakes.sql`、`012-cascade-fixes.sql`、`013-submission-versions.sql`，对其中所有 `DROP TABLE` 加 `IF EXISTS`、所有重建 `CREATE TABLE` 加 `IF NOT EXISTS`（保持列定义不变）。并在 `docs/` 加迁移注意事项（D1 破坏性迁移需 `PRAGMA foreign_keys=OFF` 后执行）。

- [ ] **Step 6: FK 策略核对（L9）**

Run: `wrangler d1 execute brian-site-db --command "PRAGMA foreign_key_list(courses); PRAGMA foreign_key_list(classes);"`
核对 `courses.created_by`、`classes.advisor_id` 的 `on_delete`：无 `CASCADE`/`SET NULL` 策略时，在 014 末尾追加（SQLite 需重建表，见 011-013 的重建模式——复制该模式，仅改表结构为加 `ON DELETE SET NULL` 的 FK）：

```sql
-- 示例：classes.advisor_id 加 ON DELETE SET NULL（若缺失）
-- 重建 classes 表（按 011 的 _new 表 + 数据搬迁 + DROP 旧表模式，PRAGMA foreign_keys=OFF 下执行）
```

若核对结果为已有策略或重建风险高，跳过并记录到 `.memory/`（决策记录），不强行重建。

- [ ] **Step 7: 提交**

```bash
git add migrations/ docs/
git commit -m "feat(db): add 014 timestamp unification + indexes; make 011-013 idempotent"
```

- [ ] **Step 8: 生产应用（人工确认后执行）**

```bash
wrangler d1 export brian-site-db --output backup-before-014.sql
wrangler d1 migrations apply brian-site-db
wrangler d1 execute brian-site-db --command "SELECT COUNT(*) AS leftover FROM progress WHERE started_at LIKE '% %'"
# 期望 leftover = 0
```

- [ ] **Step 9: 部署并更新记忆**

```bash
npx wrangler pages deploy
```
更新 `.memory/sessions/_active.md` 与 `.memory/decisions/`（时间戳规范 ADR）。

---

# Phase 3: UX 核心闭环

## Task 10: 学生成绩页修复（grades/final.js course_id=all）

**Files:**
- Modify: `functions/api/modules/grades/final.js`
- Test: `tests/api/modules/grades/final-all.test.js`

- [ ] **Step 1: 写失败测试**

Create `tests/api/modules/grades/final-all.test.js`：seed 用户/课程/成绩，学生请求 `course_id=all` → 期望返回该学生全部课程成绩；教师请求 `course_id=all` → 400（教师必须指定课程）。

- [ ] **Step 2: 实现**

`final.js` 中 `courseId` 读取后改为：

```js
    const courseId = url.searchParams.get("course_id");
    const isTeacher = requireRole(roles, ['teacher', 'admin']).ok;
    let sql, params;
    if (courseId === 'all') {
      if (isTeacher) return jsonError(400, "Teachers must specify course_id");
      sql = "SELECT fg.*, c.title as course_title FROM final_grades fg JOIN courses c ON fg.course_id = c.id WHERE fg.student_id = ? ORDER BY c.title";
      params = [payload.sub];
    } else if (isTeacher) {
      sql = "SELECT fg.*, u.nickname as student_name FROM final_grades fg JOIN users u ON fg.student_id = u.id WHERE fg.course_id = ? ORDER BY u.nickname";
      params = [courseId];
    } else {
      sql = "SELECT fg.*, c.title as course_title FROM final_grades fg JOIN courses c ON fg.course_id = c.id WHERE fg.student_id = ? AND fg.course_id = ?";
      params = [payload.sub, courseId];
    }
```

（`course_title` 同时修复 M2 成绩卡片无课程名。）

- [ ] **Step 3: 运行测试 + 提交**

```bash
npx vitest run tests/api/modules/grades/
git add functions/api/modules/grades/ tests/api/modules/grades/
git commit -m "fix(ux): support course_id=all in grades/final and include course title"
```

## Task 11: 证书两端复活（后端审批 API + student/certificate.html + admin/reports.html）

**Files:**
- Create: `functions/api/modules/certificates/[id]/approve.js`、`functions/api/modules/certificates/[id]/reject.js`
- Modify: `course-app/student/certificate.html`
- Modify: `course-app/admin/reports.html`
- Test: `tests/api/modules/certificates/approve-reject.test.js`

- [ ] **Step 1: 新建后端审批/拒绝端点**

审计确认：certificates 模块只有 GET/POST（申请），**没有审批 API**——admin/reports.html 的批准/拒绝按钮无后端可调，这是证书流程断裂的一半原因。

Create `functions/api/modules/certificates/[id]/approve.js`：

```js
import { verifyAuth, requireRole, jsonError } from "../../../../../_utils/requireAuth.js";
import { queryOne, execute, now } from "../../../../../_shared/db.js";

// POST /api/modules/certificates/:id/approve - 批准证书
export async function onRequestPost(context) {
  try {
    const { env, params, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    if (!requireRole(auth.roles, ['teacher', 'advisor', 'admin']).ok) return jsonError(403, "Forbidden");

    const cert = await queryOne(env.DB, 'SELECT * FROM certificates WHERE id = ?', [params.id]);
    if (!cert) return jsonError(404, "Certificate not found");
    if (cert.status !== 'pending') return jsonError(400, "Only pending certificates can be approved");

    // 要求通过最终成绩（git log: fix(certificates) 已要求 passing final grade）
    const grade = await queryOne(env.DB,
      "SELECT letter_grade FROM final_grades WHERE student_id = ? AND course_id = ?",
      [cert.student_id, cert.course_id]);
    if (!grade || grade.letter_grade === 'F') {
      return jsonError(400, "Student has no passing final grade");
    }

    await execute(env.DB, "UPDATE certificates SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?",
      [auth.payload.sub, now(), params.id]);
    return new Response(JSON.stringify({ success: true, status: 'approved' }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
```

Create `functions/api/modules/certificates/[id]/reject.js`（同 approve 结构，仅改为）：

```js
    await execute(env.DB, "UPDATE certificates SET status = 'rejected', approved_by = ?, approved_at = ? WHERE id = ?",
      [auth.payload.sub, now(), params.id]);
    return new Response(JSON.stringify({ success: true, status: 'rejected' }), { headers: { "Content-Type": "application/json" } });
```

（若 `certificates` 表无 `approved_by` 列，先 `PRAGMA table_info(certificates)` 核对，缺则去掉该列写入。）

- [ ] **Step 2: 写测试**

Create `tests/api/modules/certificates/approve-reject.test.js`：seed 用户/课程/成绩/证书，验证：学生调 approve → 403；教师调 approve 且成绩通过 → 200 且状态 approved；F 成绩 → 400；reject → 200。

- [ ] **Step 3: 修 student/certificate.html**

将内联 `<script>` 替换为完整逻辑：加载用户昵称（保留）→ 加载进度（调 `/api/modules/students/progress?course_id=<id>`，更新 `#progress` 文本与 `#btn-apply.disabled`）→ 绑定 `#btn-apply` click：`fetch('/api/modules/certificates', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') }, body: JSON.stringify({ courseId }) })`，成功显示"已申请，等待审核"，失败显示后端错误。全部用 `textContent` 渲染。

- [ ] **Step 4: 修 admin/reports.html**

用 UTF-8 重写文件（修正乱码 `鎵瑰噯/鎷掔粷` → `批准/拒绝`）；加事件委托：

```js
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { id, action } = btn.dataset;
  const res = await fetch(`/api/modules/certificates/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') } });
  const data = await res.json();
  alert(data.success ? (action === 'approve' ? '已批准' : '已拒绝') : (data.error || '操作失败'));
  location.reload();
});
```

（按钮 dataset 值须为 `approve`/`reject` 以匹配新端点。）

- [ ] **Step 5: 验证 + 提交**

Run: `npx vitest run tests/api/modules/certificates/`；`npx wrangler pages dev` 打开两个页面，确认按钮可用、文案正常。

```bash
git add course-app/student/certificate.html course-app/admin/reports.html
git commit -m "fix(ux): revive certificate apply (student) and approve/reject (admin)"
```

## Task 12: 教师批改界面（admin/submissions.html 新建）

**Files:**
- Create: `course-app/admin/submissions.html`
- Modify: `course-app/admin/assignments.html`（"查看提交"链接指向新页）

- [ ] **Step 1: 新建 admin/submissions.html**

完整页面：侧栏布局（复制 `admin/attendance.html` 的侧栏结构）+ 主区两个视图：
1. 提交列表：`GET /api/modules/assignments/[id]/submissions`（页面上方课程/作业下拉，数据来自 `/api/modules/courses/catalog` + `/api/modules/assignments`），渲染学生名、提交时间、内容预览、状态
2. 评分表单：点"评分"展开 `POST /api/modules/assignments/submissions/[id]/grade`，输入 score + feedback，提交后刷新列表

所有渲染用 `textContent`；空列表显示"暂无提交"。

- [ ] **Step 2: 修改 admin/assignments.html**

"查看提交"链接由 `href="#"` 改为 `href="submissions.html?assignment_id=<id>"`，submissions.html 读取 `location.search` 自动选中该作业。

- [ ] **Step 3: 验证 + 提交**

Run: `npx wrangler pages dev` 走通 列表→评分→刷新。

```bash
git add course-app/admin/submissions.html course-app/admin/assignments.html
git commit -m "feat(ux): add teacher grading page for assignment submissions"
```

## Task 13: 导航骨架（admin 侧栏死链 + 考勤取消按钮 + admin/classes.html）

**Files:**
- Modify: `course-app/admin/attendance.html`（侧栏链接 + close-modal-btn-2 绑定）
- Create: `course-app/admin/classes.html`

- [ ] **Step 1: 修 admin/attendance.html 侧栏**

`href="#"` 的 5 项改为：仪表板→`dashboard.html`、作业管理→`assignments.html`、成绩管理→`grades.html`、班级管理→`classes.html`（本任务新建）、课程设置→删除该项（无页面）。

- [ ] **Step 2: 绑取消按钮**

`assets/js/attendance.js` 中 `close-modal-btn` 旁加：

```js
document.getElementById('close-modal-btn-2')?.addEventListener('click', closeCreateSessionModal);
```

（若函数名不同，先读 `assets/js/attendance.js` 核对。）

- [ ] **Step 3: 新建 admin/classes.html**

侧栏布局 + 三个区块：
1. 班级列表：`GET /api/modules/classes`（若 API 不同以 `rg "onRequestGet" functions/api/modules/classes/` 核对），显示名称/班主任/状态
2. 建班表单：`POST /api/modules/classes`（名称+描述）
3. 班级操作：选班级 → 添加学生（`POST /api/modules/classes/enroll`，studentIds 来自邮箱查询 `/api/modules/users?role=student` 或手动输入）→ 分配课程（`POST /api/modules/classes/assign-course`，课程下拉来自 `/api/modules/courses/catalog`）

- [ ] **Step 4: 验证 + 提交**

```bash
git add course-app/admin/
git commit -m "feat(ux): fix admin sidebar dead links, bind modal cancel, add classes management page"
```

## Task 14: 学生课程视角（student/courses.html + 分组 + 统一导航）

**Files:**
- Create: `functions/api/modules/courses/enrolled.js`（后端：我的已选课程）
- Create: `course-app/student/courses.html`
- Modify: `course-app/student/videos.html`、`assignments.html`（按课程分组 + 导航）
- Modify: `course-app/student/attendance.html`（侧栏外链修正 + 并入统一导航）
- Test: `tests/api/modules/courses/enrolled.test.js`

- [ ] **Step 1: 新建后端端点 GET /api/modules/courses/enrolled**

Create `functions/api/modules/courses/enrolled.js`：

```js
import { verifyAuth, requireRole, jsonError } from "../../../_utils/requireAuth.js";
import { queryAll } from "../../../_shared/db.js";

// GET /api/modules/courses/enrolled - 我的已选课程
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    const courses = await queryAll(env.DB, `
      SELECT c.*, u.nickname as creator_name, e.class_id, e.enrolled_at,
        (SELECT COUNT(*) FROM course_items WHERE course_id = c.id AND is_required = 1) as total_items,
        (SELECT COUNT(*) FROM progress WHERE course_id = c.id AND student_id = ? AND status = 'completed') as completed_items
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      JOIN users u ON c.created_by = u.id
      WHERE e.student_id = ? AND e.status = 'active' AND c.status = 'published'
      ORDER BY e.enrolled_at DESC
    `, [auth.payload.sub, auth.payload.sub]);

    return new Response(JSON.stringify({ success: true, courses }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
```

Create `tests/api/modules/courses/enrolled.test.js`：seed 已选/未选课程，验证只返回已选且 published 的课程，匿名 401。

- [ ] **Step 2: 新建 student/courses.html**

统一学生导航外壳（仪表盘/我的课程/作业/考核/成绩/证书）+ 我的课程卡片列表：`GET /api/modules/courses/enrolled`，每卡片显示标题/描述/进度（`completed_items/total_items`）/进入按钮。

- [ ] **Step 3: 课程详情视图**

courses.html 内课程详情区：加载该课程 `course_items`（`/api/modules/courses/items?course_id=`）分组展示视频/作业/考核入口（链接到 `videos.html?course_id=`, `assignments.html?course_id=`, `assessments.html?course_id=`）。

- [ ] **Step 4: videos/assignments 按课程分组 + 顶部导航**

列表渲染按 `course_title` 分组（数据已含），每页顶部加统一导航条（同 courses.html）。`student/attendance.html` 侧栏 `/organicchurch/...` 链接改为完整 URL `https://organicchurch.dpdns.org/...` 或移除；"全部课程"指向 `courses.html`。

- [ ] **Step 5: 验证 + 提交**

```bash
git add course-app/student/
git commit -m "feat(ux): add my-courses view with per-course grouping and unified student nav"
```

## Task 15: 提交反馈强化 + 登录分流 + 问答展示

**Files:**
- Modify: `course-app/student/assignments.html`、`assessments.html`（防重/状态/未答确认）
- Modify: `course-app/assets/js/auth.js` + `course-app/login.html`（角色分流）
- Modify: `course-app/student/questions.html`（回答展开）
- Modify: `course-app/index.html`（状态条真实化或移除 + API 块折叠）

- [ ] **Step 1: assignments.html**

提交按钮：提交时 `disabled` + 文案"提交中…"；`res.ok` 为 false 时恢复按钮并显示错误；提交成功后渲染卡片状态徽章（`.status-submitted/.status-graded` 已有样式）+ 分数（`/api/modules/assignments/submissions` 返回含 grade 时显示）；textarea 内容提交后保留至刷新。

- [ ] **Step 2: assessments.html**

`submitExam` 加 `res.ok` 检查（失败留在考试页并提示）；提交前统计未答数并 `confirm("还有 N 题未答，确定提交？")`；"重考"按钮加确认对话框（说明旧成绩将被新成绩覆盖）。

- [ ] **Step 3: 登录分流**

`assets/js/auth.js` 登录成功后按 `payload.roles` 跳转：`student` → `/student/dashboard.html`；`teacher`/`advisor`/`admin` → `/admin/dashboard.html`；其他 → `/`。

- [ ] **Step 4: questions.html 回答展示**

问题卡片下方展开区：`GET /api/modules/interactions/questions/[id]/answers`，渲染回答内容与作者；有官方回答时置顶。

- [ ] **Step 5: index.html**

状态条（"系统运行中"等）改为调用 `/api/health` 真实检测；API 端点列表折叠进 `<details>` "开发者"区块。

- [ ] **Step 6: 验证 + 提交**

```bash
git add course-app/
git commit -m "feat(ux): submission hardening, role-based login redirect, Q&A answers display"
```

- [ ] **Step 7: 全量验证 + 部署 P3**

```bash
npm run test:unit
npx wrangler pages deploy
```
更新 `.memory/sessions/_active.md`。

---

# Phase 4: UI 收敛到基准页

## Task 16: 共享样式层（course.css 扩展 + 令牌修复）

**Files:**
- Modify: `course-app/assets/css/course.css`（扩展为共享组件库）
- Modify: `brianinchrist/organicchurch/assets/css/vars.css`（补 `--transition`、加深 `--faint`）
- Modify: `course-app/assets/css/vars.css`（同步令牌修复）

- [ ] **Step 1: 修令牌**

`vars.css` 两处副本：
- 加 `--transition: 0.2s ease;`（M2）
- `--faint: #94866F` 改为 `#7A6C55`（M9，对比度 ≥4.5:1）
- 新增语义状态令牌（从 student/attendance.html 提升）：

```css
--status-late: #B8860B;       --status-late-bg: rgba(184, 134, 11, 0.10);
--status-absent: #8A3517;     --status-absent-bg: rgba(138, 53, 23, 0.10);
--status-excused: #4A7A9B;    --status-excused-bg: rgba(74, 122, 155, 0.10);
--status-pass: #4A6741;       --status-pass-bg: rgba(74, 103, 65, 0.12);
--status-fail: #8A3517;       --status-fail-bg: rgba(138, 53, 23, 0.12);
```

- [ ] **Step 2: course.css 加字体引入**

`course.css` 顶部加：

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@400;500;700&family=EB+Garamond:ital@0;1&display=swap');
```

（13 个未加载字体的页面开始引用 course.css 后即修复 H1。）

- [ ] **Step 3: 扩展 course.css 组件库**

从 `student/attendance.html` 提取并写全：`.app-shell`（侧栏+主区布局）、`.sidebar`/`.sidebar-nav-link`、`.topbar`、`.btn-primary/.btn-secondary/.btn-outline`、`.card`、`.table-wrap`（`overflow-x:auto` + 表格 `min-width:640px`）、`.badge`（+ `--status-*` 变体）、`.modal`（暖棕遮罩 `rgba(36,27,17,.6)` + Esc 关闭）、`.toast`、`@media (max-width: 768px)` 基础断点（侧栏折叠为顶栏、卡片单列）。

- [ ] **Step 4: 验证 + 提交**

Run: `npx wrangler pages dev` 检查基准页（student/attendance.html）引用新令牌后无回归。

```bash
git add course-app/assets/css/ brianinchrist/organicchurch/assets/css/vars.css
git commit -m "feat(ui): shared component library in course.css, fix --transition/--faint/status tokens"
```

## Task 17: 逐页迁移（student 7 页 + admin 7 页）

**Files:**
- Modify: `course-app/student/{dashboard,grades,certificate,questions,videos,assignments,assessments}.html`
- Modify: `course-app/admin/{dashboard,grades,books,assignments,assessments,reports,attendance}.html`
- Modify: `course-app/admin/submissions.html`（Task 12 新建页同样迁移）

- [ ] **Step 1: 迁移 student/grades.html（基准示范页）**

完整迁移：引入 `../assets/css/vars.css` + `course.css` → 移除页面内联样式块 → 套 `.app-shell` 侧栏导航 → 成绩卡片用 `.card` + `.badge`（`--status-pass/fail`）→ 表格包 `.table-wrap` → 加 `@media (max-width: 768px)`。

- [ ] **Step 2: 按同一清单迁移其余 6 个 student 页**

每页：a) 引 vars.css+course.css；b) 删内联样式；c) 套侧栏外壳（导航项：仪表盘/我的课程/作业/考核/成绩/证书）；d) 组件替换（btn/卡片/徽章/表格）；e) 补 768px 断点。逐页提交。

- [ ] **Step 3: 迁移 admin 7 页**

同清单 + 专项修复：
- `admin/attendance.html`：`.late-count`/`.rate-mid` 的 `#F9A825` 改为 `#A66A00`（C1 对比度 1.8:1 → 4.5:1）
- 徽章文字统一用 `--status-*` 前景色
- `admin/reports.html` 批准/拒绝按钮：拒绝改 `.btn-outline`（M6）
- `admin/books.html`：补 `.btn-view` 样式（M7）
- 模态框统一暖棕遮罩 + Esc 关闭 + focus trap（M8）

- [ ] **Step 4: 全局响应式/交互收尾**

- student 7 页补最小断点（已在 Step 2）；admin 表格统一 `.table-wrap`（H3）
- 徽章对比度抽查 ≥4.5:1（H4）
- `alert()`/`confirm` 替换为 `.toast`（L6）
- 计时器 `top:22px` 改为 `top:64px` 避免与顶栏重叠（M3）
- 考试单选/复选控件品牌化（L3）
- 标题改 `--font-body` 衬线 + clamp（L4）

- [ ] **Step 5: 验证 + 提交 + 部署**

每页完成后 `npx wrangler pages dev` 目视检查；全部完成后：

```bash
rg -n "#[0-9a-fA-F]{3,6}" course-app --include "*.html" --include "*.css" | rg -v "vars.css"
# 审查残留硬编码色值（仅允许基准页白名单）
npm run test:unit
npx wrangler pages deploy
```

```bash
git add course-app/
git commit -m "feat(ui): converge all pages to shared Scriptorium component system"
```

## Task 18: P4 验收 + 收尾

- [ ] **Step 1: 视觉一致性抽查**

对照基准页检查 5 个关键页（dashboard、grades、assignments、admin/grades、admin/attendance）：布局骨架、按钮体系、徽章、字体加载、768px 断点行为。

- [ ] **Step 2: 对比度抽查**

`#F9A825`、`#B8860B`、`#E65100`、`#4A7A9B`、`--faint` 在正文/徽章场景 ≥4.5:1（用浏览器 devtools 验证）。

- [ ] **Step 3: 记忆收尾**

更新 `.memory/sessions/2026-08-03_xxx.md`、`.memory/INDEX.md`（Current Focus/Quick Context）、`.memory/project/architecture.md`（requireAuth 公共层、014 时间戳规范）、`.memory/entities/files.md`（新文件）。

- [ ] **Step 4: 最终部署确认**

```bash
npm run test:unit && npx wrangler pages deploy
```
向用户报告四阶段完成情况与验收结果。

---

## Self-Review 对照（Spec → Plan）

| Spec 章节 | Plan 任务 |
|-----------|-----------|
| 1.1 requireAuth 公共库 + M11 roles 兜底 | Task 1 |
| 1.2 C1/C2 无认证端点 | Task 2（items）、Task 3（sessions GET） |
| 1.3 考勤 IDOR C3/C4 | Task 3 |
| 1.4 考试完整性 H1/H2/H3 | Task 4 |
| 1.5 内容边界 H4-H7 | Task 5、Task 6 |
| 1.6 M 级收尾（分页/迁移端点/批量/证书/进度/限速） | Task 7 |
| 全量样板替换 L8 | Task 2-7 内嵌 + Task 8 sweep |
| 2.1 014 时间戳清洗 | Task 9 |
| 2.2 索引 M9 | Task 9 |
| 2.3 幂等化 M8 | Task 9 Step 5 |
| 2.4 FK L9 | Task 9 内核对（如缺失则并入 014） |
| 3.1 成绩页 C1+M2 | Task 10 |
| 3.2 证书 C2 | Task 11（含新建 approve/reject 后端端点——审计确认原无审批 API） |
| 3.3 批改 C3 | Task 12 |
| 3.4 导航 C4/C5 | Task 13 |
| 3.5 课程视角 H1/H2 | Task 14（含新建 enrolled 后端端点） |
| 3.6 反馈强化 H6/H7/M | Task 15 |
| 4.1 共享层 | Task 16 |
| 4.2 逐页迁移 | Task 17 |
| 4.3 全局项 | Task 17 Step 4、Task 18 |
