# 在线课程系统完整实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复现有系统关键缺陷并完成全部 8 个业务模块，使在线课程系统从 ~15% 可用状态达到全功能上线。

**Architecture:** Cloudflare Pages Functions (ES Modules) + D1 (SQLite) + KV + Vanilla JS 前端。博客与课程系统分离部署，共享同域名下的不同路径。

**Tech Stack:** Cloudflare Pages Functions, D1 SQLite, KV, Vanilla HTML/CSS/JS, Scriptorium 设计系统 (vars.css), JWT 认证 (HS256)

## Global Constraints

- **后端**: ES Modules (`import`/`export`), `export async function onRequest{Method}(context)`
- **DB 辅助**: 从 `../../_shared/db.js` 导入 `queryAll, queryOne, execute, batch, generateId, now`
- **JWT 验证**: 从 `../../_utils/jwt.js` 导入 `verifyJWT`，每个非公开端点必须验证
- **错误格式**: `{ error: message }` + 正确 HTTP 状态码
- **成功格式**: `{ success: true, ...data }`
- **前端 token**: 全系统统一使用 `localStorage.getItem('auth_token')`
- **设计系统**: 复用 Scriptorium token (vars.css)
- **迁移文件**: 放 `migrations/` 目录，命名 `NNN-description.sql`
- **提交规范**: `feat:`, `fix:`, `chore:` 前缀，一个任务一个提交

## TDD Protocol (所有任务必须遵守)

**Iron Law: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

每个任务的执行顺序 (ULW-Loop TDD)：

1. **RED** - 写测试文件，描述期望行为
2. **Verify RED** - 运行测试，确认失败（失败原因 = 功能缺失，不是语法错误）
3. **GREEN** - 写最小实现代码让测试通过
4. **Verify GREEN** - 运行测试，确认全部通过
5. **SURFACE** - 在真实表面验证用户路径，捕获证据 (curl/截图/日志)
6. **REFACTOR** - 清理代码，保持测试绿色
7. **REGRESSION** - 重跑全量场景列表，确认无回归
8. **Gate Check** - 通过 Phase 质量门禁后方可 Commit

### Scenario Contract (每任务必须定义)

每个任务在 RED 之前定义三类场景，每类有二值通过条件：

| 场景类 | 覆盖内容 | 二值通过条件示例 |
|--------|---------|----------------|
| **Happy path** | 正常用户操作 | `curl GET /api/... -> 200 + JSON 含 {success:true}` |
| **Edge case** | 边界/空值/并发 | `curl GET /api/...?class_id=nonexistent -> 200 + {students:[]}` |
| **Adjacent regression** | 相邻调用者不受影响 | `npm test -- 全量通过，无新 failure` |

### SURFACE 验证要求

| 变更类型 | SURFACE 验证 | 证据捕获 |
|---------|-------------|---------|
| API 端点 | `curl` 调用真实端点 | HTTP 状态码 + 响应体 |
| 前端页面 | Playwright 驱动浏览器 | 截图 + DOM 断言 |
| DB 迁移 | `wrangler d1 execute` + 查询验证 | 查询结果 |
| 配置文件 | 加载并验证解析结果 | 解析后结构 |

### 测试文件规范

| 类型 | 路径 | 框架 |
|------|------|------|
| API 端点测试 | `tests/api/modules/{module}/{endpoint}.test.js` | Vitest + Miniflare |
| DB 迁移测试 | `tests/migrations/{NNN-name}.test.js` | Vitest + D1 |
| 前端 E2E | `tests/e2e/{role}-{page}.spec.js` | Playwright |
| 工具函数测试 | `tests/unit/{file}.test.js` | Vitest |

### 测试内容要求

每个 API 端点至少覆盖：
- 正常请求返回 200 + 正确数据结构 (Happy)
- 未携带 JWT 返回 401 (Edge)
- 角色不足返回 403 (Edge)
- 缺少必填字段返回 400 (Edge)
- DB 绑定不存在返回 500 + `{ error }` (Edge)
- 现有端点不受影响 (Adjacent regression)

每个迁移文件至少覆盖：
- 表创建成功 (Happy)
- 必填字段存在 (Edge)
- UNIQUE 约束生效 (Edge)
- 外键关系正确 (Edge)

每个前端页面至少覆盖（Playwright E2E）：
- 未登录跳转登录页 (Edge)
- 页面加载显示标题 (Happy)
- 核心交互（如提交表单、加载数据）(Happy)
- 已有页面不受影响 (Adjacent regression)

### 运行测试命令

```bash
# 单元 + API 测试
npx vitest run tests/api/ tests/unit/ tests/migrations/

# E2E 测试
npx playwright test tests/e2e/

# 全量回归 (Phase 门禁必须通过)
npm test
```

## ULW-Loop Protocol (Loop Engineering 规范)

### Loop 类型: Sequential with Quality Gates

本计划采用 **顺序循环 + 质量门禁** 模式：
- Phase 按依赖图顺序执行
- 每个 Phase 内部任务顺序执行
- Phase 间有质量门禁 (全量测试 + Oracle 验证)

### Phase 质量门禁 (Phase Gate)

每个 Phase 的所有任务完成后，必须通过以下门禁才能进入下一 Phase：

```
Phase N 所有任务完成
  |
  +-> Gate 1: npm test (全量测试) -> 全绿? 
  |     否 -> 修复失败测试，重跑 (最多 3 次)
  |     3 次仍失败 -> 冻结 loop，告警
  |
  +-> Gate 2: SURFACE 验证 -> 真实表面可访问?
  |     否 -> 修复部署问题
  |
  +-> Gate 3: Oracle 验证 -> Oracle 审查本 Phase 产出
  |     Oracle 提出 blocker -> 修复后重新提交 (最多 2 次)
  |     2 次仍不通过 -> 冻结 loop，向用户报告
  |
  +-> 全部通过 -> 进入下一 Phase
```

### Completion Promise (全局完成承诺)

全部 Phase 完成后，输出 completion promise 并触发 Oracle 最终验证：

```
<promise>
所有 35 个任务完成 +
npm test 全绿 (Vitest + Playwright) +
线上 learn.organicchurch.dpdns.org 可访问 +
学生全流程 E2E 通过 (注册->登录->仪表盘->考勤->作业->考试->成绩->证书) +
教师全流程 E2E 通过 (登录->创建课时->考勤->布置作业->批改->创建考核->评分->成绩->评语->审批证书)
</promise>
```

Oracle 最终验证通过后，Loop 结束。

### Reviewer Gate 触发规则

以下条件触发 Reviewer (Oracle) 审查：

| 触发条件 | 审查范围 |
|---------|---------|
| 单次变更 3+ 文件 | 变更的文件 |
| 安全相关变更 (auth/JWT/密码) | 安全审查 |
| 数据库迁移 (schema 变更) | 迁移正确性 + 数据安全 |
| 单任务耗时 30+ 分钟 | 实现质量 |
| Phase 质量门禁 | 整个 Phase 产出 |
| 全局完成 | 全部产出 |

### 失败恢复协议

| 失败场景 | 恢复动作 |
|---------|---------|
| 单任务测试失败 | 修复 -> 重跑测试 (最多 3 次) -> 3 次失败冻结 |
| Phase 门禁失败 | 回滚到本 Phase 开始前的 commit -> 缩小范围重试 |
| Oracle blocker | 修复 Oracle 指出的问题 -> 重新提交 (最多 2 次) |
| 连续 3 个任务在同一 Phase 失败 | 冻结 loop -> 运行 `/harness-audit` -> 向用户报告 |
| Churn 检测 (无进度) | 冻结 loop -> 缩小到最小失败单元 -> 向用户报告 |

### 进度监控

每个任务完成后记录：
- 任务 ID + 状态 (pass/fail)
- 测试通过数 / 失败数
- SURFACE 验证结果
- 累计迭代次数

如果累计迭代次数超过 500 (ultrawork mode)，冻结 loop。

## 代码模式参考

所有新 API 端点遵循 `functions/api/modules/attendance/sessions.js` 的模式：
1. 检查 `env.DB` 绑定
2. 提取并验证 JWT
3. 检查角色权限
4. 执行 SQL
5. 返回 JSON Response

所有新前端页面遵循 `course-app/student/attendance.html` 的模式：
1. 引用 `assets/css/vars.css` + `assets/css/app.css`
2. sticky topbar + sidebar layout
3. IIFE 封装 JS
4. `CourseAuth.requireAuth()` 鉴权
5. fetch + render 模式

## Phase 依赖图

```
Phase 0 (测试基础设施) --> Phase A (关键修复) --> Phase B (书籍+课程扩展) --> Phase C (作业)
                                                                       |--> Phase D (视频)
                                                                       |--> Phase E (考核) --> Phase F (成绩)
                                                                       |--> Phase G (互动前端)
Phase 0 + Phase A --> Phase H (集成测试+部署) [最后执行]
```

Phase 0 必须最先执行。Phase B 完成后，C/D/E/G 可并行。Phase F 依赖 C/D/E 全部完成。

---

## Phase 0: 测试基础设施 (必须最先执行)

### Task P0-1: 安装测试框架并配置

**Files:**
- Modify: `package.json` (添加 devDependencies + scripts)
- Create: `vitest.config.js`
- Create: `playwright.config.js`
- Create: `tests/` 目录结构

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | `npx vitest run tests/smoke.test.js` -> PASS |
| Edge | vitest 未安装 -> command not found (RED 阶段) |
| Regression | 现有项目 package.json 不受影响 |

- [ ] **Step 1: RED - 写一个 smoke test 验证测试框架能运行**

Create: `tests/smoke.test.js`
```javascript
import { describe, it, expect } from 'vitest';

describe('test infrastructure', () => {
  it('vitest runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Verify RED - 运行测试确认失败 (vitest 未安装)**

```bash
npx vitest run tests/smoke.test.js
# 预期: command not found 或 module not found
```

- [ ] **Step 3: GREEN - 安装依赖并配置**

```bash
npm install -D vitest @cloudflare/vitest-pool-workers miniflare
npm install -D @playwright/test
npx playwright install chromium
```

Create: `vitest.config.js`
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**'],
  },
});
```

Create: `playwright.config.js`
```javascript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:8788',
    headless: true,
  },
  webServer: {
    command: 'npx wrangler pages dev course-app --port 8788',
    port: 8788,
    reuseExistingServer: true,
  },
});
```

Update `package.json`:
```json
{
  "scripts": {
    "test": "vitest run && playwright test",
    "test:unit": "vitest run",
    "test:e2e": "playwright test",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Verify GREEN - smoke test 通过**

```bash
npx vitest run tests/smoke.test.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE - 验证测试框架实际运行**

```bash
npx vitest run tests/smoke.test.js
# 预期: PASS (真实运行，非 mock)
```

- [ ] **Step 6: REFACTOR** - 检查 vitest.config.js 配置是否合理

