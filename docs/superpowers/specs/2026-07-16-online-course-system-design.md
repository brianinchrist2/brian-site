# 在线课程系统完整设计文档

**日期**: 2026-07-16
**项目**: brianinchrist-site 在线课程系统
**状态**: 设计完成，待实施
**取代**: `2026-07-04-student-records-system-design.md`

---

## 1. 项目概述

### 1.1 目标

构建一个完整的在线课程管理系统，支持：
- 多课程、多书籍的灵活内容组织
- 学员注册、分班、考勤管理
- 作业布置与批改
- 视频教学安排（直播/录播）
- 正式考核与评分
- 学习进度追踪与互动功能
- 教师评语与结业证书

### 1.2 核心功能模块

| 优先级 | 功能模块 | 说明 |
|--------|----------|------|
| **A** | 核心数据层 | 用户、课程、书籍、班级、注册、进度（已有） |
| **B** | 考勤系统 | 课时安排、出勤记录、考勤统计 |
| **C** | 作业系统 | 作业布置、提交、批改、反馈 |
| **D** | 视频教学 | 直播/录播排期、观看追踪 |
| **E** | 考核系统 | 题库管理、在线考试、自动/手动评分 |
| **F** | 成绩管理 | 成绩构成、加权计算、最终成绩 |
| **G** | 互动功能 | 高亮、评论、提问（已有） |
| **H** | 评语与证书 | 教师评语、结业审批（已有） |

### 1.3 用户角色

| 角色 | 职责 |
|------|------|
| **学生** | 阅读、答题、高亮、提问、提交作业、参加考核、观看视频 |
| **教师** | 布置作业、批改、创建考核、记录考勤、写评语、审批结业 |
| **班主任** | 组建班级、管理学员、安排课时、回答问题 |
| **管理员** | 管理课程/书籍/内容、管理用户、系统配置 |

多角色支持：一个用户可拥有多个角色（如教师兼班主任）。

---

## 2. 架构决策

### 2.1 数据库: Cloudflare D1 (SQLite)

- 免费额度 5GB 存储，与 Pages Functions 无缝集成
- 关系型数据支持 JOIN 查询
- 零运维，无需连接池管理

### 2.2 架构模式: 模块化单体

```
functions/api/
├── auth/              # 认证模块
├── modules/
│   ├── books/         # 书籍管理（新）
│   ├── courses/       # 课程管理
│   ├── classes/       # 班级管理
│   ├── attendance/    # 考勤管理（新）
│   ├── assignments/   # 作业管理（新）
│   ├── videos/        # 视频教学（新）
│   ├── assessments/   # 考核管理（新）
│   ├── grades/        # 成绩管理（新）
│   ├── students/      # 学员档案
│   └── interactions/  # 互动模块
└── _shared/           # 共享工具
```

### 2.3 技术栈

- **前端**: Vanilla JS + HTML/CSS（无框架）
- **后端**: Cloudflare Pages Functions（ES Modules）
- **数据库**: Cloudflare D1（SQLite）
- **缓存**: Cloudflare KV
- **视频存储**: Cloudflare R2 / 外部链接

### 2.4 部署架构：博客与课程系统分离

**决策**: 将现有博客（纯静态）与课程系统（含后端）拆分为两个独立的 Cloudflare Pages 项目。

**理由**:
- 博客是纯静态内容，不需要 D1、Functions 或认证
- 课程系统每次更新（数据库迁移、API 变更）不应影响博客稳定性
- 安全隔离：博客项目无需绑定 D1 或 JWT_SECRET，攻击面最小化
- 独立回滚：博客出问题回滚博客，课程出问题回滚课程
- 成本不变：Cloudflare Pages 免费额度按项目独立计算

**目录结构**（同一仓库）:

```
brian-site/                        # 一个仓库
├── brianinchrist/                 # 博客项目（静态站点）
│   ├── index.html                 # 首页
│   ├── organicchurch/             # 博客文章 + 公开书籍阅读
│   │   ├── assets/css/vars.css    # 共享设计系统
│   │   └── ...
│   └── ...
│
├── course-app/                    # 课程系统项目（新）
│   ├── index.html                 # 课程入口（登录/仪表盘）
│   ├── dashboard/                 # 学习仪表盘
│   ├── reader/                    # 课程内阅读器
│   ├── assignments/               # 作业页面
│   ├── assessments/               # 考试页面
│   ├── admin/                     # 管理后台
│   └── assets/
│       ├── css/                   # 复用 Scriptorium 设计系统
│       └── js/                    # 课程前端逻辑
│
├── functions/                     # API（仅课程项目使用）
│   └── api/
│       ├── auth/
│       └── modules/
│
├── docs/                          # 共享文档
│   ├── design-overview.html       # 设计概览
│   └── superpowers/specs/         # 设计文档
│
├── wrangler.toml                  # 课程项目配置（D1 + KV 绑定）
└── wrangler-blog.toml             # 博客项目配置（无绑定，纯静态）
```

**部署配置**:

