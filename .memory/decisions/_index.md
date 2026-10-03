# Architecture Decision Records (ADR) Index
> Last updated: 2026-08-05

| ID | Title | Status | Date |
|----|-------|--------|------|
| [ADR-001](001-pbkdf2-password-hashing.md) | PBKDF2 替代 SHA-256 密码哈希 | Accepted | 2026-07-23 |
| [ADR-002](002-dev-rate-limit-exemption.md) | 本地与测试环境放宽 rateLimit 速率限制 | Accepted | 2026-07-23 |
| [ADR-003](003-parameterized-sql-timestamp-updates.md) | 强制规范 SQL 时间戳 UPDATE 的参数化绑定 | Accepted | 2026-07-23 |
| [ADR-004](004-stable-dom-node-updates.md) | 前端 DOM 状态切换优先使用稳定节点与 textContent | Accepted | 2026-07-23 |
| [ADR-005](005-fk-noaction-keep-no-rebuild.md) | courses.created_by / classes.advisor_id 保留 NO ACTION，不在 014 重建 | Accepted | 2026-08-03 |
| [ADR-006](006-status-tokens-contrast.md) | 状态色 token 加深至 WCAG AA（late #8A4F00 / excused #39637A） | Accepted | 2026-08-03 |
| [ADR-007](007-md-book-reader.md) | 独立 MD 在线阅读器（rdr- 前缀零共享旧系统，manuscript/ 为唯一数据源） | Accepted | 2026-08-05 |
| [ADR-008](008-books2-catalog.md) | books2 独立书籍总目录页（不动 books/index.html 与导航） | Accepted | 2026-08-05 |
| [ADR-009](009-sharepoint-video-embed.md) | SharePoint 视频直嵌博客文章（embed.aspx iframe，仅改 7323.md） | Accepted | 2026-09-07 |
| [ADR-010](010-two-level-categories.md) | 博客分类改为二级分类树（categories.json + posts/categories 叶子名 + index.html 可折叠树） | Accepted | 2026-09-26 |
| [ADR-011](011-reader-annotations-same-origin-api.md) | 阅读器高亮笔记：博客项目同域挂最小 API（_routes 白名单 + 共享 D1 + 独立 JWT_SECRET），新表 reader_annotations | Proposed | 2026-10-03 |