- [ ] **Step 7: REGRESSION** - `npm test` (确认框架不破坏现有项目)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.js playwright.config.js tests/smoke.test.js
git commit -m "feat: add vitest and playwright test infrastructure"
```

---

### Task P0-2: 创建 CF Pages Functions 测试辅助工具

**Files:**
- Create: `tests/helpers/mock-context.js` (模拟 CF context)
- Create: `tests/helpers/mock-env.js` (模拟 env.DB, env.USERS_KV, env.JWT_SECRET)
- Create: `tests/helpers/setup-db.js` (本地 D1 初始化)

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | `createMockContext()` 返回含 request + env.DB + env.JWT_SECRET |
| Edge | 不传参数 -> 使用默认值; 传 method/url -> 正确设置 |
| Regression | 现有测试不受影响 |

- [ ] **Step 1: RED - 写测试验证 mock helper 能工作**

Create: `tests/helpers/mock-context.test.js`
```javascript
import { describe, it, expect } from 'vitest';
import { createMockContext } from './mock-context.js';

describe('createMockContext', () => {
  it('creates context with request and env', () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/test',
    });
    expect(ctx.request.method).toBe('GET');
    expect(ctx.env).toBeDefined();
    expect(ctx.env.DB).toBeDefined();
    expect(ctx.env.JWT_SECRET).toBeDefined();
  });
});
```

- [ ] **Step 2: Verify RED - 运行失败 (mock-context.js 不存在)**

```bash
npx vitest run tests/helpers/mock-context.test.js
# 预期: FAIL - Cannot find module './mock-context.js'
```

- [ ] **Step 3: GREEN - 实现 mock helpers**

Create: `tests/helpers/mock-env.js` - 生成包含 mock D1 (miniflare D1)、mock KV (miniflare KV)、JWT_SECRET 的 env 对象

Create: `tests/helpers/mock-context.js` - 根据 method/url/body/headers 创建 CF Pages Function 的 context 对象

Create: `tests/helpers/setup-db.js` - 用 miniflare 创建本地 D1 实例，执行 migrations 目录下的 SQL 文件，返回初始化后的 D1 实例

- [ ] **Step 4: Verify GREEN - 测试通过**

```bash
npx vitest run tests/helpers/mock-context.test.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE - 验证 mock helper 真实工作**

```bash
npx vitest run tests/helpers/mock-context.test.js
# 预期: PASS (真实 mock 可用)
```

- [ ] **Step 6: REFACTOR** - 检查 mock helper 是否覆盖所有 CF context 字段

- [ ] **Step 7: REGRESSION** - `npm test`

- [ ] **Step 8: Commit**

```bash
git add tests/helpers/
git commit -m "feat: add test helpers for CF Pages Functions (mock context, env, D1 setup)"
```

---

### Task P0-3: 为现有 API 编写回归测试基线

**Files:**
- Create: `tests/api/auth/signin.test.js`
- Create: `tests/api/modules/attendance/sessions.test.js`
- Create: `tests/api/modules/attendance/stats.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | 正确邮箱+密码 -> 200 + token |
| Edge | 错误密码 -> 401; 缺字段 -> 400; 现有 API 无新 failure |
| Regression | `npm test` 全绿 |

- [ ] **Step 1: RED - 写 signin/sessions/stats 测试**

测试用例：
- signin: 正确邮箱+密码返回 200 + token
- signin: 错误密码返回 401
- signin: 不存在的邮箱返回 401
- signin: 缺少字段返回 400
- sessions/stats: 同上覆盖 401/403/400 场景

- [ ] **Step 2: Verify RED - 运行失败 (测试无法连接或现有 API 有 bug)**

- [ ] **Step 3: GREEN - 修复现有 API 让测试通过** (如有 bug 则修复，无 bug 则测试直接通过)

- [ ] **Step 4: Verify GREEN - 运行全部测试，确认通过**

```bash
npx vitest run tests/api/
# 预期: PASS (signin + sessions + stats 全绿)
```

- [ ] **Step 5: SURFACE - 验证现有 API 测试真实通过**

```bash
npx vitest run tests/api/
# 预期: PASS (真实 API 回归基线)
```

- [ ] **Step 6: REFACTOR** - 检查测试覆盖是否完整

- [ ] **Step 7: REGRESSION** - `npm test`

- [ ] **Step 8: Commit**

```bash
git add tests/api/
git commit -m "test: add regression test baseline for existing auth and attendance APIs"
```

### Phase 0 Gate

**Completion Promise:**
- `npx vitest run tests/smoke.test.js` -> PASS
- `npx vitest run tests/helpers/mock-context.test.js` -> PASS
- `npx vitest run tests/api/` -> PASS (现有 API 回归基线全绿)
- `npm test` 不报框架错误

**Oracle 验证:** Oracle 审查测试架构 (vitest.config.js, playwright.config.js, helpers/) 是否合理覆盖 CF Pages Functions 场景。

---

## Phase A: 关键修复 (必须最先执行)

### Task A1: 恢复 migration 001 并提交所有未跟踪文件

**Files:**
- Restore: `migrations/001_init.sql`
- Stage: `course-app/`, `functions/api/modules/attendance/`, `migrations/`, `wrangler-blog.toml`
- Create: `tests/migrations/001-init.test.js`

**Interfaces:**
- Produces: 10 张基础表 (users, courses, course_items, classes, class_courses, class_members, enrollments, progress, answers, learning_sessions + 索引)

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | 10 张基础表全部存在 |
| Edge | 001_init.sql 从 git 恢复后内容完整 (head -5 验证) |
| Regression | 现有 attendance 表 (002) 不受影响 |

- [ ] **Step 1: RED - 写测试验证 10 张基础表存在**

Create: `tests/migrations/001-init.test.js`
```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 001_init.sql', () => {
  let db;
  beforeAll(async () => { db = await setupTestDB(['001_init.sql']); });

  const expectedTables = [
    'users', 'courses', 'course_items', 'classes', 'class_courses',
    'class_members', 'enrollments', 'progress', 'answers', 'learning_sessions'
  ];

  for (const table of expectedTables) {
    it(`creates ${table} table`, async () => {
      const result = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).bind(table).first();
      expect(result).not.toBeNull();
    });
  }
});
```

- [ ] **Step 2: Verify RED - 运行失败 (001_init.sql 不存在)**

```bash
npx vitest run tests/migrations/001-init.test.js
# 预期: FAIL - migration file not found
```

- [ ] **Step 3: GREEN - 从 git 恢复 001_init.sql 并暂存未跟踪文件**

```bash
git show 949c47c:migrations/001_init.sql > migrations/001_init.sql
git add course-app/ functions/api/modules/attendance/ migrations/ wrangler-blog.toml docs/superpowers/specs/
```

- [ ] **Step 4: Verify GREEN - 测试通过**

```bash
npx vitest run tests/migrations/001-init.test.js
# 预期: PASS (10 个表全部存在)
```

- [ ] **Step 5: SURFACE - 验证真实 D1 有 10 张表**

```bash
npx wrangler d1 execute brianinchrist-db --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','courses','course_items','classes','class_courses','class_members','enrollments','progress','answers','learning_sessions');"
# 预期: 10 行
```

- [ ] **Step 6: REFACTOR** - 检查恢复的 SQL 是否完整

- [ ] **Step 7: REGRESSION** - `npm test`

- [ ] **Step 8: Commit**

```bash
git add tests/migrations/001-init.test.js
git commit -m "fix: recover migration 001 and stage attendance system + course-app"
```

---

### Task A2: 创建 migration 003 (互动+评语+证书+通知 7 张表)

**Files:**
- Create: `migrations/003-interactions.sql`
- Create: `tests/migrations/003-interactions.test.js`

**Interfaces:**
- Produces: `highlights`, `highlight_replies`, `questions`, `question_answers`, `reports`, `certificates`, `notifications` 表
- Enables: 已有 highlights.js, questions.js, reports/index.js, certificates/index.js, notifications/index.js 变为可用

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | 7 张表 (highlights, highlight_replies, questions, question_answers, reports, certificates, notifications) 存在 |
| Edge | certificates 有 UNIQUE(student_id, course_id); 已有 API 返回 {success:true} 而非 DB 错误 |
| Regression | 现有表不受影响 |

- [ ] **Step 1: RED - 写测试验证 7 张表存在且约束正确**

Create: `tests/migrations/003-interactions.test.js`
```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 003_interactions.sql', () => {
  let db;
  beforeAll(async () => { db = await setupTestDB(['001_init.sql', '002-attendance.sql', '003-interactions.sql']); });

  const tables = ['highlights', 'highlight_replies', 'questions', 'question_answers', 'reports', 'certificates', 'notifications'];
  for (const table of tables) {
    it(`creates ${table} table`, async () => {
      const result = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first();
      expect(result).not.toBeNull();
    });
  }

  it('certificates has UNIQUE(student_id, course_id)', async () => {
    const info = await db.prepare(`SELECT sql FROM sqlite_master WHERE name='certificates'`).first();
    expect(info.sql).toContain('UNIQUE');
  });
});
```

- [ ] **Step 2: Verify RED - 运行失败 (003-interactions.sql 不存在)**

```bash
npx vitest run tests/migrations/003-interactions.test.js
# 预期: FAIL - migration file not found
```

- [ ] **Step 3: GREEN - 写迁移文件**

SQL 定义见设计文档 Section 4.11 和 4.12。7 张表：
- `highlights` (高亮批注，含 visibility/class_ids)
- `highlight_replies` (高亮回复)
- `questions` (提问，含 has_official)
- `question_answers` (问题回答，含 is_official)
- `reports` (教师评语，UNIQUE student+course+teacher+title)
- `certificates` (证书，UNIQUE student+course，含 status 流转)
- `notifications` (通知，含 is_read)

每张表必须有对应索引。

执行迁移：
```bash
npx wrangler d1 execute brianinchrist-db --local --file=migrations/003-interactions.sql
npx wrangler d1 execute brianinchrist-db --remote --file=migrations/003-interactions.sql
```

- [ ] **Step 4: Verify GREEN - 测试通过 + 为已有 API 写回归测试**

```bash
npx vitest run tests/migrations/003-interactions.test.js
# 预期: PASS
```

Create: `tests/api/modules/interactions/highlights.test.js` - 测试 GET /api/modules/interactions/highlights?item_id=test 返回 `{ success: true, highlights: [] }`

- [ ] **Step 5: SURFACE - 验证已有 API 真实可用**

```bash
npx wrangler pages dev course-app --local
curl -H "Authorization: Bearer <token>" "http://localhost:8788/api/modules/interactions/highlights?item_id=test"
# 预期: 200 + {success:true, highlights:[]}
```

- [ ] **Step 6: REFACTOR** - 检查迁移 SQL 索引完整性

- [ ] **Step 7: REGRESSION** - `npm test`

- [ ] **Step 8: Commit**

```bash
git add migrations/003-interactions.sql tests/migrations/003-interactions.test.js tests/api/modules/interactions/
git commit -m "feat: add migration 003 for interactions, reports, certificates, notifications tables"
```

---

### Task A3: 统一 token key 为 auth_token

**Files:**
- Modify: `course-app/assets/js/attendance.js` (line 45)
- Modify: `course-app/student/attendance.html` (line 822, 864)
- Create: `tests/unit/token-key.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | `grep -r "getItem('token')" course-app/` -> 0 结果 |
| Edge | attendance.js 和 attendance.html 修复前有 'token' 引用 (RED 阶段) |
| Regression | 现有 auth_token 使用不受影响 |

- [ ] **Step 1: RED - 写测试验证没有文件使用 'token' 作为 localStorage key**

