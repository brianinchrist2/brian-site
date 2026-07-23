# ADR-001: PBKDF2 替代 SHA-256 密码哈希

## Status: Accepted (2026-07-23)

## Context
- 原密码哈希使用 SHA-256 + random 16-byte salt
- SHA-256 是快速哈希，易受 GPU 暴力破解攻击
- 需要兼容现有用户：登录时检测旧哈希并自动升级

## Decision
采用 PBKDF2（基于密码的密钥派生函数）替代 SHA-256。
- 使用 crypto.pbkdf2Sync() （Node.js 内置）
- 迭代次数：100000
- 密钥长度：64 bytes
- salt：随机 16 bytes（沿用原方案）
- 登录时检测哈希格式，旧哈希自动重哈希并写回 KV

## Consequences
- ✅ 大幅增加暴力破解成本
- ✅ Node.js 内置，无新增依赖
- ✅ 向后兼容（自动升级）
- ⚠️ 登录路径增加 ~5ms 计算时间（可接受）

## Related
- Commit: d7b70ae
- Session: 2026-07-23_001

## Files Changed
- `functions/_utils/auth.js` — 新增 pbkdf2Hash()/verifyPbkdf2()
- `functions/api/auth/signin.js` — 登录时检测旧哈希并升级
