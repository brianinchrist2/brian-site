# 学员档案管理系统设计文档

**日期**: 2026-07-04  
**项目**: brianinchrist-site 学员档案管理系统  
**状态**: 设计完成，待实施

---

## 1. 项目概述

### 1.1 目标

构建一个完整的学员档案管理系统，支持：
- 学生在线学习（书籍阅读 + 互动课件）
- 学习数据持久化（答案、进度、时长）
- 文本高亮与评论（公开/私密/班级可见）
- 学生提问与答疑（章节级 + 通用）
- 班级管理（班主任组织、课程分配）
- 教师评语与结业证书

### 1.2 核心需求

| 优先级 | 功能模块 | 说明 |
|--------|----------|------|
| **A** | 学员档案 + 答案持久化 | 核心数据层，从 localStorage 迁移到服务端 |
| **C** | 高亮 + 评论 | 文本标注与社交互动 |
| **D** | 提问模块 | 学生答疑与知识交流 |

### 1.3 用户角色

| 角色 | 职责 |
|------|------|
| **学生** | 阅读、答题、高亮、提问 |
| **教师** | 查看学习数据、回答问题、写评语、审批结业 |
| **班主任** | 组建班级、管理学员、回答问题 |
| **管理员** | 管理课程/内容、管理用户、系统配置 |

**多角色支持**: 一个用户可以拥有多个角色（如教师兼班主任）。

---

## 2. 架构决策

### 2.1 数据库选择: Cloudflare D1 (SQLite)

**决策**: 使用 Cloudflare D1 作为主数据库

**理由**:
- **免费额度充足**: 5GB 存储（MongoDB M0 仅 512MB）
- **原生集成**: 与 Cloudflare Pages Functions 无缝集成
- **关系型数据**: 学员-班级-课程-答案等关系需要 JOIN 查询
- **零运维**: 无需管理连接池、冷启动问题

**对比 MongoDB**:
- MongoDB M0 免费额度仅 512MB，100 ops/sec 限制
- Pages Functions 不支持 MongoDB 驱动（需要 Durable Objects 包装）
- 数据 API 已于 2025-09 下线，必须用原生驱动

### 2.2 架构模式: 模块化单体

**决策**: 模块化单体（Modular Monolith）+ 互动模块数据层独立

**理由**:
- **规模匹配**: 100-500 学生不需要微服务
- **开发效率**: 单数据库、单部署
- **可维护性**: 模块边界清晰
- **未来扩展**: 互动模块可独立拆分

**模块划分**:

```
functions/api/
├── auth/              # 认证模块
├── modules/
│   ├── students/      # 学员档案模块
│   ├── courses/       # 课程管理模块
│   ├── interactions/  # 互动模块（高亮/评论/提问）
│   └── classes/       # 班级管理模块
└── _shared/           # 共享工具（auth、db、validation）
```

### 2.3 高亮锚定方案: W3C 双选择器

**决策**: TextQuote + TextPosition 双选择器

**理由**:
- **快速路径**: TextPositionSelector < 1ms（内容未变时）
- **稳健路径**: TextQuoteSelector 5-30ms（内容变化后）
- **业界标准**: Hypothesis、W3C Web Annotation 都采用此方案

**数据结构**:
```json
{
  "position": { "start": 505, "end": 528 },
  "quote": {
    "exact": "选中的文字",
    "prefix": "前面几个字",
    "suffix": "后面几个字"
  }
}
```

---

## 3. 数据模型

### 3.1 用户与角色