Create: `tests/unit/token-key.test.js`
```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function findTokenUsage(dir, pattern) {
  const results = [];
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, file.name);
    if (file.isDirectory()) {
      results.push(...findTokenUsage(fullPath, pattern));
    } else if (file.name.endsWith('.js') || file.name.endsWith('.html')) {
      const content = readFileSync(fullPath, 'utf-8');
      const matches = content.match(pattern);
      if (matches) results.push({ file: fullPath, matches: matches.length });
    }
  }
  return results;
}

describe('token storage key consistency', () => {
  it('no file uses localStorage.getItem("token")', () => {
    const results = findTokenUsage('course-app/', /localStorage\.(get|set|remove)Item\(['"]token['"]\)/g);
    expect(results).toEqual([]);
  });

  it('no file uses localStorage.setItem("token")', () => {
    const results = findTokenUsage('course-app/', /localStorage\.setItem\(['"]token['"]\)/g);
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify RED - 运行失败 (attendance.js 和 attendance.html 仍在用 'token')**

```bash
npx vitest run tests/unit/token-key.test.js
# 预期: FAIL - found token usages in attendance.js and attendance.html
```

- [ ] **Step 3: GREEN - 修复文件**

`course-app/assets/js/attendance.js`: 将 `localStorage.getItem('token')` 改为 `localStorage.getItem('auth_token')`
`course-app/student/attendance.html`: 将所有 `localStorage.getItem('token')` 替换为 `localStorage.getItem('auth_token')`，`localStorage.removeItem('token')` 改为 `localStorage.removeItem('auth_token')`

- [ ] **Step 4: Verify GREEN - 测试通过**

```bash
npx vitest run tests/unit/token-key.test.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE - 验证真实文件无 'token' 残留**

```bash
grep -r "getItem('token')" course-app/
# 预期: 0 结果
```

- [ ] **Step 6: REFACTOR** - 检查是否有遗漏的 'token' 引用

- [ ] **Step 7: REGRESSION** - `npm test`

- [ ] **Step 8: Commit**

```bash
git add course-app/assets/js/attendance.js course-app/student/attendance.html tests/unit/token-key.test.js
git commit -m "fix: unify token storage key to auth_token across course-app"
```

---

### Task A4: 创建课程系统登录页和共享 auth.js

**Files:**
- Create: `course-app/assets/js/auth.js`
- Create: `course-app/login.html`
- Modify: `course-app/index.html` (添加登录检查)
- Modify: `course-app/student/attendance.html` (redirect 改为 login.html)
- Modify: `course-app/assets/js/attendance.js` (redirect 改为 login.html)
- Create: `tests/e2e/login.spec.js`
- Create: `tests/unit/auth.test.js`

**Interfaces:**
- Produces: `window.CourseAuth` 全局对象
- Produces: `/course-app/login.html` 登录注册页

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright: 访问 /course-app/ -> 跳转 login.html -> 输入凭据 -> 跳回 /course-app/ |
| Edge | 未登录访问考勤页 -> 跳转 login.html (不再死循环); 已登录访问 login.html -> 自动跳转 |
| Regression | 现有考勤页面功能不受影响 |

- [ ] **Step 1: RED - 写 E2E 测试验证登录流程**

Create: `tests/e2e/login.spec.js`
```javascript
import { test, expect } from '@playwright/test';

test.describe('login flow', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/course-app/');
    await expect(page).toHaveURL(/login\.html/);
  });

  test('login page shows form', async ({ page }) => {
    await page.goto('/course-app/login.html');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login with valid credentials redirects to index', async ({ page }) => {
    // 先通过 API 注册一个测试用户
    await page.goto('/course-app/login.html');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/course-app\/$/);
  });
});
```

- [ ] **Step 2: Verify RED - 运行失败 (login.html 和 auth.js 不存在)**

```bash
npx playwright test tests/e2e/login.spec.js
# 预期: FAIL - page not found
```

- [ ] **Step 3: GREEN - 实现登录页和 auth.js**

Create: `course-app/assets/js/auth.js` - 提供方法：`getToken()`, `setToken(token)`, `clearToken()`, `isLoggedIn()`, `requireAuth()` (未登录跳转 login.html), `signIn(email, password)`, `signUp(nickname, email, password)`, `getProfile()`, `logout()`

Create: `course-app/login.html` - 复用 Scriptorium 设计系统。包含登录表单 (email+password) 和注册表单切换。登录成功后跳转 `/course-app/`。

Modify: `course-app/index.html` - 页面加载时调用 `CourseAuth.getProfile()`，未登录显示登录按钮
Modify: `course-app/student/attendance.html` + `attendance.js` - redirect 改为 `/course-app/login.html`

- [ ] **Step 4: Verify GREEN - E2E 测试通过**

```bash
npx playwright test tests/e2e/login.spec.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE - 浏览器验证登录流程**

Playwright 截图: 访问 `/course-app/` -> 跳转 login.html -> 输入凭据 -> 跳回 `/course-app/`
验证: 考勤页面不再死循环

- [ ] **Step 6: REFACTOR** - 检查 auth.js 代码质量

- [ ] **Step 7: REGRESSION** - `npm test`

- [ ] **Step 8: Commit**

```bash
git add course-app/assets/js/auth.js course-app/login.html course-app/index.html course-app/student/attendance.html course-app/assets/js/attendance.js tests/e2e/login.spec.js tests/unit/auth.test.js
git commit -m "feat: add login page and shared auth module for course-app"
```

---

### Task A5: 修复考勤 stats API 契约不匹配

**Files:**
- Modify: `functions/api/modules/attendance/stats.js`
- Create: `tests/api/modules/attendance/stats.test.js`

**Interfaces:**
- Produces: stats API 返回的每个 student 对象包含 `sessions` 数组

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | `GET /api/modules/attendance/stats?class_id=x` -> 200 + students[0].sessions 数组含明细 |
| Edge | 无考勤记录 -> sessions: []; 无 JWT -> 401 |
| Regression | 现有 stats API 聚合数据 (出勤率等) 不受影响 |

- [ ] **Step 1: RED - 写测试验证 stats API 返回 sessions 数组**

Create: `tests/api/modules/attendance/stats.test.js`
```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { createMockContext } from '../../helpers/mock-context.js';
import { setupTestDB } from '../../helpers/setup-db.js';
import { onRequestGet } from '../../../../functions/api/modules/attendance/stats.js';

describe('attendance stats API', () => {
  let db, env;

  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '002-attendance.sql']);
    // 插入测试数据: class, session, student, attendance records
  });

  it('returns 401 without auth', async () => {
    const ctx = createMockContext({ method: 'GET', url: 'http://localhost/api/modules/attendance/stats?class_id=test' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });

  it('returns students with sessions array', async () => {
    const ctx = createMockContext({ method: 'GET', url: 'http://localhost/api/modules/attendance/stats?class_id=test', db });
    ctx.request.headers.set('Authorization', 'Bearer <valid-jwt>');
    const res = await onRequestGet(ctx);
    const data = await res.json();
    expect(data.students[0]).toHaveProperty('sessions');
    expect(Array.isArray(data.students[0].sessions)).toBe(true);
  });
});
```

- [ ] **Step 2: Verify RED - 运行失败 (sessions 属性不存在)**

```bash
npx vitest run tests/api/modules/attendance/stats.test.js
# 预期: FAIL - students[0].sessions is undefined
```

- [ ] **Step 3: GREEN - 修改 stats.js**

在返回 `studentsWithRate` 之前，为每个学生查询 session 明细：

```sql
SELECT ar.status, ar.notes, cs.session_date, cs.title
FROM attendance_records ar
JOIN class_sessions cs ON ar.class_session_id = cs.id
WHERE ar.student_id = ? AND cs.class_id = ?
ORDER BY cs.session_date DESC
```

将结果附加到对应学生的 `sessions` 字段。

- [ ] **Step 4: Verify GREEN - 测试通过**

```bash
npx vitest run tests/api/modules/attendance/stats.test.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE - 验证真实 API 返回 sessions 数组**

```bash
npx wrangler pages dev course-app --local
curl -H "Authorization: Bearer <token>" "http://localhost:8788/api/modules/attendance/stats?class_id=test"
# 预期: 200 + students[0].sessions 数组包含 session 明细
```

- [ ] **Step 6: REFACTOR** - 检查 SQL 查询性能

- [ ] **Step 7: REGRESSION** - `npm test`

- [ ] **Step 8: Commit**

```bash
git add functions/api/modules/attendance/stats.js tests/api/modules/attendance/stats.test.js
git commit -m "fix: include session-level details in attendance stats API"
```

### Phase A Gate

**Completion Promise:**
- `npx vitest run tests/migrations/` -> PASS (001 + 003 迁移测试全绿)
- `npx vitest run tests/unit/token-key.test.js` -> PASS (token key 统一)
- `npx vitest run tests/api/modules/attendance/stats.test.js` -> PASS (stats API 修复)
- `npx playwright test tests/e2e/login.spec.js` -> PASS (登录流程 E2E)
- `npm test` -> 全绿
- SURFACE: `curl http://localhost:8788/api/modules/interactions/highlights?item_id=test` -> 200 + `{success:true}`
- SURFACE: 浏览器访问 `/course-app/login.html` -> 显示登录表单

**Oracle 验证:** Oracle 审查 (1) migration 001 恢复是否完整 (2) 7 张互动表结构是否符合设计文档 (3) token 统一是否遗漏文件 (4) 登录流程是否消除死循环。

**Reviewer Gate 触发:** A4 (登录页) 变更 5+ 文件 + 安全相关 -> 必须通过 Oracle 安全审查。

---

## Phase B: 书籍管理与课程内容扩展

> **TDD**: 本 Phase 所有任务遵循 TDD Protocol。每个 migration 任务: RED = 写测试验证表存在 -> GREEN = 写 SQL 并执行。每个 API 任务: RED = 写测试验证端点行为 -> GREEN = 实现 API。每个前端任务: RED = 写 Playwright E2E 测试 -> GREEN = 实现页面。

### Task B1: 创建 migration 004 (书籍管理 2 张表) + migration 005 (课程扩展)

**Files:**
- Create: `migrations/004-books.sql`
- Create: `migrations/005-course-extend.sql`
- Create: `tests/migrations/004-books.test.js`
- Create: `tests/migrations/005-course-extend.test.js`

**Interfaces:**
- Produces: `books`, `book_chapters` 表
- Produces: `courses` 表增加 `start_date`, `end_date` 字段
- Produces: `course_items` 表增加 `book_id`, `book_chapter_id` 字段

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | books + book_chapters 表存在; courses 含 start_date/end_date; course_items 含 book_id/book_chapter_id |
| Edge | book_chapters 有 book_id 外键; ALTER TABLE 不破坏现有数据 |
| Regression | 现有 courses/course_items 数据不受影响 |

- [ ] **Step 1: RED - 写测试验证 books/book_chapters 表存在 + courses 表有新字段**

Create: `tests/migrations/004-books.test.js` - 验证 `books` 和 `book_chapters` 表存在，UNIQUE(title, language) 约束
Create: `tests/migrations/005-course-extend.test.js` - 验证 `courses` 表包含 `start_date`, `end_date` 列，`course_items` 表包含 `book_id`, `book_chapter_id` 列

- [ ] **Step 2: Verify RED - 运行失败**

```bash
npx vitest run tests/migrations/004-books.test.js tests/migrations/005-course-extend.test.js
# 预期: FAIL - tables/columns not found
```

- [ ] **Step 3: GREEN - 写 migration 004-books.sql + 005-course-extend.sql**

