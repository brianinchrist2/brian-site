# Coding Conventions
> Source: AGENTS.md + Agent observation | Last updated: 2026-07-23

## CF Pages Functions (JavaScript/ESM)
- ES Modules (`import`/`export`) — not CommonJS
- Export handler: `export async function onRequest{Method}(context)`
- `context` shape: `{ request, env, params, ... }`
- Always use explicit `try/catch` with JSON error response `{ error: message }`
- Always check `env.USERS_KV` binding exists before using it
- Import shared utils from `../../_utils/{auth,jwt}.js`
- Use `env.JWT_SECRET || "fallback"` pattern in dev

## Python Tools
- Use `beautifulsoup4` (bs4) for HTML parsing
- Standard library + `pathlib` for file operations
- Type annotations on all function signatures
- Tests in `tests/` directory using `unittest`

## Static Content
- New blog posts: create `{id}.html` in `brianinchrist/organicchurch/`, add entry to `posts.json`
- Post filenames are numeric IDs (sequential, e.g. `8139.html`)
- All posts include shared `vars.css` + `article.css`
- Posts use CJK content (Chinese primary, some English)
- **Never** rewrite `posts.json` wholesale for single additions

## Git Conventions
- Single branch: `master`
- Commit style: Conventional Commits — `type: description`
  - Types: `feat:`, `fix:`, `chore:`, `test:`, `refactor:`, `docs:`
- No tags, no release workflow yet

## 禁止事项 🚫
- 不要提交 wrangler.toml（含 JWT_SECRET）到公开仓库
- 不要直接在 handler 层写 SQL（走 D1 prepared statements）
- 不要修改 `generated/` 目录下的文件
- 不要整体重写 posts.json
- 不要用 `innerHTML` — 用 `textContent`（XSS 防护）