| 项目 | Pages 项目名 | 输出目录 | 绑定 | 域名 |
|------|-------------|----------|------|------|
| 博客 | `brianinchrist-site` | `brianinchrist/` | 无 | `organicchurch.dpdns.org` |
| 课程 | `brianinchrist-courses` | `course-app/` | D1 + KV | `learn.organicchurch.dpdns.org` |

**博客项目 `wrangler-blog.toml`**:
```toml
name = "brianinchrist-site"
pages_build_output_dir = "brianinchrist"
# 无 D1、无 KV、无 Functions - 纯静态
```

**课程项目 `wrangler.toml`**:
```toml
name = "brianinchrist-courses"
pages_build_output_dir = "course-app"

[[kv_namespaces]]
binding = "USERS_KV"
id = "b8ae6043b8784ce59fdbd602e4c2da0c"

[[d1_databases]]
binding = "DB"
database_name = "brianinchrist-db"
database_id = "0d035c3d-d7f0-47ad-b733-c4cacab516f2"

[vars]
JWT_SECRET = "a_very_long_secure_random_key_for_jwt_auth_1298471928"
```

**共享资源**:
- 设计系统（`vars.css`）：课程系统通过相对路径或复制引用博客的 CSS
- 书籍内容：博客侧的公开阅读器保持不变；课程系统内的阅读器通过 API 获取内容
- 跨域：如需课程系统引用博客的静态资源，配置 CORS 或在课程项目内放置副本

**迁移步骤**:
1. 创建 `course-app/` 目录结构
2. 将 `functions/` 目录归属课程项目
3. 创建 `wrangler-blog.toml`（纯静态配置）
4. 博客项目移除 `functions/` 目录（或设置 Pages 项目忽略）
5. 创建课程 Pages 项目 `brianinchrist-courses`
6. 配置 `learn.organicchurch.dpdns.org` DNS 指向课程项目
7. 验证两套系统独立运行

---

## 3. 权限矩阵

| 操作 | 学生 | 教师 | 班主任 | 管理员 |
|------|:----:|:----:|:------:|:------:|
| 阅读/答题/高亮/提问 | ✅ | ✅ | ✅ | ✅ |
| 提交作业/参加考核 | ✅ | ✅ | ✅ | ✅ |
| 观看视频 | ✅ | ✅ | ✅ | ✅ |
| 回答问题 | ✅(同班) | ✅ | ✅ | ✅ |
| 查看学习数据 | ❌ | ✅ | ✅(本班) | ✅ |
| 布置/批改作业 | ❌ | ✅ | ❌ | ✅ |
| 创建考核 | ❌ | ✅ | ❌ | ✅ |
| 记录考勤 | ❌ | ✅ | ✅(本班) | ✅ |
| 安排视频教学 | ❌ | ✅ | ✅(本班) | ✅ |
| 写评语/审批结业 | ❌ | ✅ | ❌ | ✅ |
| 创建/管理班级 | ❌ | ❌ | ✅ | ✅ |
| 管理课程/书籍 | ❌ | ❌ | ❌ | ✅ |
| 管理用户 | ❌ | ❌ | ❌ | ✅ |

---

## 4. 数据模型（33 张表）

### 4.1 用户与角色（1 张表）

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  nickname      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  roles         TEXT NOT NULL DEFAULT '["student"]',
  avatar_url    TEXT,
  bio           TEXT,
  phone         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4.2 书籍管理（2 张表，新增）

```sql
CREATE TABLE books (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  author      TEXT,
  description TEXT,
  cover_url   TEXT,
  language    TEXT NOT NULL DEFAULT 'zh',
  status      TEXT NOT NULL DEFAULT 'draft',
  source_path TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE book_chapters (
  id             TEXT PRIMARY KEY,
  book_id        TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title          TEXT NOT NULL,
  content_path   TEXT NOT NULL,
  summary        TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_book_chapters_book ON book_chapters(book_id);
CREATE INDEX idx_book_chapters_sort ON book_chapters(book_id, sort_order);
```

### 4.3 课程与内容（2 张表，修改）

```sql
CREATE TABLE courses (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  cover_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_by  TEXT NOT NULL REFERENCES users(id),
  start_date  TEXT,
  end_date    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE course_items (
  id               TEXT PRIMARY KEY,
  course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  book_id          TEXT REFERENCES books(id) ON DELETE SET NULL,
  book_chapter_id  TEXT REFERENCES book_chapters(id) ON DELETE SET NULL,
  type             TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  item_ref         TEXT NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_required      INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_course_items_course ON course_items(course_id);
CREATE INDEX idx_course_items_type ON course_items(type);
```

`course_items.type` 取值: `book_chapter`, `courseware`, `quiz`, `video`, `assignment`, `assessment`, `live_session`

### 4.4 班级与注册（4 张表，不变）

```sql
CREATE TABLE classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  advisor_id  TEXT NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE class_courses (
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, course_id)
);

CREATE TABLE class_members (
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, student_id)
);

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
```

### 4.5 课时与考勤（3 张表，新增）