写 `migrations/004-books.sql` (`books` + `book_chapters` 表，见设计文档 Section 4.4)
写 `migrations/005-course-extend.sql` (ALTER TABLE courses ADD start_date/end_date, ALTER TABLE course_items ADD book_id/book_chapter_id)

执行迁移:
```bash
npx wrangler d1 execute brianinchrist-db --local --file=migrations/004-books.sql
npx wrangler d1 execute brianinchrist-db --local --file=migrations/005-course-extend.sql
npx wrangler d1 execute brianinchrist-db --remote --file=migrations/004-books.sql
npx wrangler d1 execute brianinchrist-db --remote --file=migrations/005-course-extend.sql
```

- [ ] **Step 4: Verify GREEN - 测试通过**

```bash
npx vitest run tests/migrations/004-books.test.js tests/migrations/005-course-extend.test.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE - 验证真实 D1**

```bash
npx wrangler d1 execute brianinchrist-db --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('books','book_chapters');"
# 预期: 2 行
```

- [ ] **Step 6: REFACTOR** - 检查 SQL 索引是否完整

- [ ] **Step 7: REGRESSION** - `npm test` 全量回归

- [ ] **Step 8: Commit**

```bash
git add migrations/004-books.sql migrations/005-course-extend.sql tests/migrations/004-books.test.js tests/migrations/005-course-extend.test.js
git commit -m "feat: add books/book_chapters tables and extend courses/course_items"
```

---

### Task B2: 书籍管理 API

**Files:**
- Create: `functions/api/modules/books/index.js` (GET 列表 / POST 创建)
- Create: `functions/api/modules/books/[id].js` (GET/PUT/DELETE 单本书)
- Create: `functions/api/modules/books/[id]/chapters.js` (GET 章节列表 / POST 添加章节)
- Create: `tests/api/modules/books/index.test.js`
- Create: `tests/api/modules/books/id.test.js`
- Create: `tests/api/modules/books/chapters.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | `GET /api/modules/books` -> 200 + `{success:true, books:[]}` |
| Edge | 无 JWT -> 401; 非 admin POST -> 403; POST 缺 title -> 400 |
| Regression | `npm test` 全绿，现有 attendance API 不受影响 |

**Interfaces:**
- Produces: `/api/modules/books` (GET/POST), `/api/modules/books/{id}` (GET/PUT/DELETE), `/api/modules/books/{id}/chapters` (GET/POST)

- [ ] **Step 1: RED - 写测试**

Create: `tests/api/modules/books/index.test.js` - 测试 GET 返回书籍列表, POST 无 JWT 返回 401, POST 非 admin 返回 403, POST 缺 title 返回 400
Create: `tests/api/modules/books/id.test.js` - 测试 GET 返回单本书+章节, PUT 更新, DELETE 删除
Create: `tests/api/modules/books/chapters.test.js` - 测试 GET 返回章节列表, POST 添加章节

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/api/modules/books/
# 预期: FAIL - 端点不存在
```

- [ ] **Step 3: GREEN - 实现 API**

`books/index.js`: GET 返回所有书籍 (queryAll), POST 管理员创建 (检查 admin, generateId, INSERT)
`books/[id].js`: GET 返回单本书详情+章节列表, PUT 动态字段更新, DELETE (CASCADE 删章节)
`books/[id]/chapters.js`: GET 返回章节列表 (ORDER BY sort_order), POST 管理员添加章节

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run tests/api/modules/books/
# 预期: PASS
```

- [ ] **Step 5: SURFACE**

```bash
npx wrangler pages dev course-app --local
curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"title":"test","language":"zh"}' http://localhost:8788/api/modules/books
# 预期: 200 + {success:true, book:{...}}
```

- [ ] **Step 6: REFACTOR** - 检查错误处理一致性

- [ ] **Step 7: REGRESSION** - `npm test` 全量回归

- [ ] **Step 8: Commit**

```bash
git add functions/api/modules/books/ tests/api/modules/books/
git commit -m "feat: add books CRUD API with chapter management"
```

---

### Task B3: 导入现有书籍内容脚本

**Files:**
- Create: `scripts/import-books.py`
- Create: `migrations/006-import-books-data.sql` (生成产物)
- Create: `tests/unit/import-books.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | 脚本运行后 `SELECT COUNT(*) FROM books` -> 3, `SELECT COUNT(*) FROM book_chapters` -> 50 |
| Edge | 不存在的源目录 -> 脚本报错退出 (非零 exit code) |
| Regression | 现有 books 表数据不受影响 (UPSERT 或 INSERT IGNORE) |

**TDD 例外说明:** 导入脚本是数据迁移工具，非生产代码。测试验证脚本输出正确性 (SQL 文件内容)，非运行时行为。

**Interfaces:**
- Produces: 将 oikos_church/zh, oikos_church/en, lordship_gospel 三套书导入 D1 books + book_chapters 表

- [ ] **Step 1: RED - 写测试验证脚本输出**

Create: `tests/unit/import-books.test.js` - 运行脚本，验证生成的 SQL 文件包含 3 条 INSERT INTO books 和 50 条 INSERT INTO book_chapters

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/unit/import-books.test.js
# 预期: FAIL - 脚本不存在
```

- [ ] **Step 3: GREEN - 写导入脚本**

Python 脚本，使用 bs4 解析每本书的 `index.html` 获取 TOC，然后：
1. INSERT 到 `books` 表 (title, language, source_path)
2. 遍历 TOC 中的章节链接，INSERT 到 `book_chapters` 表
3. 输出 SQL 文件供 wrangler 执行

数据源：`oikos_church/zh/book2/` (18 章), `oikos_church/en/book2/` (18 章), `lordship_gospel/book2/` (14 章)

- [ ] **Step 4: Verify GREEN - 脚本生成正确**

```bash
python3 scripts/import-books.py > migrations/006-import-books-data.sql
npx vitest run tests/unit/import-books.test.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE - 执行导入并验证真实 D1**

```bash
npx wrangler d1 execute brianinchrist-db --local --file=migrations/006-import-books-data.sql
npx wrangler d1 execute brianinchrist-db --local --command="SELECT COUNT(*) FROM books;"
# 预期: 3
npx wrangler d1 execute brianinchrist-db --local --command="SELECT COUNT(*) FROM book_chapters;"
# 预期: 50
```

- [ ] **Step 6: REFACTOR** - 检查 SQL 注入安全性 (参数化)

- [ ] **Step 7: REGRESSION** - `npm test` 全量回归

- [ ] **Step 8: Commit**

```bash
git add scripts/import-books.py migrations/006-import-books-data.sql tests/unit/import-books.test.js
git commit -m "feat: import existing books into D1 (oikos_church zh/en + lordship_gospel)"
```

---

### Task B4: 扩展课程 API 支持书籍关联

**Files:**
- Modify: `functions/api/modules/courses/catalog.js` (POST 支持新字段)
- Modify: `functions/api/modules/courses/items.js` (POST 支持 book_id/book_chapter_id)
- Create: `tests/api/modules/courses/catalog-extend.test.js`
- Create: `tests/api/modules/courses/items-extend.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | POST /api/modules/courses 带 start_date/end_date -> 200 + 课程创建成功 |
| Edge | POST 无 JWT -> 401; book_id 不存在 -> 400 |
| Regression | 现有课程数据不受影响 (旧课程无 start_date 仍可查询) |

- [ ] **Step 1: RED - 写测试验证新字段被接受**

`tests/api/modules/courses/catalog-extend.test.js` - POST 带 start_date/end_date -> 200 + 返回包含新字段
`tests/api/modules/courses/items-extend.test.js` - POST 带 book_id/book_chapter_id -> 200

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/api/modules/courses/catalog-extend.test.js tests/api/modules/courses/items-extend.test.js
# 预期: FAIL - 新字段未被接受
```

- [ ] **Step 3: GREEN - 修改 API**

`catalog.js` POST: INSERT courses 时增加 `start_date`, `end_date` 字段
`items.js` POST: INSERT course_items 时增加 `book_id`, `book_chapter_id` 字段

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run tests/api/modules/courses/catalog-extend.test.js tests/api/modules/courses/items-extend.test.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE**

```bash
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"title":"test","start_date":"2026-01-01","end_date":"2026-12-31"}' \
  http://localhost:8788/api/modules/courses
# 预期: 200 + 返回含 start_date
```

- [ ] **Step 6: REFACTOR** - 检查字段验证

- [ ] **Step 7: REGRESSION** - `npm test` 全量回归

- [ ] **Step 8: Commit**

```bash
git add functions/api/modules/courses/ tests/api/modules/courses/
git commit -m "feat: extend course APIs to support book/chapter associations"
```

---

### Task B5: 书籍管理前端页面

**Files:**
- Create: `course-app/admin/books.html`
- Create: `course-app/assets/js/books.js`
- Modify: `course-app/index.html` (添加导航入口)
- Create: `tests/e2e/admin-books.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 打开 /course-app/admin/books.html -> 显示书籍列表表格 |
| Edge | 未登录 -> 跳转 login.html; 点击书籍 -> 展开章节列表 |
| Regression | 现有 admin 页面 (attendance 等) 不受影响 |

- [ ] **Step 1: RED - 写 Playwright E2E 测试**

Create: `tests/e2e/admin-books.spec.js`
- 测试: 未登录跳转 login.html
- 测试: 页面加载显示书籍列表表格
- 测试: 点击书籍展开章节
- 测试: 创建书籍表单提交

- [ ] **Step 2: Verify RED**

```bash
npx playwright test tests/e2e/admin-books.spec.js
# 预期: FAIL - 页面不存在
```

- [ ] **Step 3: GREEN - 实现页面**

`admin/books.html`: 复用 admin layout，书籍列表表格 + 创建 modal + 章节展开
`assets/js/books.js`: IIFE 封装，fetchBooks/createBook/fetchChapters/addChapter
`index.html`: admin 导航添加"书籍管理"链接

- [ ] **Step 4: Verify GREEN**

```bash
npx playwright test tests/e2e/admin-books.spec.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE - 浏览器验证**

Playwright 截图: `/course-app/admin/books.html` 显示书籍管理页 + 书籍列表

- [ ] **Step 6: REFACTOR** - 检查样式一致性 (Scriptorium)

- [ ] **Step 7: REGRESSION** - `npm test` 全量回归

- [ ] **Step 8: Commit**

```bash
git add course-app/admin/books.html course-app/assets/js/books.js course-app/index.html tests/e2e/admin-books.spec.js
git commit -m "feat: add book management admin page with chapter listing"
```

### Phase B Gate

**Completion Promise:**
- `npx vitest run tests/migrations/004-books.test.js tests/migrations/005-course-extend.test.js` -> PASS
- `npx vitest run tests/api/modules/books/` -> PASS (CRUD 全绿)
- `npx playwright test tests/e2e/admin-books.spec.js` -> PASS (书籍管理页面 E2E)
- `npm test` -> 全绿
- SURFACE: `curl http://localhost:8788/api/modules/books` -> 200 + 书籍列表
- SURFACE: 浏览器访问 `/course-app/admin/books.html` -> 显示书籍管理页

**Oracle 验证:** Oracle 审查 (1) 书籍表结构是否支持章节层级 (2) 课程扩展字段是否影响现有数据 (3) 导入脚本是否正确处理现有 oikos_church 内容。

---

## Phase C: 作业系统

