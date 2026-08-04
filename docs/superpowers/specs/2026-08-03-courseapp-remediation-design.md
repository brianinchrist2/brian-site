# course-app 全量修复设计文档

> 日期：2026-08-03
> 来源：三份并行审核报告（Software Architect / UX Architect / UI Designer，2026-08-03）
> 决策：全量修复 / 渐进收敛到基准页 / 分阶段可部署 / 含数据清洗迁移

## 背景与目标

课程管理系统（course-app）经三份并行审核发现约 40+ 问题：
- **安全**：4 Critical（无认证端点 ×2、考勤 IDOR ×2）+ 7 High（考试作弊链、教师越权、内容边界缺失等）
- **UX**：5 Critical（成绩页空白、证书功能全死、教师无法批改、侧栏死链、无建班 UI）+ 4 High
- **UI**：1 Critical（对比度 1.8:1）+ 4 High（字体漂移、三套 UI 并存、无响应式、徽章对比度）

目标：分四个阶段全部修复，每阶段可独立部署验证。

## 修复原则

1. **先统一授权层，再补漏洞**——45 个端点手写认证样板（8 行重复代码）是漏检根因，先抽公共库再全量替换，避免逐点修补产生更多样板
2. **服务端校验，前端只做体验**——时长限制、进度、权限全部以服务端为准
3. **每阶段可部署**——阶段间无耦合，风险从高到低递进
4. **数据库变更走迁移管理**——任何 DDL/数据清洗必须走 `wrangler d1 migrations`，执行前备份

## 阶段 P1：安全止血

### 1.1 新公共库 `functions/_utils/requireAuth.js`

```js
// 导出四个函数：
verifyAuth(db, request, env)          // 解析 Bearer + verifyJWT + 查 roles，失败抛 401
requireRole(roles, allowed)           // 角色白名单校验，失败抛 403
requireOwnership(db, kind, id, userId) // 归属校验（教师=advisor/创建者，admin 跳过）
getRoles(db, userId)                  // try/catch 兜底返回 []
```

- 现有 `_utils/auth.js`（PBKDF2）、`_utils/jwt.js`（HS256）不动，requireAuth 在其上封装
- 45 个端点统一替换手写样板（Bearer 解析 + verifyJWT + JSON.parse(roles) 约 8 行）
- 修复 M11：roles 解析统一走 getRoles，损坏数据不再 500

### 1.2 补认证（C1/C2）

| 端点 | 修复 |
|------|------|
| `courses/items.js` GET | 加 verifyAuth + 校验已选课（enrollments 存在） |
| `attendance/sessions/[id].js` GET | 加 verifyAuth + 班级成员/教师校验 |

### 1.3 考勤 IDOR（C3/C4）

- `attendance/stats.js`：学生强制 `WHERE cm.student_id = payload.sub`；教师/班主任校验 `classes.advisor_id`
- `attendance/records.js`：学生仅允许 `student_id = payload.sub` 且 session 属于其班级；教师校验班级归属

### 1.4 考试完整性（H1/H2/H3）

- `assessments/[id]/questions.js` GET：要求 assessment `status='published'` + 用户已选课 + 存在 in_progress 提交；教师/管理员直读
- `assessments/[id]/start.js`：start 前校验 enrollment；`available_from/until` 时间窗检查提到重考路径之前；限制重考次数（默认 ≤3 次，取课程配置）
- `assessments/[id]/submit.js`：服务端用 `started_at + duration_minutes` 校验时限，超时拒绝

### 1.5 内容边界与越权（H4-H7）

- 列表端点（assignments/videos/interactions/questions）：学生统一 JOIN `enrollments`/`class_members` 过滤，教师按所教课程过滤
- 教师写操作（attendance sessions/records、assessments、assignments、grades）：统一 requireOwnership 校验班主任/课程归属
- `submissions/[id]/grade.js`（作业+考核）：打分前校验 submission 属于该课程，且 `answer_id` 属于该 submission
- `interactions/highlights/[id]/replies.js` GET：复用 POST 的可见性判定（作者/公开/同班）

### 1.6 收尾（M 级）

- 分页 `limit` 统一 `Math.max(1, Math.min(parseInt(x)||20, 100))`（catalog/items/sessions/records/questions/highlights 等）
- `admin/migrate-users.js`：加 `MIGRATION_ENABLED !== 'true'` 开关返回 404，或移除
- `students/migrate.js`：条目上限 100、逐批 batch、`question_index` 非负整数校验
- `enroll.js` / `assign-course.js`：`studentIds` 上限 100、校验 `classes.advisor_id`（admin 除外）
- `certificates/index.js` 申请：校验 enrollments 存在
- `progress.js` POST：服务端校验 itemId 属于 courseId + 选课关系；score 仅由考核/作业系统写入
- `reports/index.js` 评语：校验学生在该教师所教课程中
- 全站写端点按用户限速（复用 rate-limit 模式，删除密钥字符串比对逻辑，改用 `env.ENVIRONMENT` 判定 dev）
- 审计确认正面项保持不变：PBKDF2 100k 迭代、verifyJWT 校验签名与 exp、JWT_SECRET 走 secret 注入

### P1 验收

- 逐端点核对：无认证 GET、角色、归属三类检查齐备
- 现有 vitest 测试套件（tests/，约 33 个文件）全部通过 + 新增边界测试（未选课学生、跨班教师、匿名请求）

## 阶段 P2：数据层

### 2.1 迁移 014 `timestamp_unify.sql`