```sql
CREATE TABLE class_sessions (
  id           TEXT PRIMARY KEY,
  class_id     TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  session_date TEXT NOT NULL,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  location     TEXT,
  session_type TEXT NOT NULL DEFAULT 'in_person',
  meeting_url  TEXT,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_class_sessions_class ON class_sessions(class_id);
CREATE INDEX idx_class_sessions_date ON class_sessions(session_date);

CREATE TABLE attendance_records (
  id                TEXT PRIMARY KEY,
  class_session_id  TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'absent',
  check_in_time     TEXT,
  notes             TEXT,
  recorded_by       TEXT NOT NULL REFERENCES users(id),
  recorded_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(class_session_id, student_id)
);
CREATE INDEX idx_attendance_session ON attendance_records(class_session_id);
CREATE INDEX idx_attendance_student ON attendance_records(student_id);

CREATE TABLE session_topics (
  id               TEXT PRIMARY KEY,
  class_session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  course_item_id   TEXT REFERENCES course_items(id) ON DELETE SET NULL,
  notes            TEXT
);
```

- `session_type`: `in_person`（线下）, `online`（线上）, `hybrid`（混合）
- `status`: `present`（出勤）, `absent`（缺勤）, `late`（迟到）, `excused`（请假）

### 4.6 学习进度与答题（3 张表，不变）

```sql
CREATE TABLE progress (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'started',
  score        INTEGER,
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(student_id, item_id)
);
CREATE INDEX idx_progress_student ON progress(student_id);
CREATE INDEX idx_progress_course ON progress(course_id);

CREATE TABLE answers (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id        TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question_text  TEXT,
  answer_text    TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, item_id, question_index)
);
CREATE INDEX idx_answers_student ON answers(student_id);
CREATE INDEX idx_answers_item ON answers(item_id);

CREATE TABLE learning_sessions (
  id               TEXT PRIMARY KEY,
  student_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id          TEXT REFERENCES course_items(id) ON DELETE SET NULL,
  duration_minutes INTEGER NOT NULL,
  started_at       TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_student ON learning_sessions(student_id);
CREATE INDEX idx_sessions_course ON learning_sessions(course_id);
```

### 4.7 作业系统（3 张表，新增）

