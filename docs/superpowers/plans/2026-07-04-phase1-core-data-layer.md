# Phase 1: 核心数据层实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建学员档案管理系统的核心数据层，包括用户迁移、课程管理、班级管理和学习进度追踪。

**Architecture:** 使用 Cloudflare D1 (SQLite) 作为主数据库，模块化单体架构。用户数据从 KV 迁移到 D1，新增课程、班级、进度、答案等表。

**Tech Stack:** Cloudflare Pages Functions (ES Modules), D1 (SQLite), Vanilla JS

---

## 文件结构

```
functions/
├── _shared/
│   ├── db.js                    # D1 数据库连接与查询辅助
│   ├── auth.js                  # 密码哈希（已有）
│   └── jwt.js                   # JWT 签名验证（已有）
├── api/
│   ├── auth/
│   │   ├── signin.js            # 修改：使用 D1 替代 KV
│   │   └── signup.js            # 修改：使用 D1 替代 KV
│   ├── user/
│   │   └── profile.js           # 修改：使用 D1 替代 KV
│   └── modules/
│       ├── students/
│       │   ├── progress.js      # 新增：学习进度 API
│       │   ├── answers.js       # 新增：答题记录 API
│       │   └── migrate.js       # 新增：localStorage 数据迁移
│       ├── courses/
│       │   ├── catalog.js       # 新增：课程目录 API
│       │   └── items.js         # 新增：课程内容单元 API
│       └── classes/
│           ├── roster.js        # 新增：班级管理 API
│           └── enroll.js        # 新增：课程注册 API

brianinchrist/
└── organicchurch/
    └── assets/
        └── js/
            └── courseware-sync.js  # 新增：前端数据同步逻辑
```

---

## Task 1: D1 数据库设置与表创建

**Files:**
- Modify: `wrangler.toml`
- Create: `migrations/001_init.sql`

- [ ] **Step 1: 创建 D1 数据库**

Run:
```bash
npx wrangler d1 create brianinchrist-db
```

Expected output:
```
✅ Successfully created DB 'brianinchrist-db'
```

Copy the database ID from output.

- [ ] **Step 2: 更新 wrangler.toml 添加 D1 绑定**

Modify `wrangler.toml`:
```toml
#:schema node_modules/wrangler/config-schema.json
name = "brianinchrist-site"
pages_build_output_dir = "brianinchrist"

[[kv_namespaces]]
binding = "USERS_KV"
id = "b8ae6043b8784ce59fdbd602e4c2da0c"

[[d1_databases]]
binding = "DB"
database_name = "brianinchrist-db"
database_id = "<YOUR_DATABASE_ID>"  # 替换为上一步的 ID

[vars]
JWT_SECRET = "a_very_long_secure_random_key_for_jwt_auth_1298471928"
```

- [ ] **Step 3: 创建初始化 SQL 迁移文件**

Create `migrations/001_init.sql`:
```sql
-- 用户表（合并原 KV 数据）
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  nickname   TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt       TEXT NOT NULL,
  roles      TEXT NOT NULL DEFAULT '["student"]',
  avatar_url TEXT,
  bio        TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 课程表
CREATE TABLE courses (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  cover_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 课程内容单元
CREATE TABLE course_items (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  item_ref    TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_course_items_course ON course_items(course_id);
CREATE INDEX idx_course_items_type ON course_items(type);

-- 班级表
CREATE TABLE classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  advisor_id  TEXT NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 班级 ↔ 课程
CREATE TABLE class_courses (
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, course_id)
);

-- 班级 ↔ 学生
CREATE TABLE class_members (
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, student_id)
);

-- 课程注册
CREATE TABLE enrollments (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  class_id    TEXT REFERENCES classes(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, course_id)
);

CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_class_members_student ON class_members(student_id);

-- 学习进度
CREATE TABLE progress (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'started',
  score       INTEGER,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(student_id, item_id)
);

CREATE INDEX idx_progress_student ON progress(student_id);
CREATE INDEX idx_progress_course ON progress(course_id);

-- 答题记录
CREATE TABLE answers (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question_text TEXT,
  answer_text TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, item_id, question_index)
);

CREATE INDEX idx_answers_student ON answers(student_id);
CREATE INDEX idx_answers_item ON answers(item_id);

-- 学习会话
CREATE TABLE learning_sessions (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES course_items(id) ON DELETE SET NULL,
  duration_minutes INTEGER NOT NULL,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_student ON learning_sessions(student_id);
CREATE INDEX idx_sessions_course ON learning_sessions(course_id);
```