> **TDD**: 每个任务必须先写测试。Migration 任务: `tests/migrations/007-assignments.test.js` 验证表存在。API 任务: `tests/api/modules/assignments/*.test.js` 验证端点行为 (200/401/403/400)。前端任务: `tests/e2e/student-assignments.spec.js` + `tests/e2e/admin-assignments.spec.js` 验证页面交互。

### Task C1: 创建 migration 007 (作业 3 张表)

**Files:**
- Create: `migrations/007-assignments.sql`
- Create: `tests/migrations/007-assignments.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | 3 张表 (assignments, assignment_submissions, assignment_grades) 存在 |
| Edge | assignment_submissions 有 UNIQUE(assignment_id, student_id); assignments 有 status 默认值 |
| Regression | 现有表不受影响 |

- [ ] **Step 1: RED - 写测试验证 3 张表存在 + UNIQUE 约束**

Create: `tests/migrations/007-assignments.test.js` - 验证 3 张表存在, UNIQUE(assignment_id, student_id) 约束

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/migrations/007-assignments.test.js
# 预期: FAIL - 表不存在
```

- [ ] **Step 3: GREEN - 写迁移文件并执行**

SQL 见设计文档 Section 4.7。3 张表: `assignments`, `assignment_submissions` (UNIQUE assignment+student), `assignment_grades`

```bash
npx wrangler d1 execute brianinchrist-db --local --file=migrations/007-assignments.sql
npx wrangler d1 execute brianinchrist-db --remote --file=migrations/007-assignments.sql
```

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run tests/migrations/007-assignments.test.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE** - `wrangler d1 execute ... --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'assignment%'"` -> 3 行

- [ ] **Step 6: REFACTOR** - 检查索引完整

- [ ] **Step 7: REGRESSION** - `npm test`

- [ ] **Step 8: Commit**

```bash
git add migrations/007-assignments.sql tests/migrations/007-assignments.test.js
git commit -m "feat: add assignments, submissions, grades tables"
```

---

### Task C2: 作业 CRUD API

**Files:**
- Create: `functions/api/modules/assignments/index.js` (GET/POST)
- Create: `functions/api/modules/assignments/[id].js` (GET/PUT/DELETE)
- Create: `tests/api/modules/assignments/index.test.js`
- Create: `tests/api/modules/assignments/id.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | `GET /api/modules/assignments?course_id=x` -> 200 + `{assignments:[]}` |
| Edge | 无 JWT -> 401; 学生 POST -> 403; POST 缺 title -> 400 |
| Regression | `npm test` 全绿，现有 API 不受影响 |

- [ ] **Step 1: RED** - 写测试: GET 返回列表, POST 无 JWT 401, POST 非 teacher 403, POST 缺 title 400, GET/PUT/DELETE [id]
- [ ] **Step 2: Verify RED** - `npx vitest run tests/api/modules/assignments/` -> FAIL
- [ ] **Step 3: GREEN** - `index.js`: GET 按 course_id 查询 (JOIN courses), POST 教师/管理员创建 (检查角色). `[id].js`: GET 详情, PUT 更新, DELETE (CASCADE)
- [ ] **Step 4: Verify GREEN** - `npx vitest run tests/api/modules/assignments/` -> PASS
- [ ] **Step 5: SURFACE** - `curl GET http://localhost:8788/api/modules/assignments?course_id=test` -> 200
- [ ] **Step 6: REFACTOR** - 检查错误处理一致性
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add functions/api/modules/assignments/ tests/api/modules/assignments/ && git commit -m "feat: add assignments CRUD API"`

---

### Task C3: 作业提交和批改 API

**Files:**
- Create: `functions/api/modules/assignments/[id]/submit.js` (POST)
- Create: `functions/api/modules/assignments/[id]/submissions.js` (GET)
- Create: `functions/api/modules/assignments/submissions/[id]/grade.js` (POST)
- Create: `tests/api/modules/assignments/submit.test.js`
- Create: `tests/api/modules/assignments/grade.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | 学生 POST submit -> 200 + `{success:true}`; 教师 POST grade -> 200 |
| Edge | 重复提交 -> UPSERT 更新; 过期提交 -> status='late'; 非学生 submit -> 403; 非教师 grade -> 403 |
| Regression | `npm test` 全绿 |

- [ ] **Step 1: RED** - 写测试: 学生提交 (UPSERT), 教师查看提交列表, 教师批改 (INSERT/UPDATE grades + 更新 status='graded'), 重复提交 UPSERT, 过期提交 late
- [ ] **Step 2: Verify RED** - `npx vitest run tests/api/modules/assignments/submit.test.js tests/api/modules/assignments/grade.test.js` -> FAIL
- [ ] **Step 3: GREEN** - `submit.js`: POST 学生提交 (UPSERT, 检查 due_date 判断 late). `submissions.js`: GET 教师查看提交列表 (JOIN users + LEFT JOIN grades). `grade.js`: POST 教师批改 (INSERT/UPDATE grades, 更新 submission.status)
- [ ] **Step 4: Verify GREEN** - 测试通过
- [ ] **Step 5: SURFACE** - `curl POST .../assignments/{id}/submit` -> 200; `curl POST .../submissions/{id}/grade` -> 200
- [ ] **Step 6: REFACTOR** - 检查分数边界 (0-max_score)
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add functions/api/modules/assignments/ tests/api/modules/assignments/ && git commit -m "feat: add assignment submit, list submissions, and grade API"`

---

### Task C4: 学生作业页面

**Files:**
- Create: `course-app/student/assignments.html`
- Create: `course-app/assets/js/student-assignments.js`
- Create: `tests/e2e/student-assignments.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 打开页面 -> 显示作业列表; 点击作业 -> 展开提交区; 提交 -> 成功提示 |
| Edge | 未登录 -> 跳转 login.html; 已批改作业 -> 显示分数+反馈 |
| Regression | 现有学生页面不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 未登录跳转, 页面加载显示列表, 点击展开提交, 提交成功, 已批改显示分数
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/student-assignments.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `assignments.html`: 课程选择器 + 作业列表 (title/type/due_date/status/score) + 提交区 (textarea + 提交) + 已批改显示. `student-assignments.js`: fetchAssignments + submitAssignment
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 学生作业页显示列表 + 提交表单
- [ ] **Step 6: REFACTOR** - 检查 Scriptorium 样式
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add course-app/student/assignments.html course-app/assets/js/student-assignments.js tests/e2e/student-assignments.spec.js && git commit -m "feat: add student assignments page with submission form"`

---

### Task C5: 教师作业管理页面

**Files:**
- Create: `course-app/admin/assignments.html`
- Create: `course-app/assets/js/admin-assignments.js`
- Create: `tests/e2e/admin-assignments.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 打开 -> 显示作业列表; 创建作业 -> 列表更新; 点击作业 -> 显示提交列表; 批改 -> 成功 |
| Edge | 未登录 -> 跳转 login.html; 非教师 -> 403 |
| Regression | 现有 admin 页面不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 未登录跳转, 创建作业, 查看提交列表, 批改提交
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/admin-assignments.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `admin/assignments.html`: 课程选择器 + 作业 CRUD + 创建 modal + 提交列表 + 批改 modal. `admin-assignments.js`: fetchAssignments/createAssignment/fetchSubmissions/gradeSubmission
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 教师作业管理页 + 批改 modal
- [ ] **Step 6: REFACTOR** - 检查样式一致性
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add course-app/admin/assignments.html course-app/assets/js/admin-assignments.js tests/e2e/admin-assignments.spec.js && git commit -m "feat: add teacher assignment management page with grading"`

### Phase C Gate

**Completion Promise:**
- `npx vitest run tests/migrations/007-assignments.test.js` -> PASS
- `npx vitest run tests/api/modules/assignments/` -> PASS (CRUD + 提交 + 批改)
- `npx playwright test tests/e2e/student-assignments.spec.js tests/e2e/admin-assignments.spec.js` -> PASS
- `npm test` -> 全绿
- SURFACE: `curl POST http://localhost:8788/api/modules/assignments` -> 200 + 创建成功
- SURFACE: 学生提交作业 -> 教师批改 -> 学生看到成绩

**Oracle 验证:** Oracle 审查作业提交流程的完整性 (防重复提交、分数边界、状态流转)。

---

## Phase D: 视频教学

> **TDD**: Migration: `tests/migrations/008-videos.test.js`。API: `tests/api/modules/videos/*.test.js` (CRUD + 观看记录 UPSERT)。前端: `tests/e2e/student-videos.spec.js` (视频播放 + 观看记录追踪)。

### Task D1: 创建 migration 008 (视频 2 张表)

**Files:**
- Create: `migrations/008-videos.sql`
- Create: `tests/migrations/008-videos.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | video_lessons + video_watch_logs 表存在 |
| Edge | video_watch_logs 有 UNIQUE(video_lesson_id, student_id) |
| Regression | 现有表不受影响 |

- [ ] **Step 1: RED** - 写测试验证 2 张表存在 + UNIQUE 约束
- [ ] **Step 2: Verify RED** - `npx vitest run tests/migrations/008-videos.test.js` -> FAIL
- [ ] **Step 3: GREEN** - 写迁移文件 (video_lessons + video_watch_logs, UNIQUE video+student) 并执行
- [ ] **Step 4: Verify GREEN** - 测试通过
- [ ] **Step 5: SURFACE** - `wrangler d1 execute ... --command="SELECT name FROM sqlite_master WHERE name LIKE 'video%'"` -> 2 行
- [ ] **Step 6: REFACTOR** - 检查索引
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add migrations/008-videos.sql tests/migrations/008-videos.test.js && git commit -m "feat: add video_lessons and video_watch_logs tables"`

---

### Task D2: 视频 CRUD API + 观看记录 API

**Files:**
- Create: `functions/api/modules/videos/index.js` (GET/POST)
- Create: `functions/api/modules/videos/[id].js` (GET/PUT/DELETE)
- Create: `functions/api/modules/videos/[id]/log.js` (POST/GET)
- Create: `tests/api/modules/videos/index.test.js`
- Create: `tests/api/modules/videos/log.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | `GET /api/modules/videos?course_id=x` -> 200; `POST .../log` -> 200 UPSERT |
| Edge | 无 JWT -> 401; 非教师 POST -> 403; 重复 log -> UPSERT 更新非报错 |
| Regression | `npm test` 全绿 |

- [ ] **Step 1: RED** - 写测试: GET 视频列表, POST 创建 (teacher/advisor/admin), GET/PUT/DELETE [id], POST log (UPSERT), GET log (教师查看)
- [ ] **Step 2: Verify RED** - `npx vitest run tests/api/modules/videos/` -> FAIL
- [ ] **Step 3: GREEN** - `index.js`: GET 按 course_id/class_id 查询, POST 教师/班主任创建. `[id].js`: GET/PUT/DELETE. `log.js`: POST 学生 UPSERT 观看记录 (watch_duration/last_position/completed), GET 教师查看所有记录
- [ ] **Step 4: Verify GREEN** - 测试通过
- [ ] **Step 5: SURFACE** - `curl GET .../videos?course_id=test` -> 200; `curl POST .../videos/{id}/log` -> 200
- [ ] **Step 6: REFACTOR** - 检查 UPSERT 逻辑
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add functions/api/modules/videos/ tests/api/modules/videos/ && git commit -m "feat: add video lessons CRUD and watch log API"`

---

