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

## P-003: JWT_SECRET 硬编码在 wrangler.toml
- **Date**: 2026-07-23 (ongoing)
- **Symptom**: wrangler.toml 包含明文 JWT_SECRET，提交到公开仓库即泄露
- **Root Cause**: 初始配置将密钥写入了配置文件
- **Fix**: 使用 CF Pages 环境变量 / Secrets 替代
- **Prevention**: wrangler.toml 应入 .gitignore 或使用 `[vars]` + 生产环境 Secrets
