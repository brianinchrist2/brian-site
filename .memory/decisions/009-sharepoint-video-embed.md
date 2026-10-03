# ADR-009: SharePoint 视频直嵌博客文章（embed.aspx iframe）

> Status: Accepted | Date: 2026-09-07

## Context

`post?id=7323`（神学讲座 上帝荣耀的计划 — 教会）正文只有 SharePoint 外链（`:v:` 分享短链 + `stream.aspx` 观看页），用户要求把视频直接嵌入文章页。文章渲染链：`posts/<id>.md` → `post-viewer.js` 用 `marked.parse` 后 `innerHTML` 注入 `#pt-body`，无 sanitize 拦截，原生 HTML 可透传。

## Decision

- 不用 `stream.aspx` 做 `iframe src`（完整观看页，`frame-ancestors` 仅放行微软系域名，外站嵌入会被 CSP 挡）。
- 改用官方 `Embed` 同款 `embed.aspx`：
  `https://gracehouseedu-my.sharepoint.com/personal/.../_layouts/15/embed.aspx?UniqueId=c97f9820-391f-42d6-97b5-1b20bcfb1bd5`
  （`UniqueId` 从 embed 播放页 `viewer.aspx?sourcedoc=` 抓取；按路径的 `id=` 版改名即失效，故选 `UniqueId` 版）。
- 仅改 `posts/7323.md`：正文顶部加 16:9 响应式 wrapper（`padding-top:56.25%` + iframe 绝对定位，inline style），零改动 `post.css` / `post-viewer.js`。
- `[点击链接]` 外链已删除（2026-09-07 用户要求），仅保留 PDF 为降级入口。
- 前提：文件分享须为 `Anyone with the link`，否则站外访客只见登录框（Safari 无 M365 cookie 必现；实测本文件匿名可播）。

## Batch attempt (2026-09-07, reverted)

- 全站扫描：22 篇含 `:v:` 视频外链（7323 除外 21 篇）+ 4 篇 `:b:` 文档下载链（6726/6838/6801/6821，不动）+ 6732 已有 R2 视频。
- 曾用 `curl -sI` 取 302 `Location: stream.aspx?id=` 逐个推导 `embed.aspx?id=` 并批量替换 20 篇、6732 删链接；本地验证发现 7259 iframe 报 `frame-ancestors` 拒绝。
- 根因（2026-09-08 无登录浏览器逐个实测 21 个 `embed.aspx?id=`，以是否跳 `AccessDenied.aspx` 为准）：仅 7323 可播，其余 20 个（6732/6785/6793/6883/6888/6911/6932/7069/7111/7141/7148/7255/7259/7301/7307/7315/7318/7326/7329/7667/7669）全部拒绝 → **分享权限是按文件独立的**，只有 7323 为 Anyone。`curl` 的 200/302 状态不可信（20 个全 200，浏览器全拒），浏览器才是 ground truth。
- 处理：用户选择回退 20 篇 + 6732（`git checkout` 已执行，工作区仅剩 7323 改动），待分享改为 Anyone 后重做。发布因此暂停。
- 重做前置检查：浏览器无痕打开 `embed.aspx` 見到播放器才算过关；`AccessDenied` URL 里会泄露 `listItemUniqueId`，可直接拼 `UniqueId` 形式复验。

## Consequences

- 验证：本地 `http.server` 打开 `post.html?id=7323`，iframe 内 SharePoint 播放器正常加载（跨站嵌入放行确认）。
- 后续同类视频按 S-009 操作；长期建议大视频仍走 R2 `<video>`（站内既有惯例），SharePoint 嵌入仅作过渡（国内访问慢、依赖微软登录态）。
- 待办：线上需 `npx wrangler pages deploy` 后生效（本次只改了工作区文件，未部署）。