- [ ] **Step 4: 应用迁移到 D1**

Run:
```bash
npx wrangler d1 execute brianinchrist-db --file=migrations/001_init.sql
```

Expected output:
```
✅ Successfully executed SQL file
```

- [ ] **Step 5: 验证表创建**

Run:
```bash
npx wrangler d1 execute brianinchrist-db --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expected: 15 张表（users, courses, course_items, classes, class_courses, class_members, enrollments, progress, answers, learning_sessions）

- [ ] **Step 6: Commit**

```bash
git add wrangler.toml migrations/
git commit -m "feat: add D1 database setup and initial schema"
```

---

## Task 2: D1 数据库辅助模块

**Files:**
- Create: `functions/_shared/db.js`

- [ ] **Step 1: 创建 D1 查询辅助函数**

Create `functions/_shared/db.js`:
```javascript
/**
 * D1 数据库查询辅助模块
 */

/**
 * 执行查询并返回所有结果
 * @param {D1Database} db - D1 数据库实例
 * @param {string} sql - SQL 查询语句
 * @param {any[]} params - 查询参数
 * @returns {Promise<any[]>}
 */
export async function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const { results } = await bound.all();
  return results || [];
}

/**
 * 执行查询并返回单条结果
 * @param {D1Database} db
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<any|null>}
 */
export async function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await bound.first();
  return result || null;
}

/**
 * 执行写操作（INSERT/UPDATE/DELETE）
 * @param {D1Database} db
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<D1Result>}
 */
export async function execute(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  return await bound.run();
}

/**
 * 批量执行写操作（事务）
 * @param {D1Database} db
 * @param {Array<{sql: string, params: any[]}>} statements
 * @returns {Promise<D1Result[]>}
 */
export async function batch(db, statements) {
  const stmts = statements.map(({ sql, params }) => {
    const stmt = db.prepare(sql);
    return params.length > 0 ? stmt.bind(...params) : stmt;
  });
  return await db.batch(stmts);
}

/**
 * 生成 UUID
 * @returns {string}
 */
export function generateId() {
  return crypto.randomUUID();
}

/**
 * 获取当前时间戳（ISO 格式）
 * @returns {string}
 */
