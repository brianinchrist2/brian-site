# 📇 Project Memory Index
> Auto-maintained by OpenCode Memory System | Last updated: 2026-07-23T11:32:30+08:00

## Project Identity
- **Name**: brianinchrist-site
- **Stack**: Vanilla HTML/CSS/JS + Cloudflare Pages Functions (ES Modules) + Python (migration tools)
- **Phase**: Active Development
- **Live**: `https://organicchurch.dpdns.org`
- **Repo**: `https://github.com/brianinchrist2/brian-site.git` (branch: `master`)
- **CF Pages**: `brianinchrist-site`, output dir = `brianinchrist/`

## Current Focus
- ✅ 完成项目全面体检（包含测试、安全、SQL 范式、DOM 稳健性、持久化记忆）
- ✅ 排查并修复前端 `login.html` 在多频切换登录/注册时的 DOM 节点销毁与重复事件绑定隐患
- ✅ 全量自动化测试套件（108 项 Vitest 测试 + 5 项 Playwright E2E 测试）100% 绿灯通过
- ✅ 提交并部署全部 bug 修复到生产环境 (commit `1108d7a`)
- ✅ 对生产环境执行 Playwright smoke test 验证部署正确性

## Memory Map
| Layer | File | Status | Last Modified |
|-------|------|--------|---------------|
| Session | sessions/_active.md | ✅ Current | 2026-07-23 11:32 |
| Architecture | project/architecture.md | ✅ Current | 2026-07-23 |
| Conventions | project/conventions.md | ✅ Current | 2026-07-23 |
| Decisions | decisions/_index.md | ✅ 4 entries | 2026-07-23 |
| Tasks | tasks/_in-progress.md | ✅ All Tasks Completed | 2026-07-23 |
| Entities | entities/files.md | ✅ Current | 2026-07-23 |

## Quick Context (Hot Memory)
- ⚠️ 前端 DOM 更新应优先采用稳定节点 `textContent`，避免使用 `innerHTML` 整体重构并重新绑定事件。
- ⚠️ SQL UPDATE 中的时间戳赋值必须统一强制使用 `?` 占位符和参数绑定，禁止内联模板字符串 `${now()}`。
- 💡 本地开发与测试环境已放宽 `rateLimit` 频控，避免 E2E 拦截。

## Staleness Warnings
- (none — newly updated)
