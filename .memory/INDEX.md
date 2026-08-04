# 📇 Project Memory Index
> Auto-maintained by OpenCode Memory System | Last updated: 2026-08-03T22:40:00+08:00

## Project Identity
- **Name**: brianinchrist-site
- **Stack**: Vanilla HTML/CSS/JS + Cloudflare Pages Functions (ES Modules) + Python (migration tools)
- **Phase**: Active Development — 4 阶段修复计划（P1 授权层 / P2 数据 / P3 闭环 / P4 视觉）已完成，P4 验收通过
- **Live**: `https://organicchurch.dpdns.org` (brianinchrist-site) / `https://main.brianinchrist-courses.pages.dev` (brianinchrist-courses)
- **Repo**: `https://github.com/brianinchrist2/brian-site.git` (branch: `master`；当前工作分支 `remediation`)

## Current Focus
- ✅ P1–P4 修复计划全部完成（Tasks 1-18）：授权公共层 requireAuth/requireRole、D1 014 时间戳统一、模块闭环、17 页 UI 收敛共享组件库（course.css）
- ✅ P4 验收：`npx vitest run` 43 files / 161 tests 全绿；courses.html/classes.html 收敛、attendance.js 色值 tokenize、徽章对比度 ≥4.5:1（ADR-006）
- ⏳ **待办：部署仍阻塞** — `wrangler whoami` 未认证；用户需 `wrangler login` 后执行 `npx wrangler pages deploy`（P1 起持续阻塞）

## Memory Map
| Layer | File | Status | Last Modified |
|-------|------|--------|---------------|
| Session | sessions/2026-08-03_p4-acceptance.md | ✅ Current | 2026-08-03 |
| Architecture | project/architecture.md | ✅ Current | 2026-08-03 |
| Conventions | project/conventions.md | ✅ Current | 2026-07-23 |
| Decisions | decisions/_index.md | ✅ 6 entries | 2026-08-03 |
| Tasks | tasks/_in-progress.md | ✅ All Tasks Completed | 2026-07-23 |
| Entities | entities/files.md | ✅ Current | 2026-08-03 |

## Quick Context (Hot Memory)
- 💡 **vars.css 双副本**：`course-app/assets/css/vars.css` 与 `brianinchrist/organicchurch/assets/css/vars.css` 必须同步修改（Task 17 惯例）；语义状态色 late/excused 已按 ADR-006 加深为 #8A4F00/#39637A。
- 💡 **共享组件库**：course-app 17 页全部引用 `vars.css + course.css`，页面只保留 JS 运行期类名的 token 化特例样式；JS 层硬编码色已清零（attendance.js 读 CSS 变量）。
- 💡 **部署命令**：`npx wrangler pages deploy`（未认证会失败）；本地预览 `python3 -m http.server 8000`。

## Staleness Warnings
- tasks/_done.md 与 tasks/_in-progress.md 停留在 2026-07-23（remediation 计划期间未逐任务记录，状态以 .superpowers/sdd/progress.md 为准）
