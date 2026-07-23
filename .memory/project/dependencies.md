# Dependencies & Version Constraints
> Last updated: 2026-07-23

## Runtime Dependencies (Node.js)
| Package | Version | Purpose |
|---------|---------|---------|
| wrangler | ^3 | Cloudflare Pages deployment |
| vitest | ^2 | Test runner |
| playwright | ^1 | E2E testing |

## Python Runtime
| Package | Version | Purpose |
|---------|---------|---------|
| beautifulsoup4 | latest | HTML parsing for migration scripts |

## Cloudflare Bindings
| Binding | Type | Purpose |
|---------|------|---------|
| USERS_KV | KV Namespace | User account storage |
| JWT_SECRET | Secret (env var) | JWT signing |
| D1 Database | D1 Bound | Course-app relational data |

## Version Constraints
- CF Pages Functions run on Workers runtime (ESM only)
- Node.js version determined by CF Pages build environment
- Python 3.x required for migration/asset scripts
- No formatter/linter dependencies (project has none configured)
