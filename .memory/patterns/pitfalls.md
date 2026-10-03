# Pitfalls & Lessons Learned
> Last updated: 2026-07-23

## P-001: innerHTML 导致存储型 XSS
- **Date**: 2026-07-23
- **Symptom**: 用户生成内容（课程标题、描述）通过 innerHTML 渲染，可注入恶意脚本
- **Root Cause**: 前端使用 innerHTML 而非 textContent 渲染用户输入
- **Fix**: 全局替换 innerHTML 为 textContent
- **Prevention**: 始终用 textContent 渲染用户输入，仅对可信内容使用 innerHTML

## P-002: SHA-256 密码哈希抗暴力破解不足
- **Date**: 2026-07-23
- **Symptom**: 密码哈希使用 SHA-256（快速哈希），GPU 可高速破解
- **Root Cause**: 初始实现选择了通用哈希而非专用密码哈希函数
- **Fix**: 迁移到 PBKDF2（100000 轮迭代）
- **Prevention**: 密码存储始终用 PBKDF2/bcrypt/argon2，不要用 SHA-*/MD5

## P-004: SharePoint stream.aspx / :v: 短链不能直接 iframe（2026-09-07）
- **Symptom**: 把 `stream.aspx?id=...` 或 `:v:` 分享链放进 `iframe src`，外站一片空白或 CSP 报错。
- **Root Cause**: 那是完整观看页，`frame-ancestors` 仅放行微软系域名；且非 `Anyone` 分享时匿名访客被拦到登录。
- **Fix**: 换 `embed.aspx?UniqueId=`（S-009），并确认分享为 `Anyone with the link`。
- **Prevention**: 凡 SharePoint 嵌入一律先在无登录浏览器打开 `embed.aspx` 确认播放器可加载，再写入 `.md`；`curl` 状态码不可作为可播依据（2026-09-07：20 个 `id=` 链接 curl 全 200，浏览器实测 7318/7259 均为 AccessDenied）。

## P-003: JWT_SECRET 硬编码在 wrangler.toml
- **Date**: 2026-07-23 (ongoing)
- **Symptom**: wrangler.toml 包含明文 JWT_SECRET，提交到公开仓库即泄露
- **Root Cause**: 初始配置将密钥写入了配置文件
- **Fix**: 使用 CF Pages 环境变量 / Secrets 替代
- **Prevention**: wrangler.toml 应入 .gitignore 或使用 `[vars]` + 生产环境 Secrets

## P-005: 换 cwd 部署博客 → Functions 静默消失，生产 /api 全挂（2026-10-03 发现）
- **Symptom**: `jiadongli.online/api/health` 返回首页 HTML（200）；`POST /api/auth/signin` 返回 405；阅读器永远是"未登录"，登录提示"登录失败"。
- **Root Cause**: wrangler `pages deploy` 只编译 `process.cwd()/functions`（wrangler 4.123 cli.js:370549）；`drafts/oikos_lectures/deploy_site.sh` 在 `/tmp/cfdeploy`（无 functions/）里执行。未匹配的 `/api/*` 走 SPA fallback 返回首页。
- **Fix**: 见 ADR-011（Proposed）：入库部署脚本，复制 functions/ 到部署目录，部署后自检 `/api/health` 必须是 ok JSON。
- **Prevention**: 判定 API 可用要看 content-type 是否为 JSON，不能只看状态码 200；前端遇到非 JSON 响应应提示"服务不可用"，而不是当作未登录。

## P-006: ReaderAuth.getProfile() 返回 `{success, user}`，不是 user 本身
- **Symptom**: `reader.js` 课件笔记中 `user.id` 为 undefined，草稿 key 变成 `cw_draft_undefined_…`（同一浏览器不同账号共享草稿）；`reader.js:824` 调用了未定义的 `loadDraft`。
- **Prevention**: 取用户 id 一律用 `profile.user.id`；修复需用户确认（设计文档 §1.4）。
