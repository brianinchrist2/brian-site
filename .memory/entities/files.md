# Key File Map
> Last synced: 2026-08-03 | Method: P4 验收 (Task 18)

## Entry Points
- `brianinchrist/index.html` — 站点首页
- `brianinchrist/organicchurch/index.html` — 博客列表页
- `course-app/` — 课程管理系统入口（login.html + index.html 落地页）

## Course App (UI 共享壳收敛，Task 13-18)
- `course-app/assets/css/vars.css` — Scriptorium 设计令牌（与 brianinchrist 副本同步，含 --status-*）
- `course-app/assets/css/course.css` — 共享组件库（topbar/sidebar/btn/card/table/badge/modal/toast/form）
- `course-app/assets/js/auth.js` — 前端 CourseAuth（token/requireAuth/requireRole）
- `course-app/assets/js/attendance.js` — 考勤录入模块（STATUS_COLORS 读 CSS 变量）
- `course-app/admin/*.html` — 9 页管理端（dashboard/attendance/assignments/submissions/grades/assessments/books/reports/classes）
- `course-app/student/*.html` — 8 页学生端（dashboard/courses/attendance/assignments/assessments/grades/videos/questions/certificate）
- 约定：页面仅保留 JS 运行期类名的最小 token 化特例样式，其余一律共享壳类

## Static Content
- `brianinchrist/organicchurch/{id}.html` — 博客文章 (250+ 篇)
- `brianinchrist/organicchurch/posts.json` — 博客元数据索引 (~2500+ 条)
- `brianinchrist/organicchurch/posts/categories.json` — 二级分类树唯一真源（ADR-010，2026-09-26）：6 个一级 → 二级叶子名；`posts.json` 的 `categories` 存叶子名，`index.html` 侧栏可折叠树据此渲染
- `brianinchrist/organicchurch/posts/post.html` + `posts/assets/js/post-viewer.js` — 单篇文章阅读器（`?id=` 取 `posts/<id>.md`，marked 渲染，原生 HTML/iframe 可透传）
- `brianinchrist/organicchurch/posts/7323.md` — 首篇 SharePoint 直嵌视频（ADR-009：embed.aspx UniqueId iframe + 保留外链/PDF 降级）
- `brianinchrist/organicchurch/books2/index.html` — 独立书籍总目录页（ADR-008，2026-08-05 交付并部署）：I oikos_church 三入口 / II lordship_gospel 阅读器+手册；与 books/index.html 并存，各自独立

## MD Book Reader (ADR-007, 2026-08-05)
- `brianinchrist/organicchurch/books/index.html` — 书籍入口（链接 → reader.html?book=lordship_gospel）
- `brianinchrist/organicchurch/books/reader.html` — 阅读器外壳（rdr- 契约）
- `brianinchrist/organicchurch/books/assets/css/reader.css` — 阅读器样式（rdr- 前缀，零共享旧系统）
- `brianinchrist/organicchurch/books/assets/js/reader.js` — 阅读器逻辑（fetch manifest + marked 渲染）
- `brianinchrist/organicchurch/books/assets/js/marked.min.js` — Markdown 渲染依赖
- `brianinchrist/organicchurch/books/lordship_gospel/manuscript/` — 规范书稿数据源（20 个 MD：18 章 + 摘要 + 讨论课件）
- `brianinchrist/organicchurch/books/lordship_gospel/manifest.json` — 书目元数据（6 部 18 章，由 gen_manifest.py 生成）
- `brianinchrist/organicchurch/books/lordship_gospel/tools/gen_manifest.py` — manifest 生成脚本
- `brianinchrist/organicchurch/books/lordship_gospel/tests/test_gen_manifest.py` — 生成脚本测试（7 用例）
- `brianinchrist/organicchurch/books/lordship_gospel/book2/*.html` — 旧静态章节（零接触，仍可用，待后续下线）
- `brianinchrist/organicchurch/books/lordship_gospel/courseware/` — 课件（chapter.html + assets/data/courseware.json）

## Design System
- `brianinchrist/organicchurch/assets/css/vars.css` — 设计 Token（Scriptorium）
- `brianinchrist/organicchurch/assets/css/article.css` — 文章样式

## Serverless Functions
- `functions/api/auth/signin.js` — 登录 POST
- `functions/api/auth/signup.js` — 注册 POST
- `functions/api/user/profile.js` — 用户信息 GET/POST
- `functions/api/modules/` — 课程模块 API（courses/classes/attendance/assignments/assessments/grades/books/videos/interactions/notifications/reports/students/certificates）
- `functions/api/modules/books/[id].js` — 书籍详情与更新 API (已修复时间戳参数绑定)
- `functions/api/modules/videos/[id]/log.js` — 视频播放记录 API (已修复时间戳绑定与相对导入)

## Shared Libs
- `functions/_utils/params.js` — 公共参数/授权层（requireAuth/requireRole，Task 1 重构）
- `functions/_utils/auth.js` — 密码哈希（PBKDF2 + SHA-256 兼容）
- `functions/_utils/jwt.js` — JWT 签名验证（HMAC-SHA256）
- `functions/_utils/rate-limit.js` — 速率限制（已添加本地开发/测试豁免）

## Source Content
- `oikos_church/en/` — 英文原稿
- `oikos_church/zh/` — 中文翻译稿

## Infrastructure
- `wrangler.toml` — CF Pages 部署配置
- `wrangler-blog.toml` — 博客专用配置
- `package.json` — Node 依赖

## Python Scripts
- `migrate_blog.py` — 博客迁移脚本
- `clean_oversized_assets.py` — 大资源清理
- `fix_reports.ps1` — PowerShell 修复脚本

## Migrations
- `migrations/` — D1 数据库迁移文件 (001 至 014，014 为时间戳统一)

## Tests
- `tests/` — 单元测试 + 集成测试 (43 文件，161 用例)
- `tests/api/modules/books/update.test.js` — 书籍更新 API 测试
- `tests/api/modules/videos/log-update.test.js` — 视频播放日志更新 API 测试
- `tests/e2e/` — Playwright 浏览器 E2E 测试