### Task D3: 视频教学前端页面

**Files:**
- Create: `course-app/student/videos.html`
- Create: `course-app/assets/js/student-videos.js`
- Create: `tests/e2e/student-videos.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 打开 -> 显示视频列表; 点击视频 -> 播放器加载; 播放 -> 进度记录 |
| Edge | 未登录 -> 跳转 login.html; 重新打开 -> 恢复上次进度 |
| Regression | 现有学生页面不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 未登录跳转, 视频列表显示, 播放器加载, 观看进度更新
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/student-videos.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `videos.html`: 课程选择器 + 视频列表 (thumbnail/title/duration/status) + HTML5 video player + 进度. `student-videos.js`: fetchVideos/updateWatchLog, timeupdate 每 30s POST, ended 设置 completed, 加载恢复 last_position
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 视频列表 + 播放器
- [ ] **Step 6: REFACTOR** - 检查样式
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add course-app/student/videos.html course-app/assets/js/student-videos.js tests/e2e/student-videos.spec.js && git commit -m "feat: add student video page with HTML5 player and watch tracking"`

### Phase D Gate

**Completion Promise:**
- `npx vitest run tests/migrations/008-videos.test.js` -> PASS
- `npx vitest run tests/api/modules/videos/` -> PASS (CRUD + 观看记录 UPSERT)
- `npx playwright test tests/e2e/student-videos.spec.js` -> PASS
- `npm test` -> 全绿
- SURFACE: `curl GET http://localhost:8788/api/modules/videos?course_id=test` -> 200
- SURFACE: 浏览器播放视频 -> 观看进度记录更新

**Oracle 验证:** Oracle 审查观看记录 UPSERT 逻辑 (UNIQUE video+student 约束、进度恢复)。

---

## Phase E: 考核系统

> **TDD**: Migration: `tests/migrations/009-assessments.test.js` (4 张表 + UNIQUE 约束)。API: `tests/api/modules/assessments/*.test.js` (CRUD + 开始/提交/自动评分/手动评分)。自动评分逻辑需覆盖: 客观题自动打分、主观题待评分、混合题型部分自动评分。前端: `tests/e2e/student-assessments.spec.js` (倒计时 + 自动提交) + `tests/e2e/admin-assessments.spec.js`。

### Task E1: 创建 migration 009 (考核 4 张表)

**Files:**
- Create: `migrations/009-assessments.sql`
- Create: `tests/migrations/009-assessments.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | 4 张表 (assessments, assessment_questions, assessment_submissions, assessment_answers) 存在 |
| Edge | assessment_submissions 有 UNIQUE(assessment_id, student_id) |
| Regression | 现有表不受影响 |

- [ ] **Step 1: RED** - 写测试验证 4 张表存在 + UNIQUE 约束
- [ ] **Step 2: Verify RED** - `npx vitest run tests/migrations/009-assessments.test.js` -> FAIL
- [ ] **Step 3: GREEN** - 写迁移文件 (4 张表: assessments, assessment_questions, assessment_submissions UNIQUE assessment+student, assessment_answers) 并执行
- [ ] **Step 4: Verify GREEN** - 测试通过
- [ ] **Step 5: SURFACE** - `wrangler d1 execute ... --command="SELECT name FROM sqlite_master WHERE name LIKE 'assessment%'"` -> 4 行
- [ ] **Step 6: REFACTOR** - 检查索引
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add migrations/009-assessments.sql tests/migrations/009-assessments.test.js && git commit -m "feat: add assessments, questions, submissions, answers tables"`

---

### Task E2: 考核 CRUD + 题目管理 API

**Files:**
- Create: `functions/api/modules/assessments/index.js` (GET/POST)
- Create: `functions/api/modules/assessments/[id].js` (GET/PUT/DELETE)
- Create: `functions/api/modules/assessments/[id]/questions.js` (GET/POST)
- Create: `tests/api/modules/assessments/index.test.js`
- Create: `tests/api/modules/assessments/questions.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | `GET /api/modules/assessments?course_id=x` -> 200; POST 创建 -> 200 |
| Edge | 无 JWT -> 401; 非教师 POST -> 403; 学生 GET [id] 不含 correct_answer |
| Regression | `npm test` 全绿 |

- [ ] **Step 1: RED** - 写测试: GET 列表, POST 创建 (teacher/admin), GET [id] (学生不含 correct_answer), PUT/DELETE, GET/POST questions
- [ ] **Step 2: Verify RED** - `npx vitest run tests/api/modules/assessments/` -> FAIL
- [ ] **Step 3: GREEN** - `index.js`: GET 按 course_id, POST 教师创建. `[id].js`: GET (学生不含 correct_answer), PUT/DELETE. `questions.js`: GET (教师含 correct_answer/学生不含), POST 教师添加题目
- [ ] **Step 4: Verify GREEN** - 测试通过
- [ ] **Step 5: SURFACE** - `curl GET .../assessments?course_id=test` -> 200
- [ ] **Step 6: REFACTOR** - 检查角色过滤逻辑
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add functions/api/modules/assessments/ tests/api/modules/assessments/ && git commit -m "feat: add assessments CRUD and questions management API"`

---

### Task E3: 考试流程 API (开始/提交/评分) ⚠️ Reviewer Gate: deep category + Oracle

**Files:**
- Create: `functions/api/modules/assessments/[id]/start.js` (POST)
- Create: `functions/api/modules/assessments/[id]/submit.js` (POST)
- Create: `functions/api/modules/assessments/submissions/[id]/grade.js` (POST)
- Create: `tests/api/modules/assessments/start.test.js`
- Create: `tests/api/modules/assessments/submit.test.js`
- Create: `tests/api/modules/assessments/grade.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | POST start -> 200 + 题目列表; POST submit -> 200 + 自动评分; POST grade -> 200 |
| Edge | 超时间窗口 start -> 400; 重复 start -> 400; 全客观题 submit -> status='graded'; 含主观题 -> status='submitted' |
| Regression | `npm test` 全绿 |

**Reviewer Gate:** E3 属高难度逻辑 -> 必须用 `deep` category 派发 + Oracle 审查自动评分逻辑。

- [ ] **Step 1: RED** - 写测试: start (时间窗口检查, 防重复, 返回题目不含 correct_answer), submit (INSERT answers, 自动评分客观题, 全客观->graded/含主观->submitted), grade (教师评分, 重算 total_score, status='graded')
- [ ] **Step 2: Verify RED** - `npx vitest run tests/api/modules/assessments/start.test.js tests/api/modules/assessments/submit.test.js tests/api/modules/assessments/grade.test.js` -> FAIL
- [ ] **Step 3: GREEN** - `start.js`: POST 学生开始 (检查 available_from/until, 防重复, 创建 submission status='in_progress', 返回题目不含 correct_answer). `submit.js`: POST 学生提交 (INSERT answers, 自动评分 multiple_choice/true_false/fill_blank 对比 correct_answer, 全客观->graded/含主观->submitted). `grade.js`: POST 教师手动评分 (UPDATE answers, 重算 total_score, status='graded')
- [ ] **Step 4: Verify GREEN** - 测试通过
- [ ] **Step 5: SURFACE** - `curl POST .../assessments/{id}/start` -> 200 + 题目; `curl POST .../submit` -> 200 + 分数
- [ ] **Step 6: REFACTOR** - 检查分数边界 (0-points)
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add functions/api/modules/assessments/ tests/api/modules/assessments/ && git commit -m "feat: add exam flow API (start, submit, auto-grade, manual grade)"`

---

### Task E4: 学生考试页面

**Files:**
- Create: `course-app/student/assessments.html`
- Create: `course-app/assets/js/student-assessments.js`
- Create: `tests/e2e/student-assessments.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 打开 -> 显示考核列表; 开始考试 -> 倒计时运行; 提交 -> 成功 |
| Edge | 未登录 -> 跳转 login.html; 时间到 -> 自动提交; 已评分 -> 显示分数 |
| Regression | 现有学生页面不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 未登录跳转, 考核列表, 开始考试+倒计时, 题型渲染 (radio/checkbox/textarea/input), 提交, 时间到自动提交, 已评分显示
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/student-assessments.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `assessments.html`: 课程选择器 + 考核列表 + 考试界面 (倒计时/题目渲染/提交) + 已评分显示. `student-assessments.js`: fetchAssessments/startExam/submitExam, setInterval 倒计时, 时间到自动提交, 题型渲染, 答案暂存
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 考试界面 + 倒计时
- [ ] **Step 6: REFACTOR** - 检查样式
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add course-app/student/assessments.html course-app/assets/js/student-assessments.js tests/e2e/student-assessments.spec.js && git commit -m "feat: add student exam page with timer and question rendering"`

---

### Task E5: 教师考核管理页面

**Files:**
- Create: `course-app/admin/assessments.html`
- Create: `course-app/assets/js/admin-assessments.js`
- Create: `tests/e2e/admin-assessments.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 打开 -> 显示考核列表; 创建考核 -> 列表更新; 添加题目 -> 成功; 批改 -> 成功 |
| Edge | 未登录 -> 跳转 login.html; 非教师 -> 403 |
| Regression | 现有 admin 页面不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 未登录跳转, 创建考核, 题目管理, 提交批改
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/admin-assessments.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `admin/assessments.html`: 课程选择器 + 考核 CRUD + 创建 modal + 题目管理 + 批改. `admin-assessments.js`: CRUD + fetchQuestions/addQuestion/gradeAnswers
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 教师考核管理页 + 批改界面
- [ ] **Step 6: REFACTOR** - 检查样式
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add course-app/admin/assessments.html course-app/assets/js/admin-assessments.js tests/e2e/admin-assessments.spec.js && git commit -m "feat: add teacher assessment management page with grading"`

### Phase E Gate

**Completion Promise:**
- `npx vitest run tests/migrations/009-assessments.test.js` -> PASS (4 张表 + UNIQUE 约束)
- `npx vitest run tests/api/modules/assessments/` -> PASS (CRUD + start/submit/grade)
- `npx playwright test tests/e2e/student-assessments.spec.js tests/e2e/admin-assessments.spec.js` -> PASS
- `npm test` -> 全绿
- SURFACE: 学生开始考试 -> 倒计时运行 -> 提交 -> 自动评分 -> 教师手动评分主观题
- SURFACE: 客观题自动评分正确 (对比 correct_answer)

**Oracle 验证:** Oracle 审查自动评分逻辑 (客观题对比、主观题待评、混合题型部分自动评分、分数边界)。

**Reviewer Gate 触发:** E3 (自动评分) 属高难度逻辑 -> 必须用 `deep` category 派发 + Oracle 审查。

---

## Phase F: 成绩管理

> **TDD**: Migration: `tests/migrations/010-grades.test.js`。API: `tests/api/modules/grades/*.test.js`。**成绩计算引擎 (`grades/calculate.js`) 必须用 `deep` category 派发**，测试覆盖: 各 component 归一化计算、weight 加权汇总、letter_grade 映射、breakdown JSON 结构。前端: `tests/e2e/student-grades.spec.js` + `tests/e2e/admin-grades.spec.js`。

### Task F1: 创建 migration 010 (成绩 2 张表)

