# Module Map
> Last updated: 2026-07-23

## Dependency Graph
```
brianinchrist/ (static content)
  ├── organicchurch/     ← 博客（纯静态 HTML）
  ├── course-app/        ← 课程管理（前端页面）
  └── assets/css/        ← 设计系统

functions/ (serverless API)
  ├── api/auth/          ← 依赖 _utils/auth.js, _utils/jwt.js
  ├── api/user/          ← 依赖 _utils/jwt.js
  └── _utils/            ← 无依赖（纯工具函数）

oikos_church/ (source content)
  └── {en,zh}/           ← 构建输入 → brianinchrist/organicchurch/

Root scripts           ← 独立，操作文件系统
```

## Module Boundaries
| Module | Internal | External Dependencies | Test Coverage |
|--------|----------|----------------------|---------------|
| functions/_utils/ | Pure functions | None | ✅ tests/ |
| functions/api/ | Request handlers | _utils/, CF env (KV, D1) | ✅ tests/ + E2E |
| brianinchrist/ (static) | HTML/CSS/JS | None | ❌ manual |
| Python scripts | File ops | bs4 | ❌ manual |