```sql
CREATE TABLE assignments (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  instructions  TEXT,
  type          TEXT NOT NULL DEFAULT 'writing',
  assigned_date TEXT NOT NULL DEFAULT (datetime('now')),
  due_date      TEXT NOT NULL,
  max_score     INTEGER NOT NULL DEFAULT 100,
  late_penalty  REAL DEFAULT 0,
  attachment_url TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assignments_course ON assignments(course_id);
CREATE INDEX idx_assignments_due ON assignments(due_date);

CREATE TABLE assignment_submissions (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT,
  attachment_url TEXT,
  submitted_at  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  UNIQUE(assignment_id, student_id)
);
CREATE INDEX idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX idx_submissions_student ON assignment_submissions(student_id);

CREATE TABLE assignment_grades (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  teacher_id    TEXT NOT NULL REFERENCES users(id),
  score         INTEGER,
  feedback      TEXT,
  graded_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- `assignment.type`: `reading`（阅读）, `writing`（写作）, `reflection`（反思）, `project`（项目）, `practice`（练习）
- `submission.status`: `pending`（待提交）, `submitted`（已提交）, `late`（迟交）, `graded`（已评分）, `returned`（已退回）

### 4.8 视频教学（2 张表，新增）

```sql
CREATE TABLE video_lessons (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  class_id        TEXT REFERENCES classes(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  video_type      TEXT NOT NULL DEFAULT 'recorded',
  video_url       TEXT NOT NULL,
  thumbnail_url   TEXT,
  duration_minutes INTEGER,
  scheduled_at    TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled',
  meeting_link    TEXT,
  meeting_password TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_video_lessons_course ON video_lessons(course_id);
CREATE INDEX idx_video_lessons_scheduled ON video_lessons(scheduled_at);

CREATE TABLE video_watch_logs (
  id                     TEXT PRIMARY KEY,
  video_lesson_id        TEXT NOT NULL REFERENCES video_lessons(id) ON DELETE CASCADE,
  student_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watch_duration_seconds INTEGER NOT NULL DEFAULT 0,
  last_position_seconds  INTEGER NOT NULL DEFAULT 0,
  completed              INTEGER NOT NULL DEFAULT 0,
  first_watched_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_watched_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(video_lesson_id, student_id)
);
CREATE INDEX idx_watch_logs_video ON video_watch_logs(video_lesson_id);
CREATE INDEX idx_watch_logs_student ON video_watch_logs(student_id);
```

- `video_type`: `live`（直播）, `recorded`（录播）
- `status`: `scheduled`（已排期）, `live`（直播中）, `completed`（已结束）, `cancelled`（已取消）

### 4.9 考核系统（4 张表，新增）

```sql
CREATE TABLE assessments (
  id             TEXT PRIMARY KEY,
  course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  type           TEXT NOT NULL DEFAULT 'quiz',
  total_score    INTEGER NOT NULL DEFAULT 100,
  passing_score  INTEGER NOT NULL DEFAULT 60,
  duration_minutes INTEGER,
  available_from TEXT,
  available_until TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assessments_course ON assessments(course_id);

CREATE TABLE assessment_questions (
  id            TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,
  options       TEXT,
  correct_answer TEXT,
  explanation   TEXT,
  points        INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_assessment_questions_assessment ON assessment_questions(assessment_id);

CREATE TABLE assessment_submissions (
  id            TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at  TEXT,
  status        TEXT NOT NULL DEFAULT 'in_progress',
  total_score   INTEGER,
  graded_by     TEXT REFERENCES users(id),
  graded_at     TEXT,
  UNIQUE(assessment_id, student_id)
);
CREATE INDEX idx_asmt_submissions_assessment ON assessment_submissions(assessment_id);
CREATE INDEX idx_asmt_submissions_student ON assessment_submissions(student_id);

CREATE TABLE assessment_answers (
  id                     TEXT PRIMARY KEY,
  submission_id          TEXT NOT NULL REFERENCES assessment_submissions(id) ON DELETE CASCADE,
  assessment_question_id TEXT NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  answer_text            TEXT,
  selected_option        TEXT,
  score                  INTEGER,
  feedback               TEXT,
  graded_at              TEXT,
  UNIQUE(submission_id, assessment_question_id)
);
```

- `assessment.type`: `quiz`（小测验）, `midterm`（期中考试）, `final`（期末考试）, `practice`（练习）
- `question_type`: `multiple_choice`（选择题）, `true_false`（判断题）, `short_answer`（简答题）, `essay`（论述题）, `fill_blank`（填空题）

### 4.10 成绩管理（2 张表，新增）

```sql
CREATE TABLE grade_components (
  id             TEXT PRIMARY KEY,
  course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  component_type TEXT NOT NULL,
  weight         REAL NOT NULL,
  created_by     TEXT NOT NULL REFERENCES users(id),
  UNIQUE(course_id, name)
);
CREATE INDEX idx_grade_components_course ON grade_components(course_id);

CREATE TABLE final_grades (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  total_score  REAL,
  letter_grade TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  breakdown    TEXT,
  calculated_at TEXT,
  approved_by  TEXT REFERENCES users(id),
  approved_at  TEXT,
  notes        TEXT,
  UNIQUE(student_id, course_id)
);
CREATE INDEX idx_final_grades_student ON final_grades(student_id);
CREATE INDEX idx_final_grades_course ON final_grades(course_id);
```

- `component_type`: `assignment`（作业）, `assessment`（考核）, `attendance`（考勤）, `participation`（参与）, `video`（视频观看）
- `letter_grade`: `A`, `B`, `C`, `D`, `F`
- `breakdown`: JSON 字符串，存储各组成项的得分明细

### 4.11 互动功能（4 张表，不变）

```sql
CREATE TABLE highlights (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
  anchor_data TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'yellow',
  comment     TEXT,
  visibility  TEXT NOT NULL DEFAULT 'private',
  class_ids   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_highlights_item ON highlights(item_id);
CREATE INDEX idx_highlights_user ON highlights(user_id);

CREATE TABLE highlight_replies (
  id           TEXT PRIMARY KEY,
  highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_replies_highlight ON highlight_replies(highlight_id);

CREATE TABLE questions (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES course_items(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  has_official INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_questions_course ON questions(course_id);
CREATE INDEX idx_questions_student ON questions(student_id);

CREATE TABLE question_answers (
  id           TEXT PRIMARY KEY,
  question_id  TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  is_official  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_qa_question ON question_answers(question_id);
```

### 4.12 评语、证书与通知（3 张表，不变）

```sql
CREATE TABLE reports (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  rating     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, course_id, teacher_id, title)
);
CREATE INDEX idx_reports_student ON reports(student_id);

CREATE TABLE certificates (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  progress_pct REAL NOT NULL,
  applied_at   TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at  TEXT,
  issued_at    TEXT,
  UNIQUE(student_id, course_id)
);
CREATE INDEX idx_certificates_student ON certificates(student_id);

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT,
  entity_type TEXT,
  entity_id   TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, is_read);
```

### 4.13 数据模型总览

```
用户与角色 (1)
└── users

书籍管理 (2)
├── books
└── book_chapters

课程与内容 (2)
├── courses (+ start_date, end_date)
└── course_items (+ book_id, book_chapter_id)

班级与注册 (4)
├── classes
├── class_courses
├── class_members
└── enrollments

课时与考勤 (3) ★新增
├── class_sessions
├── attendance_records
└── session_topics

学习进度与答题 (3)
├── progress
├── answers
└── learning_sessions

作业系统 (3) ★新增
├── assignments
├── assignment_submissions
└── assignment_grades

视频教学 (2) ★新增
├── video_lessons
└── video_watch_logs

考核系统 (4) ★新增
├── assessments
├── assessment_questions
├── assessment_submissions
└── assessment_answers

成绩管理 (2) ★新增
├── grade_components
└── final_grades

互动功能 (4)
├── highlights
├── highlight_replies
├── questions
└── question_answers

评语、证书与通知 (3)
├── reports
├── certificates
└── notifications
```

**共 33 张表**（17 已有 + 16 新增），覆盖完整在线课程系统需求。

---

## 5. 关键业务流程

### 5.1 课程创建流程

```
管理员创建课程
  ↓
添加书籍（books + book_chapters）
  ↓
创建课程内容单元（course_items，关联 book_chapters）
  ↓
配置成绩构成（grade_components）
  ↓
分配课程到班级（class_courses → 自动 enrollments）
  ↓
教师布置作业、创建考核、安排视频课时
  ↓
课程发布（status = 'published'）
```

### 5.2 班级分配课程 → 自动注册

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

### 5.3 考勤流程

```
班主任/教师创建课时（class_sessions）
  ↓
课时日期到达，开始上课
  ↓
教师逐个记录出勤状态（attendance_records）
  - present / absent / late / excused
  ↓
考勤数据进入成绩计算（grade_components type='attendance'）
  ↓
学生可查看自己的考勤记录
```

### 5.4 作业流程

```
教师创建作业（assignments, status='published'）
  ↓
学生看到作业列表，开始作答
  ↓
学生提交作业（assignment_submissions, status='submitted'）
  ↓
超过 due_date → status 自动变为 'late'
  ↓
教师查看提交列表，逐个批改
  ↓
教师填写分数 + 反馈（assignment_grades）
  ↓
submission.status → 'graded' → 'returned'
  ↓
学生查看成绩和反馈
  ↓
作业分数进入成绩计算
```

### 5.5 视频教学流程

```
教师/班主任创建视频课时（video_lessons）
  ↓
录播：上传视频 URL → status='completed'
直播：设置 scheduled_at + meeting_link → status='scheduled'
  ↓
直播开始 → status='live' → 学生通过 meeting_link 加入
  ↓
直播结束 → status='completed'
  ↓
学生观看视频 → 实时更新 video_watch_logs
  - watch_duration_seconds 累加
  - last_position_seconds 记录断点
  - completed = 1 当观看完成
  ↓
视频观看数据进入成绩计算（grade_components type='video'）
```

### 5.6 考核流程

```
教师创建考核（assessments, status='published'）
  ↓
添加题目（assessment_questions）
  - 选择题/判断题 → 设置 correct_answer（自动评分）
  - 简答题/论述题 → 需手动评分
  ↓
到 available_from 时间 → 学生可开始考试
  ↓
学生开始考试（assessment_submissions, status='in_progress'）
  - 记录 started_at，开始倒计时
  ↓
学生逐题作答（assessment_answers）
  ↓
学生提交 / 时间到自动提交 → status='submitted'
  ↓
系统自动评分客观题（multiple_choice, true_false, fill_blank）
  ↓
教师手动评分主观题（short_answer, essay）
  ↓
计算总分 → total_score
  ↓
status='graded' → 学生查看成绩
  ↓
考核分数进入成绩计算
```

### 5.7 成绩计算流程

```
课程配置成绩构成（grade_components）
  例：作业 30% + 考核 40% + 考勤 15% + 视频观看 15%
  ↓
各模块产生分数
  - 作业：所有 assignments 的平均分（按 max_score 归一化）
  - 考核：所有 assessments 的总分（按 total_score 归一化）
  - 考勤：出勤次数 / 总课时数
  - 视频：已观看视频数 / 总视频数
  ↓
系统按 weight 加权计算 → total_score
  ↓
按评分标准映射 → letter_grade (A/B/C/D/F)
  ↓
final_grades.status = 'calculated'
  ↓
教师审核 → status = 'approved'
  ↓
学生查看最终成绩
  ↓
满足条件 → 可申请结业证书
```

### 5.8 结业审批流程

```
学生完成所有必修内容（progress 100%）
  ↓
系统提示"可以申请结业"
  ↓
学生点击"申请结业" → certificates (status='pending')
  ↓
教师收到通知
  ↓
教师查看：学习进度 + 作业成绩 + 考核成绩 + 考勤记录
  ↓
教师批准 → status='approved', issued_at=now()
  ↓
学生收到通知 + 证书可下载/打印
```

---

## 6. API 设计

### 6.1 现有 API（已实现）

| 路径 | 方法 | 功能 |
|------|------|------|
| `/api/auth/signin` | POST | 登录 |
| `/api/auth/signup` | POST | 注册 |
| `/api/user/profile` | GET/POST | 用户档案 |
| `/api/modules/courses/catalog` | GET/POST | 课程目录 |
| `/api/modules/courses/items` | GET/POST | 课程内容 |
| `/api/modules/classes/roster` | GET/POST | 班级管理 |
| `/api/modules/classes/enroll` | POST | 注册/分配课程 |
| `/api/modules/students/progress` | GET/POST | 学习进度 |
| `/api/modules/students/answers` | GET/POST | 答题记录 |
| `/api/modules/students/migrate` | POST | 数据迁移 |
| `/api/modules/interactions/highlights` | GET/POST | 高亮 |
| `/api/modules/interactions/questions` | GET/POST | 提问 |

### 6.2 新增 API

| 路径 | 方法 | 功能 |
|------|------|------|
| **书籍管理** | | |
| `/api/modules/books` | GET/POST | 书籍列表/创建 |
| `/api/modules/books/{id}` | GET/PUT/DELETE | 书籍详情/更新/删除 |
| `/api/modules/books/{id}/chapters` | GET/POST | 章节列表/添加 |
| **考勤管理** | | |
| `/api/modules/attendance/sessions` | GET/POST | 课时列表/创建 |
| `/api/modules/attendance/sessions/{id}` | PUT/DELETE | 更新/删除课时 |
| `/api/modules/attendance/records` | GET/POST | 考勤记录查询/批量记录 |
| `/api/modules/attendance/stats` | GET | 考勤统计 |
| **作业管理** | | |
| `/api/modules/assignments` | GET/POST | 作业列表/创建 |
| `/api/modules/assignments/{id}` | GET/PUT/DELETE | 作业详情/更新/删除 |
| `/api/modules/assignments/{id}/submit` | POST | 学生提交 |
| `/api/modules/assignments/{id}/submissions` | GET | 提交列表（教师） |
| `/api/modules/assignments/submissions/{id}/grade` | POST | 教师批改 |
| **视频教学** | | |
| `/api/modules/videos` | GET/POST | 视频列表/创建 |
| `/api/modules/videos/{id}` | GET/PUT/DELETE | 视频详情/更新/删除 |
| `/api/modules/videos/{id}/log` | POST | 更新观看记录 |
| `/api/modules/videos/{id}/logs` | GET | 观看记录（教师） |
| **考核管理** | | |
| `/api/modules/assessments` | GET/POST | 考核列表/创建 |
| `/api/modules/assessments/{id}` | GET/PUT/DELETE | 考核详情/更新/删除 |
| `/api/modules/assessments/{id}/questions` | GET/POST | 题目管理 |
| `/api/modules/assessments/{id}/start` | POST | 开始考试 |
| `/api/modules/assessments/{id}/submit` | POST | 提交考试 |
| `/api/modules/assessments/submissions/{id}/grade` | POST | 手动评分 |
| **成绩管理** | | |
| `/api/modules/grades/components` | GET/POST | 成绩构成配置 |
| `/api/modules/grades/calculate` | POST | 计算最终成绩 |
| `/api/modules/grades/final` | GET | 查看最终成绩 |
| `/api/modules/grades/final/{id}/approve` | POST | 教师审批成绩 |

---

## 7. 实施计划

### Phase 0: 系统分离（前置）

- [ ] 创建 `course-app/` 目录结构
- [ ] 创建 `wrangler-blog.toml`（纯静态博客配置）
- [ ] 更新 `wrangler.toml` 为课程系统专用配置
- [ ] 创建 Cloudflare Pages 项目 `brianinchrist-courses`
- [ ] 配置 `learn.organicchurch.dpdns.org` DNS
- [ ] 将 `functions/` 目录归属课程项目
- [ ] 验证博客项目独立部署（无 Functions、无 D1）
- [ ] 验证课程项目可部署（含 Functions + D1）
- [ ] 创建课程系统入口页 `course-app/index.html`

### Phase 1: 核心数据层（已完成 ✅）

- ✅ D1 数据库设置与辅助模块
- ✅ 用户迁移（KV → D1）
- ✅ 认证模块迁移
- ✅ 课程管理 API
- ✅ 班级管理 API
- ✅ 学习进度与答案 API
- ✅ 前端同步模块

### Phase 2: 互动功能（API 已完成 ✅，前端待实现）

- ✅ 高亮与评论 API
- ✅ 可见性控制
- ⏳ 前端高亮渲染
- ⏳ 提问与回答 API
- ✅ 通知系统

### Phase 3: 书籍与课程内容扩展

- [ ] 创建 `books` 和 `book_chapters` 表
- [ ] 修改 `courses` 表添加 `start_date`/`end_date`
- [ ] 修改 `course_items` 表添加 `book_id`/`book_chapter_id`
- [ ] 书籍管理 API
- [ ] 章节管理 API
- [ ] 导入现有书籍内容（oikos_church + lordship_gospel）

### Phase 4: 考勤系统

- [ ] 创建 `class_sessions`、`attendance_records`、`session_topics` 表
- [ ] 课时管理 API（CRUD）
- [ ] 考勤记录 API（批量记录）
- [ ] 考勤统计 API
- [ ] 前端考勤页面（教师记录出勤）

### Phase 5: 作业系统

- [ ] 创建 `assignments`、`assignment_submissions`、`assignment_grades` 表
- [ ] 作业 CRUD API
- [ ] 提交 API（学生端）
- [ ] 批改 API（教师端）
- [ ] 前端作业页面（列表、提交、批改）

### Phase 6: 视频教学

- [ ] 创建 `video_lessons`、`video_watch_logs` 表
- [ ] 视频 CRUD API
- [ ] 观看记录 API（断点续播）
- [ ] 前端视频播放器集成
- [ ] 直播链接管理

### Phase 7: 考核系统

- [ ] 创建 `assessments`、`assessment_questions`、`assessment_submissions`、`assessment_answers` 表
- [ ] 考核 CRUD API
- [ ] 题目管理 API
- [ ] 考试流程 API（开始/提交/超时）
- [ ] 自动评分逻辑（客观题）
- [ ] 手动评分界面（主观题）
- [ ] 前端考试界面（计时、防作弊）

### Phase 8: 成绩管理

- [ ] 创建 `grade_components`、`final_grades` 表
- [ ] 成绩构成配置 API
- [ ] 成绩计算逻辑（加权汇总）
- [ ] 最终成绩查询 API
- [ ] 教师审批 API
- [ ] 前端成绩看板

### Phase 9: 评语与证书（API 已完成 ✅，前端待实现）

- ✅ 教师评语 API
- ✅ 结业证书 API
- ⏳ 证书 PDF 模板设计
- ⏳ 前端评语/证书页面

---

## 8. 迁移策略

### 8.1 数据库迁移

```sql
-- Migration 005: 书籍管理
CREATE TABLE books (...);
CREATE TABLE book_chapters (...);

-- Migration 006: 课程表扩展
ALTER TABLE courses ADD COLUMN start_date TEXT;
ALTER TABLE courses ADD COLUMN end_date TEXT;
ALTER TABLE course_items ADD COLUMN book_id TEXT REFERENCES books(id);
ALTER TABLE course_items ADD COLUMN book_chapter_id TEXT REFERENCES book_chapters(id);

-- Migration 007: 考勤系统
CREATE TABLE class_sessions (...);
CREATE TABLE attendance_records (...);
CREATE TABLE session_topics (...);

-- Migration 008: 作业系统
CREATE TABLE assignments (...);
CREATE TABLE assignment_submissions (...);
CREATE TABLE assignment_grades (...);

-- Migration 009: 视频教学
CREATE TABLE video_lessons (...);
CREATE TABLE video_watch_logs (...);

-- Migration 010: 考核系统
CREATE TABLE assessments (...);
CREATE TABLE assessment_questions (...);
CREATE TABLE assessment_submissions (...);
CREATE TABLE assessment_answers (...);

-- Migration 011: 成绩管理
CREATE TABLE grade_components (...);
CREATE TABLE final_grades (...);

-- Migration 012: 用户表扩展
ALTER TABLE users ADD COLUMN phone TEXT;
```

### 8.2 现有内容导入

```
oikos_church/zh/book2/ → books (title="家教会的本体论革命 第二册", language="zh")
  ↓ 18 个 chapterXX.html → book_chapters (chapter_number=1-18)

oikos_church/en/book2/ → books (title="...", language="en")

lordship_gospel/book2/ → books (title="主权福音", language="zh")
  ↓ 14 个 chapterXX.html → book_chapters (chapter_number=1-14)
```

### 8.3 向后兼容

- 现有 `course_items.item_ref` 仍然有效，新增的 `book_id`/`book_chapter_id` 为可选字段
- 现有 API 不受影响，新功能通过新端点提供
- 前端逐步迁移，旧页面继续工作

---

## 9. 扩展性考虑

### 9.1 成本预测

| 阶段 | 学生数 | 月成本 | 说明 |
|------|--------|--------|------|
| Phase 1-3 | 0–500 | $0 | D1 + Pages Functions 全在免费额度 |
| Phase 4-8 | 500–5,000 | ~$5–10 | D1 付费 + 少量写入费 |
| 全功能 | 5,000+ | ~$30–50 | 拆分高频模块到独立 D1 |

### 9.2 扩展路径

- 33 张表共享一个 D1 实例，模块边界清晰
- 如考核系统写入量激增，可拆分到独立 D1
- 视频存储使用 R2 或外部 CDN，不影响 D1
- 直播可集成第三方（Zoom/腾讯会议），仅存储链接

---

## 10. 开发模型分配（OMO 路由策略）

基于可用模型库，按任务类型分配最优模型：

### 10.1 模型池

| 层级 | 模型 ID | 用途 |
|------|---------|------|
| **High** | `coding-plan/glm-5.2` | 最高推理需求 —— 架构、纯逻辑、审查、规划 |
| **Medium** | `opencode-go/qwen3.7-plus` | 中等推理 —— UI/设计、写作、高努力综合任务 |
| **Low** | `opencode-go/deepseek-v4-flash` | 轻量 —— 编排、检索、简单修改 |

### 10.2 类别与模型映射

| 目标 | 分配模型 | 理由 |
|------|---------|------|
| **Sisyphus**（编排器） | `opencode-go/deepseek-v4-flash` | 不写实现代码，只做路由/规划/派发 |
| `ultrabrain` | `coding-plan/glm-5.2` | 纯逻辑密集型 —— 表设计、评分引擎、并发策略 |
| `deep` | `coding-plan/glm-5.2` | 自主端到端解决"毛刺问题"，含研究和实现决策 |
| `artistry` | `coding-plan/glm-5.2` | 非常规复杂问题，需要跳出框架的推理 |
| `oracle` | `coding-plan/glm-5.2` | 读只架构咨询、硬调试 —— 一步分析价值最高 |
| `metis` | `coding-plan/glm-5.2` | 预规划，模糊需求澄清、隐藏意图挖掘 |
| `momus` | `coding-plan/glm-5.2` | 计划审查、质量闸门 —— 挑错比写代码更需要推理 |
| `visual-engineering` | `opencode-go/qwen3.7-plus` | 需良好视觉/前端质量，不依赖顶级逻辑推理 |
| `unspecified-high` | `opencode-go/qwen3.7-plus` | 高努力非标任务，质量重要但不专门 |
| `writing` | `opencode-go/qwen3.7-plus` | 文档/散文需要表达质量，不拼推理 |
| `quick` | `opencode-go/deepseek-v4-flash` | 单文件 typofix、配置改值 —— 不需要推理 |
| `unspecified-low` | `opencode-go/deepseek-v4-flash` | 低努力非标任务 |
| `explore` | `opencode-go/deepseek-v4-flash` | 代码库 grep，纯检索不推理 |
| `librarian` | `opencode-go/deepseek-v4-flash` | 外部文档搜索，检索+摘要 |

### 10.3 各阶段 agent 派发表

| Phase | 任务 | 类别 | 模型 | 并行度 |
|-------|------|------|------|--------|
| **Phase 0** | 目录结构、wrangler 配置 | `quick` | deepseek-v4-flash | 1 |
| | CF Pages 项目创建、DNS | `quick` | deepseek-v4-flash | 1（串行） |
| **Phase 2** | attendance schema 设计 | `ultrabrain` | glm-5.2 | 1 |
| | check-in API | `deep` | glm-5.2 | 并行 ×2 |
| | 考勤统计 API | `deep` | glm-5.2 | 并行 ×2 |
| | 教师端考勤面板 UI | `visual-engineering` | qwen3.7-plus | 1 |
| **Phase 3** | assignment schema 设计 | `ultrabrain` | glm-5.2 | 1 |
| | 提交/批改/截止日期 API | `deep` | glm-5.2 | 并行 ×2 |
| | R2 文件上传集成 | `unspecified-high` | qwen3.7-plus | 1 |
| | 学生提交 UI、教师批改 UI | `visual-engineering` | qwen3.7-plus | 并行 ×2 |
| **Phase 4** | video schema 设计 | `ultrabrain` | glm-5.2 | 1 |
| | 视频上传/流式/进度 API | `deep` | glm-5.2 | 并行 ×2 |
| | 视频播放器、笔记标注 UI | `visual-engineering` | qwen3.7-plus | 并行 ×2 |
| **Phase 5** | assessment schema 设计 | `ultrabrain` | glm-5.2 | 1 |
| | 题库管理 API | `deep` | glm-5.2 | 并行 ×2 |
| | 自动评分引擎 | `ultrabrain` | glm-5.2 | 1 |
| | 考试界面（计时+锁屏） | `visual-engineering` | qwen3.7-plus | 1 |
| | 成绩发布流程 | `deep` | glm-5.2 | 1 |
| **Phase 6** | grade schema 设计 | `ultrabrain` | glm-5.2 | 1 |
| | 成绩计算/汇总逻辑 | `ultrabrain` | glm-5.2 | 1 |
| | 成绩单导出 API | `deep` | glm-5.2 | 1 |
| | 仪表盘 UI、图表 | `visual-engineering` | qwen3.7-plus | 并行 ×2 |
| **Phase 7** | interaction schema 设计 | `ultrabrain` | glm-5.2 | 1 |
| | 问答/讨论 API | `deep` | glm-5.2 | 并行 ×2 |
| | 通知服务 | `unspecified-high` | qwen3.7-plus | 1 |
| | 讨论区 UI、通知组件 | `visual-engineering` | qwen3.7-plus | 并行 ×2 |

### 10.4 工作流规则

1. **schema 先行** —— 每个 Phase 先派发一个 `ultrabrain` 设计表结构，等 schema 确认后再派发 API 和 UI
2. **API + UI 可并行** —— schema 就绪后，`deep`（API）和 `visual-engineering`（UI）同时派发
3. **oracle 用于架构闸门** —— 每个 Phase 的 schema 或关键算法完成时，可咨询 `oracle` 确认正确性
4. **momus 用于交付闸门** —— 每个 Phase 合并前，经 `momus` 审查计划/代码完整性
5. **跨 Phase 不阻塞** —— Phase 2 的 API 和 Phase 3 的 schema 可重叠（只要不依赖同一张表）

---

## 11. 待确认事项

- [ ] 证书 PDF 模板设计
- [ ] 移动端适配方案
- [ ] 离线支持（PWA）
- [ ] 直播平台选型（Zoom / 腾讯会议 / 自建）
- [ ] 防作弊机制（考试锁定浏览器、题目乱序等）
- [ ] 数据备份策略

---

**文档版本**: 2.0
**最后更新**: 2026-07-16
**作者**: Sisyphus (AI Architect)
**取代**: v1.0 (2026-07-04 学员档案管理系统设计)
