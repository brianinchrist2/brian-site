# ADR-011: 阅读器高亮笔记——博客项目同域挂载最小 API（方案 A′）

> Status: Proposed（待用户批准） | Date: 2026-10-03
> 设计文档：`docs/superpowers/specs/2026-10-03-reader-highlight-annotations-design.md`

## Context

- 需求：阅读器登录用户可对正文多色高亮 + 写笔记，服务端持久化跨设备同步。
- 2026-07-16 设计 §2.4 让博客 `brianinchrist-site` 保持纯静态、不绑 D1/JWT_SECRET，前提是"博客不需要认证"。2026-08-06 起阅读器已有课件登录 + 笔记，该前提不再成立。
- 2026-10-03 实测：`jiadongli.online/api/*` 返回首页 HTML（GET 200）或 405（POST），生产博客没有 Functions，课件登录与笔记都不可用。根因：wrangler 只编译 `cwd/functions`，而 `drafts/oikos_lectures/deploy_site.sh` 在没有 `functions/` 的 `/tmp/cfdeploy` 中部署。
- 备选 B（跨域打 courses）：courses 的 CORS 预检返回 405，`learn.organicchurch.dpdns.org` TLS 失败，并且需要改 5 处前端 fetch。

## Decision（建议）

- 博客项目绑定同一个 D1 `brianinchrist-db` 和 KV `USERS_KV`（账号体系共用），`JWT_SECRET` 与 courses 分开设值。
- `brianinchrist/_routes.json` 只放行 `/api/health`、`/api/auth/*`、`/api/user/*`、`/api/courseware/*`、`/api/reader/*`。
- `wrangler-blog.toml` 作为绑定真源；入库的 `scripts/deploy-blog.sh` 负责复制配置与 `functions/` 到临时目录后部署，守卫未提交的后端改动，部署后自检 `/api/health`。
- 新表 `reader_annotations`（迁移 016），不复用 `highlights`（其 `item_id` FK 指向 `course_items`，改造需要重建表）。

## Consequences

- `functions/` 要部署到两个项目，改后端时两边都需要发布。
- 博客内容发布会顺带发布 Functions，靠脚本守卫降低风险。
- 现有课件登录与笔记在前端零改动的情况下恢复。
