# ADR-007: 独立 MD 在线阅读器（零共享旧系统）

> Status: Accepted | Date: 2026-08-05

## Context

《主权福音与传福音》原有 `book2/*.html` 静态章节 + 旧 `assets/js/reader.js` / `assets/css/reader.css` 阅读系统。用户要求"先整理完整的 md 书稿，放在规范的目录中，作为数据源"，并明确旧系统零接触：不得读取逻辑用于实现、不得复制、不得修改。

## Decision

- 在 `brianinchrist/organicchurch/books/` 下新建独立阅读器，`rdr-` 前缀 DOM/CSS 契约，与旧系统零共享。
- 书稿规范化为 `books/lordship_gospel/manuscript/`（20 个 MD：18 章 + 摘要 + 讨论课件），为唯一数据源。
- `tools/gen_manifest.py` 从 manuscript 生成 `manifest.json`（6 部 18 章，含 `cw` 课件映射与 `EXCLUDED_PART=学习资源`）。
- 渲染架构：客户端 fetch manifest + marked.min.js 渲染 MD，无构建步骤，纯静态部署（CF Pages 输出目录）。
- 阅读器功能：封面/章节视图、设置持久化（theme/measure/font → localStorage）、滚动进度条、回到顶部、侧边栏目录导航、错误路径（无效 book → 错误提示；无效 ch → 回退封面）、last_page 续读。

## Consequences

- 新书接入成本 = 目录 + 20 个 MD + 生成 manifest + 入口链接，不触碰旧系统。
- 旧 `book2/*.html` 与旧 reader 继续可用（回归验证通过），可后续按需下线。
- 章节目录（TOC）在封面与侧边栏各渲染一次（契约规定），改 manifest 即改目录。
- `scripts/convert_lordship_gospel.py` 为陈旧用户脚本，未触碰、未提交。