```sql
-- 用户表（合并原 KV 数据）
CREATE TABLE users (
  id         TEXT PRIMARY KEY,          -- UUID
  email      TEXT UNIQUE NOT NULL,
  nickname   TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt       TEXT NOT NULL,
  roles      TEXT NOT NULL DEFAULT '["student"]',  -- JSON 数组
  avatar_url TEXT,
  bio        TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**权限矩阵**:

| 操作 | 学生 | 教师 | 班主任 | 管理员 |
|------|:----:|:----:|:------:|:------:|
| 阅读/答题/高亮/提问 | ✅ | ✅ | ✅ | ✅ |
| 回答问题 | ✅（同班） | ✅ | ✅ | ✅ |
| 查看学生学习数据 | ❌ | ✅ | ✅（本班） | ✅ |
| 写评语 | ❌ | ✅ | ❌ | ✅ |
| 审批结业 | ❌ | ✅ | ❌ | ✅ |
| 创建/管理班级 | ❌ | ❌ | ✅ | ✅ |
| 管理课程/内容 | ❌ | ❌ | ❌ | ✅ |
| 管理用户 | ❌ | ❌ | ❌ | ✅ |

### 3.2 课程与内容

```sql
-- 课程表（顶层容器）
CREATE TABLE courses (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  cover_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',  -- draft | published | archived
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 课程内容单元（章节/课件/测验等）
CREATE TABLE course_items (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,  -- book_chapter | courseware | quiz | video | assignment
  title       TEXT NOT NULL,
  description TEXT,
  item_ref    TEXT NOT NULL,  -- 引用具体内容的路径或 ID
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 1,  -- 是否必修
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_course_items_course ON course_items(course_id);
CREATE INDEX idx_course_items_type ON course_items(type);
```

### 3.3 班级与注册

```sql
-- 班级表
CREATE TABLE classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,              -- "2026春季班"
  description TEXT,
  advisor_id  TEXT NOT NULL REFERENCES users(id),  -- 班主任
  status      TEXT NOT NULL DEFAULT 'active',  -- active | archived
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 班级 ↔ 课程（多对多）
CREATE TABLE class_courses (
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, course_id)
);

-- 班级 ↔ 学生（多对多）
CREATE TABLE class_members (
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, student_id)
);

-- 课程注册（学生 ↔ 课程，通过班级自动创建或手动注册）
CREATE TABLE enrollments (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  class_id    TEXT REFERENCES classes(id) ON DELETE SET NULL,  -- 可为空（自学注册）
  status      TEXT NOT NULL DEFAULT 'active',  -- active | completed | dropped
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, course_id)
);

CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_class_members_student ON class_members(student_id);
```

### 3.4 学习进度与答案

```sql
-- 学习进度（记录每个内容单元的完成状态）
CREATE TABLE progress (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'started',  -- started | in_progress | completed
  score       INTEGER,                          -- 测验分数（仅 quiz 类型）
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(student_id, item_id)
);

CREATE INDEX idx_progress_student ON progress(student_id);
CREATE INDEX idx_progress_course ON progress(course_id);

-- 答题记录（课件中的引导性问题）
CREATE TABLE answers (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,              -- 第几个问题（从0开始）
  question_text TEXT,                           -- 冗余存储问题文本（防止题目变更）
  answer_text TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, item_id, question_index)
);

CREATE INDEX idx_answers_student ON answers(student_id);
CREATE INDEX idx_answers_item ON answers(item_id);

