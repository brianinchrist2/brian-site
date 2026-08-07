# 📇 Project Memory Index
> Auto-maintained by OpenCode Memory System | Last updated: 2026-08-05T17:45:00+08:00

## Project Identity
- **Name**: brianinchrist-site
- **Stack**: Vanilla HTML/CSS/JS + Cloudflare Pages Functions (ES Modules) + Python (migration tools)
- **Phase**: Active Development — 4 阶段修复计划（P1 授权层 / P2 数据 / P3 闭环 / P4 视觉）已完成；MD 在线阅读器已交付（commit 7339e47）；books2 独立总目录页已交付并部署（ac00121d）
- **Live**: `https://jiadongli.online`（主域名，2026-08-06 确认；`organicchurch.dpdns.org` 旧域名同部署） (brianinchrist-site) / `https://main.brianinchrist-courses.pages.dev` (brianinchrist-courses)
- **Repo**: `https://github.com/brianinchrist2/brian-site.git` (branch: `main`)

## Current Focus
- ✅ P1–P4 修复计划全部完成（Tasks 1-18）：授权公共层 requireAuth/requireRole、D1 014 时间戳统一、模块闭环、17 页 UI 收敛共享组件库（course.css）
- ✅ **MD 在线阅读器交付**（2026-08-05，commit 7339e47，ADR-007）：书稿规范化为 `books/lordship_gospel/manuscript/`（20 MD）；独立 reader（rdr- 前缀零共享旧系统）；AC1–AC9 走查通过
- ✅ **books2 独立总目录页交付并部署**（2026-08-05，ADR-008）：`books2/index.html` 上线 `/organicchurch/books2/`，自定义域名 + pages.dev 双端 200 验证通过，5 个书籍入口全部 200
- ✅ **自定义域名排查结案**：此前"所有路径返回首页"为测试路径拼写错误（`organicchrist` 少 u），站点无缺陷；部署阻塞已解除（wrangler 已认证，ac00121d 部署成功）
- ⏳ **待办**：books2/index.html 未 commit（工作区另有既有未提交改动：book2/*.html 编辑、courseware 生成文件、scripts/convert_lordship_gospel.py、backups/ 等，用户未要求提交）

## Memory Map
| Layer | File | Status | Last Modified |
|-------|------|--------|---------------|
| Session | sessions/2026-08-05_books2-catalog.md | ✅ Current | 2026-08-05 |
| Architecture | project/architecture.md | ✅ Current | 2026-08-03 |
| Conventions | project/conventions.md | ✅ Current | 2026-07-23 |
| Decisions | decisions/_index.md | ✅ 8 entries | 2026-08-05 |
| Tasks | tasks/_in-progress.md | ✅ All Tasks Completed | 2026-07-23 |
| Entities | entities/files.md | ✅ Current | 2026-08-05 |

## Quick Context (Hot Memory)
- 💡 **vars.css 双副本**：`course-app/assets/css/vars.css` 与 `brianinchrist/organicchurch/assets/css/vars.css` 必须同步修改（Task 17 惯例）。
- 💡 **MD 阅读器（ADR-007）**：书稿唯一数据源 = `books/lordship_gospel/manuscript/`（改书稿 → 重跑 `python3 tools/gen_manifest.py` 再部署）；新书接入 = 目录 + MD + manifest + 入口链接，零触碰旧 book2/ 系统；`courseware.json` 由 build_courseware.py 生成，勿手改。
- 💡 **books2 总目录页（ADR-008）**：`books2/index.html` 与 `books/index.html` 并存各自独立；收录 oikos_church（中/英/课件）+ lordship_gospel（阅读器/手册）；新书需同时维护两处入口。manifest 标题「主权福音与传福音」与页面书名「主权福音与传道法」既有差异保留。
- 💡 **部署命令（S-006）**：博客站点用 `npx wrangler pages deploy brianinchrist --project-name brianinchrist-site`（`--config` 路径 pages 不支持！）；课程站点 `npx wrangler pages deploy`（wrangler.toml）。
- 💡 **SPA fallback**：仓库无顶层 `404.html` → CF Pages 未匹配路径返回根首页 200（非缺陷）；如要禁用 fallback 需在 `brianinchrist/` 根加 `404.html`。

## Staleness Warnings
- tasks/_done.md 与 tasks/_in-progress.md 停留在 2026-07-23（remediation 计划期间未逐任务记录，状态以 .superpowers/sdd/progress.md 为准）
- 工作区有未提交改动（book2/*.html 内容编辑、courseware 生成文件、scripts/convert_lordship_gospel.py、backups/、scratch/、opencode.json、login-page-snapshot.md、books2/index.html）——用户未要求提交