**Files:**
- Create: `migrations/010-grades.sql`
- Create: `tests/migrations/010-grades.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | grade_components + final_grades 表存在 |
| Edge | grade_components 有 UNIQUE(course_id, name); final_grades 有 UNIQUE(student_id, course_id) |
| Regression | 现有表不受影响 |

- [ ] **Step 1: RED** - 写测试验证 2 张表存在 + UNIQUE 约束
- [ ] **Step 2: Verify RED** - `npx vitest run tests/migrations/010-grades.test.js` -> FAIL
- [ ] **Step 3: GREEN** - 写迁移文件 (grade_components UNIQUE course+name, final_grades UNIQUE student+course, breakdown TEXT for JSON) 并执行
- [ ] **Step 4: Verify GREEN** - 测试通过
- [ ] **Step 5: SURFACE** - `wrangler d1 execute ... --command="SELECT name FROM sqlite_master WHERE name LIKE 'grade%' OR name LIKE 'final%'"` -> 2 行
- [ ] **Step 6: REFACTOR** - 检查索引
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add migrations/010-grades.sql tests/migrations/010-grades.test.js && git commit -m "feat: add grade_components and final_grades tables"`

---

### Task F2: 成绩构成 + 计算 + 查询 API ⚠️ Reviewer Gate: deep category + Oracle

**Files:**
- Create: `functions/api/modules/grades/components.js` (GET/POST/PUT/DELETE)
- Create: `functions/api/modules/grades/calculate.js` (POST)
- Create: `functions/api/modules/grades/final.js` (GET)
- Create: `tests/api/modules/grades/components.test.js`
- Create: `tests/api/modules/grades/calculate.test.js`
- Create: `tests/api/modules/grades/final.test.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | POST calculate -> 200 + `{success:true}`; GET final -> 200 + `{grades:[...]}` |
| Edge | 各 component 归一化: assignment AVG(score/max*100), assessment SUM(submissions/total*100)/COUNT, attendance (present+late)/total*100, video completed/total*100, participation answered/total*100; letter_grade: A(>=90) B(>=80) C(>=70) D(>=60) F(<60); 无 JWT -> 401; 非教师 calculate -> 403 |
| Regression | `npm test` 全绿 |

**Reviewer Gate:** F2 属高难度逻辑 -> 必须用 `deep` category 派发 + Oracle 审查计算引擎。

- [ ] **Step 1: RED** - 写测试: components CRUD (GET/POST/PUT/DELETE), calculate (各 component 归一化计算 + weight 加权 + letter_grade 映射 + breakdown JSON), final (学生查自己/教师查全班)
- [ ] **Step 2: Verify RED** - `npx vitest run tests/api/modules/grades/` -> FAIL
- [ ] **Step 3: GREEN** - `components.js`: GET 按 course_id, POST 教师创建 (component_type/weight), PUT/DELETE. `calculate.js`: POST 教师/管理员触发 (获取 components -> 每学生计算各 component 归一化 0-100 -> total=SUM(score*weight) -> letter_grade -> UPSERT final_grades with breakdown JSON). `final.js`: GET 学生查自己/教师查全班
- [ ] **Step 4: Verify GREEN** - 测试通过
- [ ] **Step 5: SURFACE** - `curl POST .../grades/calculate?course_id=test` -> 200; `curl GET .../grades/final?course_id=test` -> 200 + grades
- [ ] **Step 6: REFACTOR** - 检查计算精度
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add functions/api/modules/grades/ tests/api/modules/grades/ && git commit -m "feat: add grade components, calculation engine, and final grades API"`

---

### Task F3: 成绩看板前端

**Files:**
- Create: `course-app/student/grades.html` + `course-app/assets/js/student-grades.js`
- Create: `course-app/admin/grades.html` + `course-app/assets/js/admin-grades.js`
- Create: `tests/e2e/student-grades.spec.js`
- Create: `tests/e2e/admin-grades.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 学生页 -> 显示成绩卡片 + 明细; Playwright 教师页 -> 配置构成 + 计算按钮 + 全班成绩 |
| Edge | 未登录 -> 跳转 login.html; 无成绩 -> 显示"暂无" |
| Regression | 现有页面不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 学生成绩页 (卡片+明细表), 教师成绩页 (构成 CRUD + 计算按钮 + 全班表)
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/student-grades.spec.js tests/e2e/admin-grades.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `student/grades.html`: 课程选择器 + 成绩卡片 (total_score/letter_grade) + 明细表 (component/weight/score) + 子明细. `admin/grades.html`: 课程/班级选择器 + 构成配置 CRUD + 计算按钮 + 全班成绩表 + 审批. JS: fetchComponents/createComponent/calculateGrades/fetchFinalGrades
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 学生成绩仪表盘 + 教师成绩管理
- [ ] **Step 6: REFACTOR** - 检查样式
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add course-app/student/grades.html course-app/admin/grades.html course-app/assets/js/student-grades.js course-app/assets/js/admin-grades.js tests/e2e/student-grades.spec.js tests/e2e/admin-grades.spec.js && git commit -m "feat: add student and teacher grade dashboard pages"`

### Phase F Gate

**Completion Promise:**
- `npx vitest run tests/migrations/010-grades.test.js` -> PASS
- `npx vitest run tests/api/modules/grades/` -> PASS (components + calculate + final)
- `npx playwright test tests/e2e/student-grades.spec.js tests/e2e/admin-grades.spec.js` -> PASS
- `npm test` -> 全绿
- SURFACE: 教师配置成绩构成 -> 触发计算 -> 学生看到最终成绩 + letter_grade + breakdown
- SURFACE: 各 component 归一化计算正确 (assignment/assessment/attendance/video/participation)

**Oracle 验证:** Oracle 审查成绩计算引擎 (加权汇总、归一化、letter_grade 映射、breakdown JSON 结构)。

**Reviewer Gate 触发:** F2 (成绩计算引擎) 属高难度逻辑 -> 必须用 `deep` category 派发 + Oracle 审查。

---

## Phase G: 互动功能前端

> **TDD**: 前端交互测试用 Playwright。高亮批注: `tests/e2e/highlights.spec.js` (文本选择 -> 创建高亮 -> 渲染高亮 -> 评论)。问答: `tests/e2e/student-questions.spec.js` (提问 -> 回答 -> 官方标记)。证书: `tests/e2e/student-certificate.spec.js` + `tests/e2e/admin-reports.spec.js`。

### Task G1: 课件高亮批注前端

**Files:**
- Create: `brianinchrist/organicchurch/assets/js/highlights.js`
- Modify: `brianinchrist/organicchurch/books/oikos_church/assets/js/courseware-panel.js`
- Create: `tests/e2e/highlights.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 选择文本 -> 出现工具栏 -> 创建高亮 -> 重新加载高亮仍在 |
| Edge | 未登录 -> 无工具栏; 空选择 -> 无工具栏 |
| Regression | 现有课件阅读器功能不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 选择文本 -> 工具栏出现, 创建高亮 -> POST 成功, 重新加载 -> 高亮渲染 (mark 标签), 评论显示/折叠
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/highlights.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `highlights.js`: 监听 mouseup+getSelection, 浮动工具栏 (颜色+评论), POST /api/modules/interactions/highlights, GET 加载高亮, mark 标签渲染, 评论显示/折叠. `courseware-panel.js`: 章节渲染完成后加载并渲染高亮
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 课件中选中文本+工具栏+高亮渲染
- [ ] **Step 6: REFACTOR** - 检查 visibility 控制 (private/class/public)
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add brianinchrist/organicchurch/assets/js/highlights.js brianinchrist/organicchurch/books/oikos_church/assets/js/courseware-panel.js tests/e2e/highlights.spec.js && git commit -m "feat: add text highlight and annotation UI in courseware reader"`

---

### Task G2: 问答讨论页面

**Files:**
- Create: `course-app/student/questions.html`
- Create: `course-app/assets/js/student-questions.js`
- Create: `tests/e2e/student-questions.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 打开 -> 显示提问列表; 创建提问 -> 列表更新; 查看问题 -> 显示回答; 回答 -> 成功 |
| Edge | 未登录 -> 跳转 login.html; 官方回答 -> has_official badge 显示 |
| Regression | 现有学生页面不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 未登录跳转, 提问列表显示, 创建提问 (modal), 问题详情 (body+回答列表), 回答提交, 官方 badge
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/student-questions.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `questions.html`: 课程选择器 + 提问列表 (title/status/answer_count/has_official) + 提问 modal + 问题详情 (body+回答+回答表单). `student-questions.js`: fetchQuestions/createQuestion/fetchAnswers/createAnswer
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 问答页面+提问列表
- [ ] **Step 6: REFACTOR** - 检查样式
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add course-app/student/questions.html course-app/assets/js/student-questions.js tests/e2e/student-questions.spec.js && git commit -m "feat: add Q&A discussion page for students"`

---

### Task G3: 评语与证书页面

**Files:**
- Create: `course-app/student/certificate.html`
- Create: `course-app/admin/reports.html`
- Create: `course-app/assets/js/student-certificate.js`
- Create: `course-app/assets/js/admin-reports.js`
- Create: `tests/e2e/student-certificate.spec.js`
- Create: `tests/e2e/admin-reports.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 学生证书页 -> 显示课程进度+申请按钮; Playwright 教师评语页 -> 学生列表+评语编辑+证书审批 |
| Edge | 未登录 -> 跳转 login.html; 进度 <100% -> 申请按钮禁用; 证书 pending -> 显示状态 |
| Regression | 现有页面不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 学生证书页 (进度+申请+状态), 教师评语页 (学生列表+评语编辑+证书审批 approve/reject)
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/student-certificate.spec.js tests/e2e/admin-reports.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `student/certificate.html`: 课程进度 + 申请结业按钮 (100%可用) + 证书状态 (pending/approved/issued) + 证书展示. `admin/reports.html`: 学生列表 + 评语编辑 (title/content/rating) + 证书审批. JS: fetchProgress/applyCertificate/fetchStudents/createReport/approveCertificate
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 学生证书页 + 教师评语审批页
- [ ] **Step 6: REFACTOR** - 检查样式
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add course-app/student/certificate.html course-app/admin/reports.html course-app/assets/js/student-certificate.js course-app/assets/js/admin-reports.js tests/e2e/student-certificate.spec.js tests/e2e/admin-reports.spec.js && git commit -m "feat: add teacher reports and student certificate pages"`

### Phase G Gate

**Completion Promise:**
- `npx playwright test tests/e2e/highlights.spec.js` -> PASS (文本选择 -> 创建高亮 -> 渲染)
- `npx playwright test tests/e2e/student-questions.spec.js` -> PASS (提问 -> 回答)
- `npx playwright test tests/e2e/student-certificate.spec.js tests/e2e/admin-reports.spec.js` -> PASS
- `npm test` -> 全绿
- SURFACE: 在课件阅读器中选择文本 -> 出现高亮工具栏 -> 创建高亮 -> 重新加载页面高亮仍在
- SURFACE: 学生提问 -> 教师回答 -> 标记为官方回答

**Oracle 验证:** Oracle 审查高亮批注交互 (文本选择范围、跨页面持久化、visibility 控制)。

---

## Phase H: 集成测试与部署

> **TDD**: 仪表盘 E2E 测试: `tests/e2e/student-dashboard.spec.js` + `tests/e2e/admin-dashboard.spec.js` (聚合各模块数据)。H3 的端到端测试即是完整的 Playwright 回归测试套件，覆盖学生+教师全流程。

### Task H1: 学生仪表盘

