# ADR-008: books2 独立书籍总目录页

> Status: Accepted | Date: 2026-08-05

## Context

用户要求"把书籍总目录放在 `https://organicchurch.dpdns.org/organicchurch/books2/`"。澄清后确认方案：**新建独立总目录页**，不修改现有 `books/index.html`（著作页）与首页导航。此前自定义域名"所有路径返回首页"的排查结论：测试路径拼写错误（`organicchrist` 少 `u`），站点本身正常，无需修复。

## Decision

- 新建 `brianinchrist/organicchurch/books2/index.html` 独立总目录页，服务 URL `/organicchurch/books2/`。
- 沿用 Scriptorium 设计系统（vars.css 变量、同款导航/页脚/移动菜单），接入 `auth.css`/`auth.js`。
- 收录两本书：
  - I 家教会的本体论革命（oikos_church）：中文本 / English Version / 互动课件
  - II 主权福音与传道法（lordship_gospel）：在线阅读器（`reader.html?book=lordship_gospel`）/ 学习讨论手册
- `books/index.html`（著作页）、首页导航、`lordship_gospel/manifest.json` 全部零改动（manifest 标题「主权福音与传福音」与目录页书名的既有差异保留，属既有状态）。

## Consequences

- 目录页与著作页并存，各自入口独立；新增书籍需同时维护两处入口（或后续按需合并）。
- 部署命令坑：`wrangler pages deploy` **不支持 `--config` 自定义路径**；正确命令为 `npx wrangler pages deploy brianinchrist --project-name brianinchrist-site`（见 S-006）。
- 部署成功：`ac00121d.brianinchrist-site.pages.dev`；自定义域名与 pages.dev 双端 200 验证通过。