export function now() {
  return new Date().toISOString();
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/_shared/db.js
git commit -m "feat: add D1 database helper module"
```

---

## Task 3: 用户数据迁移（KV → D1）

**Files:**
- Create: `scripts/migrate-users-kv-to-d1.js`

- [ ] **Step 1: 创建迁移脚本**

Create `scripts/migrate-users-kv-to-d1.js`:
```javascript
/**
 * 用户数据迁移脚本：KV → D1
 * 
 * 使用方法：
 * 1. 确保 wrangler.toml 中已配置 USERS_KV 和 DB
 * 2. 运行: npx wrangler dev --local (启动本地开发环境)
 * 3. 访问: http://localhost:8788/api/admin/migrate-users
 * 
 * 或者使用 wrangler d1 execute 手动迁移
 */

export async function onRequest(context) {
  const { env } = context;
  
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
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
```

- [ ] **Step 2: 创建迁移 API 端点**

Create `functions/api/admin/migrate-users.js`:
```javascript
import { onRequest as migrateHandler } from "../../../scripts/migrate-users-kv-to-d1.js";

export const onRequestGet = migrateHandler;
export const onRequestPost = migrateHandler;
```

注意：实际部署时，将 `scripts/migrate-users-kv-to-d1.js` 的内容直接放入 `functions/api/admin/migrate-users.js`，因为 Pages Functions 不支持从 scripts/ 目录导入。

- [ ] **Step 3: 执行迁移**

部署后访问 `https://organicchurch.dpdns.org/api/admin/migrate-users` 或本地运行迁移。

- [ ] **Step 4: 验证迁移结果**

Run:
```bash
npx wrangler d1 execute brianinchrist-db --command="SELECT COUNT(*) as count FROM users;"
```

Expected: 用户数量应等于 KV 中的用户数。

- [ ] **Step 5: Commit**

```bash
git add functions/api/admin/migrate-users.js
git commit -m "feat: add user migration script from KV to D1"
```

---

## Task 4: 更新认证模块使用 D1

**Files:**
- Modify: `functions/api/auth/signin.js`
- Modify: `functions/api/auth/signup.js`
- Modify: `functions/api/user/profile.js`

- [ ] **Step 1: 更新 signin.js 使用 D1**

Modify `functions/api/auth/signin.js`:
```javascript
import { hashPassword } from "../../_utils/auth.js";
import { signJWT } from "../../_utils/jwt.js";
import { queryOne } from "../../_shared/db.js";

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB binding is missing." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    
    // 从 D1 查询用户
    const user = await queryOne(env.DB, 
      'SELECT * FROM users WHERE email = ?', 
      [cleanEmail]
    );
    
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 验证密码
    const { hash } = await hashPassword(password, user.salt);
    if (hash !== user.password_hash) {
      return new Response(JSON.stringify({ error: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 签名 JWT
    const jwtSecret = env.JWT_SECRET || "default_jwt_secret_key_change_me_in_prod";
    const payload = {
      sub: user.id,
      email: user.email,
      nickname: user.nickname,
      roles: JSON.parse(user.roles),
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    
    const token = await signJWT(payload, jwtSecret);

    return new Response(JSON.stringify({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        roles: JSON.parse(user.roles),
        createdAt: user.created_at
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
```

- [ ] **Step 2: 更新 signup.js 使用 D1**

Modify `functions/api/auth/signup.js`:
```javascript
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
```

- [ ] **Step 3: 更新 profile.js 使用 D1**

Modify `functions/api/user/profile.js`:
```javascript
import { verifyJWT } from "../../_utils/jwt.js";
import { queryOne, execute } from "../../_shared/db.js";

// GET profile
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized. Missing token." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = env.JWT_SECRET || "default_jwt_secret_key_change_me_in_prod";
    
    const payload = await verifyJWT(token, jwtSecret);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Unauthorized. Invalid or expired token." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 从 D1 查询用户
    const user = await queryOne(env.DB,
      'SELECT * FROM users WHERE email = ?',
      [payload.email]
    );
    
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        roles: JSON.parse(user.roles),
        avatarUrl: user.avatar_url,
        bio: user.bio,
        createdAt: user.created_at
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// POST to update profile
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = env.JWT_SECRET || "default_jwt_secret_key_change_me_in_prod";
    
    const payload = await verifyJWT(token, jwtSecret);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { nickname, avatarUrl, bio } = await request.json();
    
    if (!nickname || !nickname.trim()) {
      return new Response(JSON.stringify({ error: "Nickname cannot be empty." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 更新用户信息
    await execute(env.DB, `
      UPDATE users 
      SET nickname = ?, avatar_url = ?, bio = ?, updated_at = datetime('now')
      WHERE email = ?
    `, [nickname.trim(), avatarUrl || null, bio || null, payload.email]);

    const user = await queryOne(env.DB,
      'SELECT * FROM users WHERE email = ?',
      [payload.email]
    );

    return new Response(JSON.stringify({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        roles: JSON.parse(user.roles),
        avatarUrl: user.avatar_url,
        bio: user.bio,
        createdAt: user.created_at
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
```

- [ ] **Step 4: 测试认证流程**

Run:
```bash
npx wrangler pages dev
```

Test:
1. 注册新用户 → 验证 D1 中有记录
2. 登录 → 验证返回 JWT
3. 获取 profile → 验证返回用户信息
4. 更新 profile → 验证 D1 中更新

- [ ] **Step 5: Commit**

```bash
git add functions/api/auth/ functions/api/user/
git commit -m "feat: migrate auth module from KV to D1"
```

---

## Task 5: 课程管理 API

**Files:**
- Create: `functions/api/modules/courses/catalog.js`
- Create: `functions/api/modules/courses/items.js`

- [ ] **Step 1: 创建课程目录 API**

Create `functions/api/modules/courses/catalog.js`:
```javascript
import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/courses/catalog - 获取课程列表
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    
    // 验证身份
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 查询所有已发布的课程
    const courses = await queryAll(env.DB, `
      SELECT c.*, u.nickname as creator_name,
        (SELECT COUNT(*) FROM course_items WHERE course_id = c.id) as item_count
      FROM courses c
      JOIN users u ON c.created_by = u.id
      WHERE c.status = 'published'
      ORDER BY c.created_at DESC
    `);
    
    return new Response(JSON.stringify({
      success: true,
      courses
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/courses/catalog - 创建新课程（管理员）
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 检查管理员权限
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    if (!roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403 });
    }
    
    const { title, description, coverUrl } = await request.json();
    
    if (!title) {
      return new Response(JSON.stringify({ error: "Title is required" }), { status: 400 });
    }
    
    const courseId = generateId();
    const createdAt = now();
    
    await execute(env.DB, `
      INSERT INTO courses (id, title, description, cover_url, status, created_by, created_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?)
    `, [courseId, title, description || null, coverUrl || null, payload.sub, createdAt]);
    
    return new Response(JSON.stringify({
      success: true,
      course: { id: courseId, title, status: 'draft' }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
```

- [ ] **Step 2: 创建课程内容单元 API**

Create `functions/api/modules/courses/items.js`:
```javascript
import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId } from "../../../_shared/db.js";

// GET /api/modules/courses/items?course_id=xxx - 获取课程内容单元
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const courseId = url.searchParams.get('course_id');
    
    if (!courseId) {
      return new Response(JSON.stringify({ error: "course_id is required" }), { status: 400 });
    }
    
    const items = await queryAll(env.DB, `
      SELECT * FROM course_items
      WHERE course_id = ?
      ORDER BY sort_order ASC
    `, [courseId]);
    
    return new Response(JSON.stringify({
      success: true,
      items
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/courses/items - 添加内容单元（管理员）
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    // 检查管理员权限
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    if (!roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403 });
    }
    
    const { courseId, type, title, description, itemRef, sortOrder, isRequired } = await request.json();
    
    if (!courseId || !type || !title || !itemRef) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }
    
    const itemId = generateId();
    
    await execute(env.DB, `
      INSERT INTO course_items (id, course_id, type, title, description, item_ref, sort_order, is_required)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [itemId, courseId, type, title, description || null, itemRef, sortOrder || 0, isRequired !== false ? 1 : 0]);
    
    return new Response(JSON.stringify({
      success: true,
      item: { id: itemId }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add functions/api/modules/courses/
git commit -m "feat: add course catalog and items API"
```

---

## Task 6: 班级管理 API

**Files:**
- Create: `functions/api/modules/classes/roster.js`
- Create: `functions/api/modules/classes/enroll.js`

- [ ] **Step 1: 创建班级管理 API**

Create `functions/api/modules/classes/roster.js`:
```javascript
import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/classes/roster - 获取班级列表
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    
    let classes;
    
    if (roles.includes('admin') || roles.includes('advisor')) {
      // 管理员/班主任可以看到所有班级
      classes = await queryAll(env.DB, `
        SELECT c.*, u.nickname as advisor_name,
          (SELECT COUNT(*) FROM class_members WHERE class_id = c.id) as student_count
        FROM classes c
        JOIN users u ON c.advisor_id = u.id
        WHERE c.status = 'active'
        ORDER BY c.created_at DESC
      `);
    } else {
      // 学生只能看到自己所在的班级
      classes = await queryAll(env.DB, `
        SELECT c.*, u.nickname as advisor_name,
          (SELECT COUNT(*) FROM class_members WHERE class_id = c.id) as student_count
        FROM classes c
        JOIN users u ON c.advisor_id = u.id
        JOIN class_members cm ON c.id = cm.class_id
        WHERE cm.student_id = ? AND c.status = 'active'
        ORDER BY c.created_at DESC
      `, [payload.sub]);
    }
    
    return new Response(JSON.stringify({
      success: true,
      classes
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/classes/roster - 创建班级（班主任/管理员）
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    if (!roles.includes('advisor') && !roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Advisor or admin access required" }), { status: 403 });
    }
    
    const { name, description, advisorId } = await request.json();
    
    if (!name) {
      return new Response(JSON.stringify({ error: "Name is required" }), { status: 400 });
    }
    
    const classId = generateId();
    const createdAt = now();
    const finalAdvisorId = advisorId || payload.sub;
    
    await execute(env.DB, `
      INSERT INTO classes (id, name, description, advisor_id, status, created_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `, [classId, name, description || null, finalAdvisorId, createdAt]);
    
    return new Response(JSON.stringify({
      success: true,
      class: { id: classId, name }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
```

- [ ] **Step 2: 创建课程注册 API**

Create `functions/api/modules/classes/enroll.js`:
```javascript
import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, batch } from "../../../_shared/db.js";

// POST /api/modules/classes/enroll - 添加学生到班级并自动注册课程
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    if (!roles.includes('advisor') && !roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Advisor or admin access required" }), { status: 403 });
    }
    
    const { classId, studentIds } = await request.json();
    
    if (!classId || !studentIds || !Array.isArray(studentIds)) {
      return new Response(JSON.stringify({ error: "classId and studentIds array required" }), { status: 400 });
    }
    
    // 添加学生到班级
    const memberStatements = studentIds.map(studentId => ({
      sql: `INSERT OR IGNORE INTO class_members (class_id, student_id, joined_at) VALUES (?, ?, datetime('now'))`,
      params: [classId, studentId]
    }));
    
    await batch(env.DB, memberStatements);
    
    // 获取班级关联的课程
    const classCourses = await queryAll(env.DB,
      'SELECT course_id FROM class_courses WHERE class_id = ?',
      [classId]
    );
    
    // 为每个学生自动注册课程
    if (classCourses.length > 0) {
      const enrollmentStatements = [];
      
      for (const studentId of studentIds) {
        for (const { course_id } of classCourses) {
          enrollmentStatements.push({
            sql: `INSERT OR IGNORE INTO enrollments (id, student_id, course_id, class_id, status, enrolled_at) VALUES (?, ?, ?, ?, 'active', datetime('now'))`,
            params: [generateId(), studentId, course_id, classId]
          });
        }
      }
      
      await batch(env.DB, enrollmentStatements);
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: `Added ${studentIds.length} students to class`,
      enrolledCourses: classCourses.length
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/classes/assign-course - 分配课程到班级
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const user = await queryOne(env.DB,
      'SELECT roles FROM users WHERE id = ?',
      [payload.sub]
    );
    
    const roles = JSON.parse(user.roles);
    if (!roles.includes('advisor') && !roles.includes('admin')) {
      return new Response(JSON.stringify({ error: "Advisor or admin access required" }), { status: 403 });
    }
    
    const { classId, courseId } = await request.json();
    
    if (!classId || !courseId) {
      return new Response(JSON.stringify({ error: "classId and courseId required" }), { status: 400 });
    }
    
    // 分配课程到班级
    await execute(env.DB, `
      INSERT OR IGNORE INTO class_courses (class_id, course_id, assigned_at)
      VALUES (?, ?, datetime('now'))
    `, [classId, courseId]);
    
    // 为班级所有学生自动注册课程
    const students = await queryAll(env.DB,
      'SELECT student_id FROM class_members WHERE class_id = ?',
      [classId]
    );
    
    if (students.length > 0) {
      const enrollmentStatements = students.map(({ student_id }) => ({
        sql: `INSERT OR IGNORE INTO enrollments (id, student_id, course_id, class_id, status, enrolled_at) VALUES (?, ?, ?, ?, 'active', datetime('now'))`,
        params: [generateId(), student_id, courseId, classId]
      }));
      
      await batch(env.DB, enrollmentStatements);
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: `Course assigned to class, ${students.length} students enrolled`
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add functions/api/modules/classes/
git commit -m "feat: add class roster and enrollment API"
```

---

## Task 7: 学习进度与答案 API

**Files:**
- Create: `functions/api/modules/students/progress.js`
- Create: `functions/api/modules/students/answers.js`
- Create: `functions/api/modules/students/migrate.js`

- [ ] **Step 1: 创建学习进度 API**

Create `functions/api/modules/students/progress.js`:
```javascript
import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/students/progress?course_id=xxx - 获取学习进度
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const courseId = url.searchParams.get('course_id');
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    if (!courseId) {
      return new Response(JSON.stringify({ error: "course_id is required" }), { status: 400 });
    }
    
    // 获取学生在该课程的所有进度
    const progress = await queryAll(env.DB, `
      SELECT p.*, ci.title as item_title, ci.type as item_type
      FROM progress p
      JOIN course_items ci ON p.item_id = ci.id
      WHERE p.student_id = ? AND p.course_id = ?
      ORDER BY p.started_at ASC
    `, [payload.sub, courseId]);
    
    // 计算总体进度
    const totalItems = await queryOne(env.DB,
      'SELECT COUNT(*) as count FROM course_items WHERE course_id = ? AND is_required = 1',
      [courseId]
    );
    
    const completedItems = progress.filter(p => p.status === 'completed').length;
    const progressPercent = totalItems.count > 0 
      ? Math.round((completedItems / totalItems.count) * 100) 
      : 0;
    
    return new Response(JSON.stringify({
      success: true,
      progress,
      summary: {
        total: totalItems.count,
        completed: completedItems,
        percent: progressPercent
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/students/progress - 更新学习进度
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const { itemId, courseId, status, score } = await request.json();
    
    if (!itemId || !courseId || !status) {
      return new Response(JSON.stringify({ error: "itemId, courseId, and status required" }), { status: 400 });
    }
    
    const progressId = generateId();
    const startedAt = now();
    const completedAt = status === 'completed' ? now() : null;
    
    // UPSERT 进度记录
    await execute(env.DB, `
      INSERT INTO progress (id, student_id, course_id, item_id, status, score, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, item_id) DO UPDATE SET
        status = excluded.status,
        score = excluded.score,
        completed_at = excluded.completed_at
    `, [progressId, payload.sub, courseId, itemId, status, score || null, startedAt, completedAt]);
    
    return new Response(JSON.stringify({
      success: true,
      message: "Progress updated"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
```

- [ ] **Step 2: 创建答题记录 API**

Create `functions/api/modules/students/answers.js`:
```javascript
import { verifyJWT } from "../../../_utils/jwt.js";
import { queryAll, queryOne, execute, generateId, now } from "../../../_shared/db.js";

// GET /api/modules/students/answers?item_id=xxx - 获取答题记录
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const itemId = url.searchParams.get('item_id');
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    if (!itemId) {
      return new Response(JSON.stringify({ error: "item_id is required" }), { status: 400 });
    }
    
    const answers = await queryAll(env.DB, `
      SELECT * FROM answers
      WHERE student_id = ? AND item_id = ?
      ORDER BY question_index ASC
    `, [payload.sub, itemId]);
    
    return new Response(JSON.stringify({
      success: true,
      answers
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST /api/modules/students/answers - 保存答题记录
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const { itemId, questionIndex, questionText, answerText } = await request.json();
    
    if (!itemId || questionIndex === undefined || !answerText) {
      return new Response(JSON.stringify({ error: "itemId, questionIndex, and answerText required" }), { status: 400 });
    }
    
    const answerId = generateId();
    const createdAt = now();
    
    // UPSERT 答题记录
    await execute(env.DB, `
      INSERT INTO answers (id, student_id, item_id, question_index, question_text, answer_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, item_id, question_index) DO UPDATE SET
        answer_text = excluded.answer_text,
        updated_at = excluded.updated_at
    `, [answerId, payload.sub, itemId, questionIndex, questionText || null, answerText, createdAt, createdAt]);
    
    return new Response(JSON.stringify({
      success: true,
      message: "Answer saved"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
```

- [ ] **Step 3: 创建 localStorage 数据迁移 API**

Create `functions/api/modules/students/migrate.js`:
```javascript
import { verifyJWT } from "../../../_utils/jwt.js";
import { execute, generateId, batch } from "../../../_shared/db.js";

// POST /api/modules/students/migrate - 从 localStorage 迁移数据
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    
    const { answers, progress } = await request.json();
    
    const results = {
      answersMigrated: 0,
      progressMigrated: 0,
      errors: []
    };
    
    // 迁移答题记录
    if (answers && typeof answers === 'object') {
      const statements = [];
      
      for (const [itemId, questionAnswers] of Object.entries(answers)) {
        for (const [qIndex, answerText] of Object.entries(questionAnswers)) {
          statements.push({
            sql: `INSERT OR IGNORE INTO answers (id, student_id, item_id, question_index, answer_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            params: [generateId(), payload.sub, itemId, parseInt(qIndex), answerText]
          });
        }
      }
      
      if (statements.length > 0) {
        try {
          await batch(env.DB, statements);
          results.answersMigrated = statements.length;
        } catch (err) {
          results.errors.push({ type: 'answers', error: err.message });
        }
      }
    }
    
    // 迁移进度
    if (progress && Array.isArray(progress)) {
      const statements = progress.map(itemId => ({
        sql: `INSERT OR IGNORE INTO progress (id, student_id, course_id, item_id, status, started_at, completed_at) VALUES (?, ?, (SELECT course_id FROM course_items WHERE id = ?), ?, 'completed', datetime('now'), datetime('now'))`,
        params: [generateId(), payload.sub, itemId, itemId]
      }));
      
      if (statements.length > 0) {
        try {
          await batch(env.DB, statements);
          results.progressMigrated = statements.length;
        } catch (err) {
          results.errors.push({ type: 'progress', error: err.message });
        }
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
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add functions/api/modules/students/
git commit -m "feat: add progress, answers, and migration API"
```

---

## Task 8: 前端数据同步

**Files:**
- Create: `brianinchrist/organicchurch/assets/js/courseware-sync.js`

- [ ] **Step 1: 创建前端同步模块**

Create `brianinchrist/organicchurch/assets/js/courseware-sync.js`:
```javascript
/**
 * 课件数据同步模块
 * 将 localStorage 数据同步到服务端 D1 数据库
 */

window.CoursewareSync = (function() {
  const API_BASE = '/api/modules/students';
  
  let token = localStorage.getItem('auth_token');
  
  function setToken(newToken) {
    token = newToken;
    localStorage.setItem('auth_token', newToken);
  }
  
  function clearToken() {
    token = null;
    localStorage.removeItem('auth_token');
  }
  
  async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  }
  
  /**
   * 同步答题记录到服务端
   */
  async function syncAnswers(itemId, questionIndex, questionText, answerText) {
    if (!token) {
      console.warn('Not logged in, skipping sync');
      return;
    }
    
    try {
      await apiRequest('/answers', 'POST', {
        itemId,
        questionIndex,
        questionText,
        answerText
      });
    } catch (err) {
      console.error('Failed to sync answer:', err);
    }
  }
  
  /**
   * 同步学习进度到服务端
   */
  async function syncProgress(itemId, courseId, status, score = null) {
    if (!token) {
      console.warn('Not logged in, skipping sync');
      return;
    }
    
    try {
      await apiRequest('/progress', 'POST', {
        itemId,
        courseId,
        status,
        score
      });
    } catch (err) {
      console.error('Failed to sync progress:', err);
    }
  }
  
  /**
   * 从服务端获取学习进度
   */
  async function getProgress(courseId) {
    if (!token) {
      return null;
    }
    
    try {
      const data = await apiRequest(`/progress?course_id=${courseId}`);
      return data;
    } catch (err) {
      console.error('Failed to get progress:', err);
      return null;
    }
  }
  
  /**
   * 从服务端获取答题记录
   */
  async function getAnswers(itemId) {
    if (!token) {
      return null;
    }
    
    try {
      const data = await apiRequest(`/answers?item_id=${itemId}`);
      return data.answers || [];
    } catch (err) {
      console.error('Failed to get answers:', err);
      return null;
    }
  }
  
  /**
   * 迁移 localStorage 数据到服务端
   */
  async function migrateFromLocalStorage() {
    if (!token) {
      console.warn('Not logged in, cannot migrate');
      return;
    }
    
    const answers = localStorage.getItem('courseware_answers');
    const progress = localStorage.getItem('courseware_progress');
    
    if (!answers && !progress) {
      console.log('No data to migrate');
      return;
    }
    
    try {
      const result = await apiRequest('/migrate', 'POST', {
        answers: answers ? JSON.parse(answers) : null,
        progress: progress ? JSON.parse(progress) : null
      });
      
      console.log('Migration result:', result);
      
      // 迁移成功后清除 localStorage
      if (result.success) {
        localStorage.removeItem('courseware_answers');
        localStorage.removeItem('courseware_progress');
        console.log('Local data cleared after successful migration');
      }
      
      return result;
    } catch (err) {
      console.error('Migration failed:', err);
      return null;
    }
  }
  
  return {
    setToken,
    clearToken,
    syncAnswers,
    syncProgress,
    getProgress,
    getAnswers,
    migrateFromLocalStorage
  };
})();
```

- [ ] **Step 2: Commit**

```bash
git add brianinchrist/organicchurch/assets/js/courseware-sync.js
git commit -m "feat: add frontend courseware sync module"
```

---

## Task 9: 集成测试与部署

- [ ] **Step 1: 本地测试完整流程**

Run:
```bash
npx wrangler pages dev
```

Test checklist:
1. 注册新用户 → 验证 D1 中有记录
2. 登录 → 验证返回 JWT 和 roles
3. 创建课程（管理员）→ 验证 courses 表
4. 添加内容单元 → 验证 course_items 表
5. 创建班级（班主任）→ 验证 classes 表
6. 添加学生到班级 → 验证 class_members 和 enrollments
7. 分配课程到班级 → 验证 class_courses 和自动注册
8. 保存答题记录 → 验证 answers 表
9. 更新学习进度 → 验证 progress 表
10. localStorage 迁移 → 验证数据迁移成功

- [ ] **Step 2: 部署到生产环境**

Run:
```bash
npx wrangler pages deploy
```

- [ ] **Step 3: 验证生产环境**

访问 `https://organicchurch.dpdns.org` 并测试上述流程。

- [ ] **Step 4: 最终 Commit**

```bash
git add .
git commit -m "feat: Phase 1 complete - core data layer with D1"
```

---

## Phase 1 完成标准

- [ ] D1 数据库创建并应用 11 张表的 schema
- [ ] 用户数据从 KV 迁移到 D1
- [ ] 认证模块（signin/signup/profile）使用 D1
- [ ] 课程管理 API 可用
- [ ] 班级管理 API 可用
- [ ] 学习进度和答题记录 API 可用
- [ ] localStorage 数据迁移功能可用
- [ ] 前端同步模块集成

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-04-phase1-core-data-layer.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
