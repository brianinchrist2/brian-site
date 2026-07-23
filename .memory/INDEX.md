# 📇 Project Memory Index
> Auto-maintained by OpenCode Memory System | Last updated: 2026-07-23T11:19:00+08:00

## Project Identity
- **Name**: brianinchrist-site
- **Stack**: Vanilla HTML/CSS/JS + Cloudflare Pages Functions (ES Modules) + Python (migration tools)
- **Phase**: Active Development
- **Live**: `https://organicchurch.dpdns.org`
- **Repo**: `https://github.com/brianinchrist2/brian-site.git` (branch: `master`)
- **CF Pages**: `brianinchrist-site`, output dir = `brianinchrist/`

## Current Focus
- ✅ 完成 `.memory/` 项目记忆管理系统搭建
- ✅ 通过 Systematic Debugging 协议排查并彻底修复 4 个致命缺陷（rateLimit 频控、notifications 列名错误、updated_at SQL 模板变量语法错误、video log 相对路径错误）
- ✅ 全量测试套件（108 个 Vitest 测试 + 4 个 Playwright E2E 测试）100% 绿灯通过

## Memory Map
| Layer | File | Status | Last Modified |
|-------|------|--------|---------------|
| Session | sessions/_active.md | ✅ Current | 2026-07-23 11:19 |
| Architecture | project/architecture.md | ✅ Current | 2026-07-23 |
| Conventions | project/conventions.md | ✅ Current | 2026-07-23 |
| Decisions | decisions/_index.md | ✅ 3 entries | 2026-07-23 |
| Tasks | tasks/_in-progress.md | ✅ All Tasks Completed | 2026-07-23 |
| Entities | entities/files.md | ✅ Current | 2026-07-23 |

## Quick Context (Hot Memory)
- ⚠️ `functions/` 目录是 CF Pages Functions（ESM），非标准 Node.js
- ⚠️ SQL UPDATE 中的时间戳赋值必须统一强制使用 `?` 占位符和参数绑定，禁止内联模板字符串 `${now()}`
- ⚠️ 深度层级（5层以上）下的 API 动态 import 注意核对相对路径 `../../../../`
- 💡 本地开发与测试环境（JWT_SECRET 为测试秘钥）已自动放宽 `rateLimit` 频控至 10000 次，避免 E2E 拦截
- 💡 新博客文章：在 `brianinchrist/organicchurch/` 创建 `{id}.html` + 更新 `posts.json`

## Staleness Warnings
- (none — newly updated)
