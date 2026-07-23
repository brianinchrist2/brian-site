# Architecture Knowledge
> Last verified: 2026-07-23 | Verified by: session 2026-07-23_001

## System Overview

Christian theology content site hosted on Cloudflare Pages. Two major subsystems:
1. **Static content site** — vanilla HTML/CSS/JS, deployed directly from `brianinchrist/`
2. **course-app** — course management system with CF Pages Functions backend

```
                     ┌─────────────────────────┐
                     │   Cloudflare Pages       │
                     │  (brianinchrist-site)    │
                     ├─────────────────────────┤
                     │  Static: brianinchrist/  │
                     │  ├── organicchurch/      │
                     │  │   ├── index.html      │
                     │  │   ├── assets/css/     │
                     │  │   └── {id}.html (250+)│
                     │  └── course-app/         │
                     │                          │
                     │  Serverless: functions/  │
                     │  ├── api/auth/           │
                     │  ├── api/user/           │
                     │  └── _utils/             │
                     │                          │
                     │  KV: USERS_KV            │
                     └─────────────────────────┘
```

## Module Map

| Module | Path | Responsibility |
|--------|------|----------------|
| Static Site | `brianinchrist/organicchurch/` | Blog listing + ~2500 HTML posts |
| Design System | `brianinchrist/organicchurch/assets/css/` | vars.css (tokens) + article.css |
| Auth | `functions/api/auth/` | Sign in/up endpoints |
| User | `functions/api/user/` | Profile GET/POST |
| Auth Utils | `functions/_utils/` | Password hashing, JWT |
| course-app | `course-app/` | Course management UI + logic |
| Blog Content | `oikos_church/{en,zh}/` | Source content for books/courseware |
| Python Scripts | Root `*.py` | Migration, asset cleanup |
| Migrations | `migrations/` | D1 database migrations |
| Tests | `tests/` | Unit + integration tests |

## Data Flow

```
Browser ──HTTP──> CF Pages ──route──> brianinchrist/ (static)
                                └──> functions/api/* (serverless)
                                          │
                                          ▼
                                     USERS_KV (KV store)
                                          │
                                          ▼
                                     D1 Database (course-app)
```

## Key Data Stores
- **USERS_KV** — KV namespace for user accounts (`user:{email}` → JSON blob)
- **D1 Database** — course-app relational data (courses, assignments, submissions, grades)
- **posts.json** — ~2500+ blog post metadata entries

## Tech Stack
- **Hosting**: Cloudflare Pages
- **Runtime**: CF Pages Functions (ES Modules, Workers runtime)
- **Database**: Cloudflare D1 (SQLite-based) + KV (USERS_KV)
- **Auth**: JWT (HMAC-SHA256, 7-day expiry, Bearer token)
- **Password Hashing**: PBKDF2 (upgraded from SHA-256 on 2026-07-23)
- **Frontend**: Vanilla HTML/CSS/JS — no framework
- **Design**: "Scriptorium" system — parchment palette, Noto Serif/Sans SC

## Known Constraints
- CF Pages Functions have limited runtime (CPU time, memory)
- KV has 1KB value size limit per entry (noted for user profiles)
- posts.json is ~2500 entries — avoid full rewrites
- Single branch: `master`
- No formatter/linter config (`.editorconfig`, `.prettierrc`)
