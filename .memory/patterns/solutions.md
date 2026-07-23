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
