# brianinchrist-site — AGENTS.md

## Project Overview

Christian theology content site — Cloudflare Pages with vanilla HTML/CSS/JS.

- **Live**: `https://organicchurch.dpdns.org`
- **Repo**: `https://github.com/brianinchrist2/brian-site.git` (branch: `master`)
- **CF Pages**: `brianinchrist-site`, output dir = `brianinchrist/`
- **KV namespace**: `USERS_KV` — stores user accounts (`user:{email}` key pattern)

## Directory Ownership

| Path | Purpose |
|------|---------|
| `brianinchrist/` | CF Pages build output **and** static site root. Deployed as-is. |
| `brianinchrist/organicchurch/` | Blog: index (listing), ~250 HTML posts by numeric ID, `posts.json` metadata |
| `brianinchrist/organicchurch/assets/css/` | Design system: `vars.css` (tokens) + `article.css` (post styles) |
| `functions/` | Cloudflare Pages Functions (ES modules, Workers runtime) |
| `functions/_utils/` | Shared libs: `auth.js` (password hashing), `jwt.js` (HS256 JWT) |
| `functions/api/auth/` | Auth endpoints: `signin.js` (POST), `signup.js` (POST) |
| `functions/api/user/` | User endpoints: `profile.js` (GET/POST) |
| `oikos_church/{en,zh}/` | Source content for books (book2) and courseware |
| Root `*.py` | Migration/asset scripts (`migrate_blog.py`, `clean_oversized_assets.py`, etc.) |
| `*scratch_*.mjs` | Ad-hoc Playwright test scripts (not part of build) |

## Architecture

### Deployment
No build step for static content. CF Pages deploys `brianinchrist/` directly via `wrangler pages deploy`. The `functions/` directory is auto-detected by Pages as serverless functions.

### Cloudflare Pages Functions
- ES Modules (`import`/`export`)
- Export handler: `export async function onRequest{Method}(context)`
- `context` shape: `{ request, env, params, ... }`
- `env.USERS_KV` — KV namespace binding
- `env.JWT_SECRET` — JWT signing secret (also in `wrangler.toml [vars]`)

### Auth Flow
- Passwords hashed with SHA-256 + random 16-byte salt
- JWT signed with HMAC-SHA256, 7-day expiry
- Token passed via `Authorization: Bearer <token>` header
- User data stored/retrieved in KV: `user:{email}` → JSON blob

### Design System ("Scriptorium")
Defined in `brianinchrist/organicchurch/assets/css/vars.css`:
- Warm "parchment" palette (`#FAF6EC` bg, `#8A3517` oxblood accent, `#4A6741` olive secondary)
- Serif body (`Noto Serif SC`), sans UI (`Noto Sans SC`), Latin accent (`EB Garamond`)
- Spacing: `--space-{xs,sm,md,lg,xl,xxl}` rhythm system
- Shared by homepage, blog listing, and all posts

## Key Commands

```bash
# Deploy to Cloudflare Pages
npx wrangler pages deploy

# Local dev for static files
python3 -m http.server 8000
# then open http://localhost:8000/brianinchrist/

# Rebuild courseware data (after editing book2 chapters)
python3 Oikos+Koinonia/d7/courseware/tools/build_courseware.py

# Run courseware build tests
python3 -m unittest tests.test_build_courseware -v

# Playwright scratch script (ad-hoc, not CI)
node scratch_test_online.mjs
```

## Development Conventions

### CF Pages Functions
- Always use explicit `try/catch` with JSON error response `{ error: message }`
- Always check `env.USERS_KV` binding exists before using it
- Import shared utils from `../../_utils/{auth,jwt}.js`
- Use `env.JWT_SECRET || "fallback"` pattern in dev (but avoid committing fallback secrets)

### Python Tools
- Use `beautifulsoup4` (bs4) for HTML parsing
- Standard library + `pathlib` for file operations
- Type annotations on all function signatures
- Tests in `tests/` directory using `unittest`

### Static Content
- New blog posts: create `{id}.html` in `posts/`, add entry to `posts.json`
- Post filenames are numeric IDs (sequential, e.g. `8139.html`)
- All posts include the shared `vars.css` + `article.css`
- Posts use CJK content (Chinese primary, some English)
- `posts.json` is ~2523 entries — avoid rewriting the whole file for single additions

### Git Conventions
- Single branch: `master`
- Commit style: `type: description` (Conventional Commits — e.g. `feat:`, `fix:`, `chore:`)
- No tags, no release workflow yet

## Gotchas & Security Notes

- **wrangler.toml** contains a hardcoded `JWT_SECRET` — do not commit this to public repos
- `signin.js` and `profile.js` have fallback JWT secret `"default_jwt_secret_key_change_me_in_prod"` — production should always use `env.JWT_SECRET`
- No formatter config (no `.editorconfig`, `.prettierrc`), no linter — format manually
- `cloudflare-dash.yml` and similar `.yml` files are gitignored (Cloudflare dashboard exports)
- `__pycache__` directories exist — avoid committing them
- Courseware `courseware.json` is generated — edit source HTML then rebuild, don't edit JSON directly

## Behavioral Guidelines

> These guidelines reduce common LLM coding mistakes. They bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: *"Would a senior engineer say this is overcomplicated?"* If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: *Every changed line should trace directly to the user's request.*

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