- 扫描全库日期列（`PRAGMA table_info` 确认），已知目标：`class_members.joined_at`、`answers.created_at`、`progress.started_at`、`notifications.created_at` 及所有 `*_at` 列
- 清洗模式（幂等）：
  ```sql
  UPDATE <table> SET <col> = REPLACE(<col>, ' ', 'T') || 'Z'
    WHERE <col> NOT LIKE '%T%' AND <col> <> '';
  ```
- 新迁移内新建表使用 ISO 默认值：`strftime('%Y-%m-%dT%H:%M:%fZ','now')`
- **执行前 `wrangler d1 export` 全库备份**

### 2.2 索引补齐（M9）

```sql
CREATE INDEX IF NOT EXISTS idx_progress_item_id     ON progress(item_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_courses_course_id ON class_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_session_topics_session  ON session_topics(class_session_id);
```

### 2.3 迁移幂等化（M8）

- `011-assessment-retakes.sql` / `012-cascade-fixes.sql` / `013-submission-versions.sql`：DROP 加 `IF EXISTS`，重建加 `IF NOT EXISTS`
- docs 记录：破坏性迁移需 `PRAGMA foreign_keys=OFF` 执行
- 先用 `wrangler d1 migrations list` 核对生产状态，已部分应用则补补丁迁移而非改旧文件

### 2.4 FK 策略（L9）

- `courses.created_by`、`classes.advisor_id` 外键补 `ON DELETE` 策略（先查现状，缺失则重建表迁移）

### P2 验收

- 014 应用后无空格格式残留；排序/日期过滤正确
- `migrations list` 干净；`PRAGMA index_list` 确认索引存在

## 阶段 P3：UX 核心闭环

### 3.1 学生成绩页（C1 + M2）

- `grades/final.js`：`course_id='all'` 后端特判为学生全部课程
- 成绩卡片显示课程名

### 3.2 证书两端复活（C2）

- `student/certificate.html`：`#btn-apply` 绑定 POST `/api/modules/certificates`；`#progress` 显示真实进度
- `admin/reports.html`：乱码文案 GBK→UTF-8 修复；补 approve/reject 事件委托

### 3.3 教师批改界面（C3）

- 新增 `admin/submissions.html`：提交列表 + 评分表单（消费 `assignments/[id]/submissions.js`、`submissions/[id]/grade.js`）
- `admin/assessments.html` "管理题目" 接入题目查看（编辑能力若无 API 则标注下阶段）

### 3.4 导航骨架（C4/C5）

- `admin/attendance.html` 侧栏死链指向真实页面；不存在的功能删除或标注
- 考勤模态框 `close-modal-btn-2` 绑定关闭
- 新增 `admin/classes.html`：建班 → 添加学生（roster/enroll）→ 分配课程（assign-course）

### 3.5 学生课程视角（H1/H2）

- 新增 `student/courses.html`：我的课程卡片列表
- 课程详情：视频/作业/考核/成绩分组入口
- videos/assignments 列表按课程分组
- 统一学生导航外壳（仪表盘/课程/作业/考核/成绩/证书）；attendance 并入；`/organicchurch/` 外链改完整 URL 或移除

### 3.6 提交/反馈强化（H6/H7/M）

- 作业提交：按钮防重 + res.ok 检查 + 状态徽章与分数显示 + 保留已填内容
- 测验提交：res.ok 检查 + 未答题数确认
- 重考确认对话框
- 管理端表格空状态
- 问答卡片展开显示回答
- 登录按角色分流：student→仪表盘，teacher/admin→管理后台

### P3 验收

- 学生主路径：选课→看视频→交作业→考测验→看成绩→申请证书
- 教师主路径：建班→加学生→记考勤→批作业→出成绩→审批证书
- 无死链

## 阶段 P4：UI 收敛到基准页

### 4.1 共享层

- `course-app/assets/css/course.css` 扩展：侧栏布局、btn 体系、卡片、表格 wrap、徽章、模态框、表单
- 语义色令牌提升为共享令牌（`--status-*`），修复师生端状态色矛盾（H2）
- `vars.css` 补 `--transition: 0.2s ease`（M2）
- course.css `@import` Google Fonts，所有页面引用（H1）
- `--faint #94866F` → `#7A6C55`（M9）

### 4.2 逐页迁移（每页一次提交）

1. student/grades → 2. student/certificate → 3. student/assignments → 4. student/assessments（修计时器重叠 M3）→ 5. student/videos → 6. student/questions → 7. student/dashboard → 8. admin/attendance（修 C1 对比度）→ 9. admin 其余页面（dashboard/grades/books/assignments/assessments/reports/submissions）

### 4.3 全局项

- 响应式：student 7 页补 ≤768px 断点；admin 表格统一 table-wrap
- 徽章对比度 ≥4.5:1
- 模态框统一暖棕遮罩 + Esc + focus trap
- alert() 换 toast
- 深色模式本阶段不做（预留能力）

### P4 验收

- 每页对照基准页视觉一致性（布局/按钮/徽章/字体/响应式）
- grep 无硬编码色值残留
- 对比度抽查 ≥4.5:1

## 全局约束

- 每次部署：`npx wrangler pages deploy`（P1/P2 部署前跑测试）
- 数据库变更：`wrangler d1 migrations apply`，执行前备份
- 提交规范：Conventional Commits（feat:/fix:/chore:）
- 阶段顺序不可交换：P1（重构授权层）→ P2（数据）→ P3（闭环）→ P4（视觉）