**Files:**
- Create: `course-app/student/dashboard.html`
- Create: `course-app/assets/js/student-dashboard.js`
- Create: `tests/e2e/student-dashboard.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 打开 -> 显示用户信息 + 课程列表 + 待办事项 + 最近考勤 + 通知 |
| Edge | 未登录 -> 跳转 login.html; 无数据 -> 各区域显示"暂无" |
| Regression | 现有学生页面不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 未登录跳转, 仪表盘显示用户信息/课程列表/待办/考勤/通知, 各模块数据聚合正确
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/student-dashboard.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `dashboard.html`: 聚合显示用户信息 + 课程列表 (进度条) + 待办 (未提交作业/即将截止考试) + 最近考勤 + 通知. `student-dashboard.js`: 并行 fetch 多个 API 聚合渲染
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 学生仪表盘全貌
- [ ] **Step 6: REFACTOR** - 检查样式一致性
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add course-app/student/dashboard.html course-app/assets/js/student-dashboard.js tests/e2e/student-dashboard.spec.js && git commit -m "feat: add student dashboard aggregating all modules"`

---

### Task H2: 管理后台仪表盘

**Files:**
- Create: `course-app/admin/dashboard.html`
- Create: `course-app/assets/js/admin-dashboard.js`
- Modify: `course-app/index.html` (导航覆盖所有页面)
- Create: `tests/e2e/admin-dashboard.spec.js`

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | Playwright 打开 -> 显示班级概览 + 考勤统计 + 待批改数 + 待评分数 + 快捷入口 |
| Edge | 未登录 -> 跳转 login.html; 导航链接覆盖所有页面 |
| Regression | 现有 admin 页面不受影响 |

- [ ] **Step 1: RED** - 写 Playwright 测试: 未登录跳转, 仪表盘显示 (班级概览/考勤统计/待批改/待评分/快捷入口), 导航链接全覆盖
- [ ] **Step 2: Verify RED** - `npx playwright test tests/e2e/admin-dashboard.spec.js` -> FAIL
- [ ] **Step 3: GREEN** - `admin/dashboard.html`: 班级概览 (学生数/课程数) + 考勤统计 + 待批改数 + 待评分数 + 快捷入口 (考勤/作业/考核/成绩/书籍). `admin-dashboard.js`: 并行 fetch 聚合. `index.html`: 导航覆盖所有新页面
- [ ] **Step 4: Verify GREEN** - Playwright 测试通过
- [ ] **Step 5: SURFACE** - Playwright 截图: 管理仪表盘全貌
- [ ] **Step 6: REFACTOR** - 检查样式
- [ ] **Step 7: REGRESSION** - `npm test`
- [ ] **Step 8: Commit** - `git add course-app/admin/dashboard.html course-app/assets/js/admin-dashboard.js course-app/index.html tests/e2e/admin-dashboard.spec.js && git commit -m "feat: add admin dashboard and update navigation"`

---

### Task H3: 端到端测试与部署

**Files:**
- Create: `tests/e2e/full-flow-student.spec.js` (学生全流程回归)
- Create: `tests/e2e/full-flow-teacher.spec.js` (教师全流程回归)

**Scenario Contract:**
| 场景 | 二值通过条件 |
|------|------------|
| Happy | 学生全流程 E2E 通过 (注册->登录->仪表盘->课程->考勤->作业->考试->成绩->高亮->提问->证书); 教师全流程 E2E 通过 (登录->课时->考勤->作业->批改->考核->评分->成绩->评语->证书审批) |
| Edge | 各步骤间的状态流转正确 (作业未批改 vs 已批改, 考试未提交 vs 已评分, 证书 pending vs approved) |
| Regression | `npm test` 全量全绿 (所有 Phase 的所有测试) |

**TDD 例外说明:** H3 是集成测试+部署任务。E2E 测试本身就是"测试"步骤，部署后的线上验证是 SURFACE 步骤。

- [ ] **Step 1: RED - 写全流程 E2E 回归测试**

Create: `tests/e2e/full-flow-student.spec.js` - 学生全流程: 注册/登录 -> 仪表盘 -> 课程列表 -> 考勤记录 -> 提交作业 -> 参加考试 -> 查看成绩 -> 课件高亮 -> 提问 -> 申请证书
Create: `tests/e2e/full-flow-teacher.spec.js` - 教师全流程: 登录 -> 创建课时 -> 记录考勤 -> 布置作业 -> 批改作业 -> 创建考核+题目 -> 评分 -> 配置成绩 -> 计算最终成绩 -> 写评语 -> 审批证书

- [ ] **Step 2: Verify RED - 运行失败**

```bash
npx playwright test tests/e2e/full-flow-student.spec.js tests/e2e/full-flow-teacher.spec.js
# 预期: FAIL (部分流程可能有 bug 需修复)
```

- [ ] **Step 3: GREEN - 修复发现的 bug，使全流程通过**

修复 H1/H2 仪表盘聚合问题、跨模块数据流问题等

- [ ] **Step 4: Verify GREEN - 全流程通过**

```bash
npx playwright test tests/e2e/full-flow-student.spec.js tests/e2e/full-flow-teacher.spec.js
# 预期: PASS
```

- [ ] **Step 5: SURFACE - 部署到 Cloudflare Pages 并线上验证**

```bash
npx wrangler pages deploy course-app --project-name=brianinchrist-courses
npx wrangler pages deploy brianinchrist --project-name=brianinchrist-site
```

访问 `learn.organicchurch.dpdns.org`，重复学生+教师全流程

- [ ] **Step 6: REFACTOR** - 检查部署配置

- [ ] **Step 7: REGRESSION - `npm test` 全量回归 (所有 Phase 所有测试)**

```bash
npm test
# 预期: 全绿
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: complete online course system - all phases deployed"
```

### Phase H Gate (全局完成门禁)

**Completion Promise:**
- `npm test` -> 全绿 (Vitest + Playwright 全量)
- 学生全流程 E2E 通过: 注册 -> 登录 -> 仪表盘 -> 查看课程 -> 考勤记录 -> 提交作业 -> 参加考试 -> 查看成绩 -> 课件高亮 -> 提问 -> 申请证书
- 教师全流程 E2E 通过: 登录 -> 创建课时 -> 记录考勤 -> 布置作业 -> 批改作业 -> 创建考核+题目 -> 评分 -> 配置成绩构成 -> 计算最终成绩 -> 写评语 -> 审批证书
- `learn.organicchurch.dpdns.org` 线上可访问
- 线上学生+教师流程通过 (H3 Step 1 的完整流程)

**Global Completion Promise:**

```
<promise>
所有 35 个任务完成 +
npm test 全绿 (Vitest + Playwright) +
线上 learn.organicchurch.dpdns.org 可访问 +
学生全流程 E2E 通过 +
教师全流程 E2E 通过
</promise>
```

**Oracle 最终验证 (Loop 结束条件):**

Oracle 审查全部产出:
1. 所有 migration 文件 (001-010) 结构正确
2. 所有 API 端点遵循统一模式 (JWT 验证 + 角色检查 + 错误格式)
3. 所有前端页面引用 Scriptorium 设计系统
4. 全量测试套件通过
5. 线上系统可访问且核心流程通过

Oracle 验证通过 -> Loop 结束。
Oracle 提出 blocker -> 修复后重新提交 (最多 2 次) -> 2 次仍不通过 -> 冻结 loop，向用户报告。

---

## 总结

| Phase | 任务数 | 新建表 | 新建 API | 新建页面 | 测试文件 | Phase Gate | Oracle |
|-------|--------|--------|---------|---------|---------|-----------|--------|
| 0: 测试基础设施 | 3 | 0 | 0 | 0 | 3+ | npm test 全绿 | 审查测试架构 |
| A: 关键修复 | 5 | 7 | 0 | 2 | 5 | npm test + SURFACE (curl+浏览器) | 审查迁移+token+登录安全 |
| B: 书籍管理 | 5 | 4 | 5 | 2 | 5 | npm test + SURFACE | 审查表结构+导入脚本 |
| C: 作业系统 | 5 | 3 | 8 | 4 | 5 | npm test + SURFACE (提交->批改) | 审查提交流程完整性 |
| D: 视频教学 | 3 | 2 | 6 | 2 | 3 | npm test + SURFACE (播放+记录) | 审查 UPSERT 逻辑 |
| E: 考核系统 | 5 | 4 | 9 | 4 | 5 | npm test + SURFACE (考试全流程) | 审查自动评分逻辑 |
| F: 成绩管理 | 3 | 2 | 6 | 4 | 3 | npm test + SURFACE (计算+展示) | 审查计算引擎 |
| G: 互动前端 | 3 | 0 | 0 | 4 | 3 | npm test + SURFACE (高亮+问答) | 审查交互持久化 |
| H: 集成部署 | 3 | 0 | 0 | 2 | 3 | 全流程 E2E + 线上验证 | **最终验证 (Loop 结束)** |
| **合计** | **35** | **22** | **34** | **24** | **35+** | **9 个 Phase Gate** | **9 次 Oracle** |

### ULW-Loop TDD 执行顺序 (每个任务)

```
RED (写测试) 
  -> Verify RED (确认失败) 
  -> GREEN (最小实现) 
  -> Verify GREEN (确认通过) 
  -> SURFACE (真实表面验证 + 证据捕获) 
  -> REFACTOR (清理，保持绿色) 
  -> REGRESSION (重跑全量场景列表) 
  -> Gate Check (Phase 门禁检查) 
  -> Commit
```

### Phase Gate 流程

```
Phase N 所有任务完成
  -> Gate 1: npm test 全量 -> 全绿? (最多 3 次重试)
  -> Gate 2: SURFACE 验证 -> 真实表面可访问?
  -> Gate 3: Oracle 审查 -> 无 blocker? (最多 2 次修复)
  -> 全部通过 -> 进入下一 Phase
```

### Loop 失败恢复

| 场景 | 动作 | 次数限制 |
|------|------|---------|
| 单任务测试失败 | 修复 -> 重跑 | 3 次 |
| Phase 门禁失败 | 回滚 -> 缩小范围重试 | 3 次 |
| Oracle blocker | 修复 -> 重新提交 | 2 次 |
| 连续 3 任务失败 | 冻结 loop -> 向用户报告 | - |
| 无进度 churn | 冻结 -> `/harness-audit` | - |
| 累计 500 迭代 | 冻结 (ultrawork 上限) | - |

### Subagent 派发建议 (ULW-Loop + TDD)

| 任务类型 | category | 模型 | 测试先行策略 | Reviewer Gate |
|---------|----------|------|------------|---------------|
| 测试基础设施 | `deep` | glm-5.2 | P0 需设计测试架构 | Oracle 审查架构 |
| Migration + 测试 | `quick` | deepseek-v4-flash | 先写表存在性测试 | - |
| API + 测试 | `unspecified-high` | qwen3.7-plus | 先写端点行为测试 | 3+ 文件触发 |
| 前端 + E2E | `visual-engineering` | qwen3.7-plus | 先写 Playwright 测试 | 3+ 文件触发 |
| 成绩计算引擎 | `deep` | glm-5.2 | 先写计算逻辑测试 | Oracle 必审 |
| 自动评分逻辑 | `deep` | glm-5.2 | 先写评分测试用例 | Oracle 必审 |
| 安全相关 (auth) | `unspecified-high` | qwen3.7-plus | 先写 401/403 测试 | Oracle 安全审查 |
