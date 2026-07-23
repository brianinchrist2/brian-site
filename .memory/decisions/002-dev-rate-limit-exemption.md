# ADR-002: 本地与测试环境放宽 rateLimit 速率限制

## Status: Accepted (2026-07-23)

## Context
- `signup.js` 和 `signin.js` 默认集成了基于 KV 的 IP 速率限制（如 1小时最多3次）。
- 本地常驻 Wrangler Dev 服务器及 Playwright E2E 测试频繁进行注册/登录，导致 KV 计数累加触发 429 报错。
- 429 报错使得前端交互停滞在 `/login.html`，阻碍自动化 E2E 全流程测试。

## Decision
在 `functions/_utils/rate-limit.js` 中检测当前环境。若 `env.JWT_SECRET` 为本地测试或开发密钥，则自动将限频门槛调高至 10000 次，从而放行本地测试。

## Consequences
- ✅ 解决了 E2E 测试因 429 频控报错阻碍测试流程的问题。
- ✅ 生产环境（使用真实的 Secret）不受影响，继续执行严格频控。

## Related
- Session: 2026-07-23_003
- Files: `functions/_utils/rate-limit.js`