-- 学习会话（时间追踪）
CREATE TABLE learning_sessions (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES course_items(id) ON DELETE SET NULL,
  duration_minutes INTEGER NOT NULL,            -- 本次学习时长（分钟）
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_student ON learning_sessions(student_id);
CREATE INDEX idx_sessions_course ON learning_sessions(course_id);
```

### 3.5 高亮与评论

```sql
-- 高亮标注（含评论）
CREATE TABLE highlights (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  
  -- 锚定数据（W3C 双选择器，JSON 格式）
  anchor_data TEXT NOT NULL,
  -- {
  --   "position": { "start": 505, "end": 528 },
  --   "quote": { "exact": "选中的文字", "prefix": "前面几个字", "suffix": "后面几个字" }
  -- }
  
  -- 显示
  color       TEXT NOT NULL DEFAULT 'yellow',  -- yellow | green | blue | pink
  
  -- 评论（可选，高亮可以不带评论）
  comment     TEXT,
  
  -- 可见性
  visibility  TEXT NOT NULL DEFAULT 'private',  -- private | public | class
  class_ids   TEXT,  -- JSON 数组，仅 visibility='class' 时使用
  
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_highlights_item ON highlights(item_id);
CREATE INDEX idx_highlights_user ON highlights(user_id);

-- 高亮回复（其他用户对可见高亮的回应）
CREATE TABLE highlight_replies (
  id           TEXT PRIMARY KEY,
  highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_replies_highlight ON highlight_replies(highlight_id);
```

### 3.6 提问模块

```sql
-- 提问表
CREATE TABLE questions (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES course_items(id) ON DELETE SET NULL,  -- 可为空（通用提问）
  
  title       TEXT NOT NULL,              -- 问题标题
  body        TEXT,                       -- 问题详情（可选）
  
  status      TEXT NOT NULL DEFAULT 'open',  -- open | answered | closed
  has_official INTEGER NOT NULL DEFAULT 0,   -- 是否有官方回答
  
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_questions_course ON questions(course_id);
CREATE INDEX idx_questions_item ON questions(item_id);
CREATE INDEX idx_questions_student ON questions(student_id);
CREATE INDEX idx_questions_status ON questions(status);

-- 回答表
CREATE TABLE question_answers (
  id           TEXT PRIMARY KEY,
  question_id  TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  is_official  INTEGER NOT NULL DEFAULT 0,  -- 1 = 教师/班主任的官方回答
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_answers_question ON question_answers(question_id);
```

### 3.7 评语、证书与通知

```sql
-- 教师评语（学习报告）
CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  title       TEXT NOT NULL,              -- "期中评语"、"结业评语"
  content     TEXT NOT NULL,              -- 评语正文
  rating      TEXT,                       -- excellent | good | satisfactory | needs_improvement（可选）
  
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, course_id, teacher_id, title)  -- 防止重复评语
);

CREATE INDEX idx_reports_student ON reports(student_id);
CREATE INDEX idx_reports_course ON reports(course_id);

-- 结业证书
CREATE TABLE certificates (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id  TEXT REFERENCES users(id) ON DELETE SET NULL,  -- 审批教师
  
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  progress_pct REAL NOT NULL,                   -- 申请时的完成百分比
  
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  issued_at   TEXT,                             -- 批准时间
  
  UNIQUE(student_id, course_id)
);

CREATE INDEX idx_certificates_student ON certificates(student_id);
CREATE INDEX idx_certificates_status ON certificates(status);

-- 站内通知
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  type        TEXT NOT NULL,  -- highlight_reply | question_answer | report_created | certificate_reviewed | course_assigned
  title       TEXT NOT NULL,
  content     TEXT,
  
  -- 关联实体（用于跳转到具体页面）
  entity_type TEXT,           -- highlight | question | report | certificate | course
  entity_id   TEXT,
  
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, is_read);
```

---

## 4. 关键业务流程

### 4.1 班级分配课程 → 自动注册

```
班主任创建班级 "2026春季班"
  ↓
添加学生 A, B, C 到 class_members
  ↓
分配课程 "家教会的本体论" 到 class_courses
  ↓
系统自动创建 enrollments：
  - 学生 A → 课程（class_id = 春季班）
  - 学生 B → 课程（class_id = 春季班）
  - 学生 C → 课程（class_id = 春季班）
```

### 4.2 高亮渲染流程

```
页面加载
  ↓
获取当前章节所有可见高亮
  ↓
逐个渲染（降级链）：
  1. 快速路径：用 position 定位 → 验证文字匹配 → 完成（< 1ms）
  2. 降级路径：搜索 quote.exact，用 prefix/suffix 消歧（5-30ms）
  3. 找不到 → 标记为失效，不渲染
```

### 4.3 结业审批流程

```
学生完成所有章节（progress 表 100%）
  ↓
系统提示"可以申请结业"
  ↓
学生点击"申请结业"
  ↓
创建 certificate 记录（status = 'pending'）
  ↓
教师收到通知
  ↓
教师查看学生学习数据（进度、答案、学习时长）
  ↓
教师批准 → status = 'approved', issued_at = now()
  ↓
学生收到通知 + 证书页面可下载/打印
```

---

## 5. 迁移策略

### 5.1 用户数据迁移（KV → D1）

```javascript
// 1. 读取所有 KV 用户数据
const users = await env.USERS_KV.list({ prefix: 'user:' });

// 2. 批量插入 D1
for (const user of users.keys) {
  const userData = JSON.parse(await env.USERS_KV.get(user.name));
  await db.prepare(`
    INSERT INTO users (id, email, nickname, password_hash, salt, roles, created_at)
    VALUES (?, ?, ?, ?, ?, '["student"]', ?)
  `).bind(
    userData.id,
    userData.email,
    userData.nickname,
    userData.passwordHash,
    userData.salt,
    userData.createdAt
  ).run();
}

// 3. 验证迁移完成后，停止使用 USERS_KV
```

### 5.2 课件答案迁移（localStorage → D1）

```javascript
// 前端迁移脚本（用户首次登录时执行）
async function migrateLocalStorageToServer() {
  const answers = localStorage.getItem('courseware_answers');
  const progress = localStorage.getItem('courseware_progress');
  
  if (!answers && !progress) return;  // 无需迁移
  
  // 上传到服务端
  await fetch('/api/modules/students/migrate', {
    method: 'POST',
    body: JSON.stringify({ answers, progress })
  });
  
  // 迁移成功后清除 localStorage
  localStorage.removeItem('courseware_answers');
  localStorage.removeItem('courseware_progress');
}
```

---

## 6. 扩展性考虑

### 6.1 成本预测

| 阶段 | 学生数 | 月成本 | 说明 |
|------|--------|--------|------|
| **Phase 1** | 0–500 | **$0** | D1 + Pages Functions 全在免费额度内 |
| **Phase 2** | 500–5,000 | **~$5–10** | D1 付费 $0.75/GB 存储 + 少量写入费 |
| **Phase 3** | 5,000+ | **~$30–50** | 拆分互动模块到独立 D1 实例 |

### 6.2 扩展路径

- **Phase 1**: 模块化单体，所有模块共享 D1 数据库
- **Phase 2**: 如果互动模块写入量激增，将 `interactions` 模块拆分到独立 D1 实例
- **Phase 3**: 如果整体流量激增，考虑将高频查询模块（如通知）拆分到独立服务

### 6.3 数据模型扩展

- **新增内容类型**: `course_items.type` 支持新类型（video、assignment 等），无需改表
- **新增用户角色**: `users.roles` JSON 数组支持新角色，无需改表
- **新增通知类型**: `notifications.type` 支持新类型，无需改表

---

## 7. 实施计划

### 7.1 阶段划分

**Phase 1: 核心数据层（优先级 A）**
- 用户迁移（KV → D1）
- 课程与内容管理
- 班级与注册
- 学习进度与答案持久化

**Phase 2: 互动功能（优先级 C）**
- 高亮与评论
- 可见性控制
- 前端高亮渲染

**Phase 3: 提问模块（优先级 D）**
- 提问与回答
- 官方回答标记
- 通知系统

**Phase 4: 高级功能**
- 教师评语
- 结业证书
- 学习报告

### 7.2 技术栈

- **前端**: 保持现有 Vanilla JS + HTML/CSS（无框架）
- **后端**: Cloudflare Pages Functions（ES Modules）
- **数据库**: Cloudflare D1（SQLite）
- **缓存**: Cloudflare KV（热点数据缓存）

---

## 8. 附录

### 8.1 数据模型总览

```
用户与角色
├── users (id, email, nickname, roles[], ...)

课程与内容
├── courses (id, title, status, ...)
└── course_items (id, course_id, type, item_ref, sort_order, ...)

班级与注册
├── classes (id, name, advisor_id, ...)
├── class_courses (class_id, course_id)
├── class_members (class_id, student_id)
└── enrollments (id, student_id, course_id, class_id, status, ...)

学习进度与答案
├── progress (id, student_id, item_id, status, score, ...)
├── answers (id, student_id, item_id, question_index, answer_text, ...)
└── learning_sessions (id, student_id, course_id, duration_minutes, ...)

高亮与评论
├── highlights (id, user_id, item_id, anchor_data, comment, visibility, ...)
└── highlight_replies (id, highlight_id, user_id, content, ...)

提问模块
├── questions (id, student_id, course_id, item_id, title, status, ...)
└── question_answers (id, question_id, user_id, content, is_official, ...)

评语、证书与通知
├── reports (id, student_id, course_id, teacher_id, title, content, ...)
├── certificates (id, student_id, course_id, status, progress_pct, ...)
└── notifications (id, user_id, type, title, entity_type, entity_id, ...)
```

**共 15 张表，覆盖所有需求。**

---

## 9. 待确认事项

- [ ] 证书设计（PDF 模板、下载/打印功能）
- [ ] 移动端适配（响应式 UI）
- [ ] 离线支持（PWA？）
- [ ] 数据备份策略（D1 自动备份 vs 手动导出）

---

**文档版本**: 1.0  
**最后更新**: 2026-07-04  
**作者**: Sisyphus (AI Assistant)
