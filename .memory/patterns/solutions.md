# Solutions & Verified Patterns
> Last updated: 2026-07-23

## S-001: CF Pages Functions 安全响应模式
- **Pattern**: 所有 API handler 使用统一 try/catch + JSON 错误响应
- ```js
  export async function onRequest(context) {
    try {
      // handler logic
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
  ```

## S-002: 密码哈希渐进式升级
- **Pattern**: 登录时检测旧哈希格式，自动升级后写回存储
- 用户无感知，不强制重置密码
- 适用于 KV 等键值存储

## S-003: 博客文章原子添加
- **Pattern**: 单篇文章添加时，只 append posts.json 数组 + 创建 HTML 文件
- **Never**: 整体读取+写入 posts.json（2500+ 条）

## S-004: JWT_SECRET 生产部署
- **Pattern**: JWT_SECRET 必须用 `wrangler pages secret put` 注入，不放在 `wrangler.toml [vars]`
- 命令: `npx wrangler pages secret put JWT_SECRET --project-name <project>`
- 验证: 调用 `POST /api/auth/signin` 返回 token 而非 "Server configuration error"
- **Gotcha**: secret 设置后需要重新部署才能生效

## S-005: 课程站点部署路径
- **Pattern**: `wrangler.toml` 中 `pages_build_output_dir = "course-app"`，所以部署后 course-app/ 成为根目录
- 前端资源路径：`/assets/css/`、`/assets/js/`（不加 `/course-app/` 前缀）
- 博客站点用 `wrangler-blog.toml`，`pages_build_output_dir = "brianinchrist"`

## S-006: 博客站点实际部署命令（2026-08-05 验证）
- **Pattern**: `npx wrangler pages deploy brianinchrist --project-name brianinchrist-site`
- **Gotcha**: `wrangler pages deploy --config wrangler-blog.toml` 会报错 `Pages does not support custom paths for the Wrangler configuration file` —— Pages 子命令不支持 `--config` 自定义路径，必须用显式目录 + `--project-name`。
- 验证: 部署成功输出 `https://{id}.brianinchrist-site.pages.dev`，自定义域名 `https://jiadongli.online`（主域名）即时生效。
- 部署后验证命令: `curl.exe -sS -L -o NUL -w "HTTP:%{http_code} LEN:%{size_download}" "https://jiadongli.online/<path>/"`

## S-007: 线上静态内容校验（防编码误报）
- **Pattern**: 校验线上 HTML 内容时，用 `curl -o 文件` + `Get-Content -Encoding UTF8` 读取判断，**不要**在 PowerShell 里直接对 `curl.exe` 管道输出做 `.Contains()`——GBK 控制台解码 UTF-8 会误报 False。
- 示例: `$c = Get-Content "$env:TEMP\x.html" -Raw -Encoding UTF8; $c.Contains('书名')`

## S-009: SharePoint 视频嵌入博客文章（2026-09-07 验证，ADR-009）
- **Pattern**: SharePoint 视频用 `.../_layouts/15/embed.aspx?UniqueId=<id>` 做 `iframe src`，外层 `div` 用 `position:relative;width:100%;padding-top:56.25%` 实现 16:9 响应式，iframe 绝对定位 `width/height:100%;border:0`，inline style 写在 `.md` 里，不碰 `post.css`。
- **UniqueId 获取**: 打开推导出的 `embed.aspx?id=<文件路径>` 播放页，从标题链接 `viewer.aspx?sourcedoc=<UniqueId>` 复制。
- **验证**: 本地 `python3 -m http.server` + 打开 `posts/post.html?id=<id>`，iframe 内出现 SharePoint 媒体播放器即跨站放行；`stream.aspx`/`:v:` 短链直接做 src 会被 `frame-ancestors` CSP 挡。
- **Gotcha**: 分享必须设为 `Anyone with the link`，否则站外访客只见登录框。

## S-008: 独立静态课件页已移除，课件数据手维护（2026-08-07）
- **Decision**: 用户决定移除独立静态课件页（courseware/index.html、chapter.html、review.html、print.html 及其 assets/js），阅读器内嵌课件面板（fetch courseware/assets/data/courseware.json）为唯一课件入口。
- **Data**: courseware.json 与 manifest.json 现为**手维护数据**（生成器 build_courseware.py / gen_manifest.py 已随课件移除）；改课件/书目需直接编辑 JSON 或从 `.backup/library_static_20260806/` 恢复工具。
- **Backup**: 完整课件实现备份于 `.backup/library_static_20260806/{lordship_gospel_courseware,oikos_church_courseware,lordship_gospel_tools,oikos_church_tools}/`。
- **登录门禁/笔记同步**: 移除前已做在 lordship_gospel 课件页的 ReaderAuth 门禁与 saveSync/loadSync 随静态页移除；阅读器自身（reader.js + reader-auth.js + /api/courseware/notes）仍为课件与笔记的主入口。
- **course-app 链接**: 原指向 books/oikos_church/courseware 的外链已改为 jiadongli.online/organicchurch/library/reader.html?book=...
