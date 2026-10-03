# brianinchrist-site — AGENTS.md

## Project Overview

Christian theology content site — Cloudflare Pages with vanilla HTML/CSS/JS.

- **Live**: `https://jiadongli.online`（主域名，2026-08-06 确认；`organicchurch.dpdns.org` 为旧域名，指向同一部署）
- **Repo**: `https://github.com/brianinchrist2/brian-site.git` (branch: `main`)
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
| `oikos_lectures_tools/` | 四讲讲义幻灯片的构建工具（`src/` 模板 + `figs.py` + `build.py` + `check.cjs`）。**刻意放在 `brianinchrist/` 之外**——那不是发布内容，不该被当静态资源上传 |
| `drafts/oikos_lectures/` | 讲义配图流水线（设计提示词、`image_plan.json`、`gen_images.py`、`apply_plan.py`、`backup/`、`usage_summary.json`）。同样不进发布树 |
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
- Single branch: `main`
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

## 写作风格指南（Writing Style）

书稿与长文内容（`lordship_gospel/manuscript/` 等）的写作风格，主要模仿 **N. T. Wright** 与 **John Stott**：语言自然、幽默、平易近人，同时保持学术素养，内容充实、丰富。

### 核心理念

像一位博学的师长在炉边与人深谈——论证严谨，但不端着；内容充实，但不卖弄。读者应当感到被尊重、被引导，而不是被说教。

### 两位范式的各自长处

- **Wright（叙事与历史想象力）**：用场景、故事和"你可能会问……"式的直接对话推进论证；将读者带入第一世纪的历史现场（如第六章的罗马帝国语境），让神学活在具体处境里。
- **Stott（清晰与牧养温度）**：结构清晰、逻辑平稳，温和的牧者口吻；论证严整却不冷硬，每一章都让读者感到"他在为我着想"。

### 正面要求

1. **对读者说话，而非对纸面说话**：用真实的疑问句、口语化的连接推进论述，允许"你可能会问""请想一想"这类直接呼语。
2. **适度幽默与温度**：在合适处轻轻幽默（Wright 式），在严肃处保持庄重（Stott 式），让人愿意读下去。
3. **论证饱满**：每个观点都要有"经文依据 + 历史/文化语境 + 生活例证 + 实际应用"的完整支撑。宁可写长一段，不写空一句。
4. **学术素养内化为血肉**：历史考据、希腊文词义、学者观点（如 Bauckham、Hurtado、Wright）要成为论证的一部分，引用准确、出处清楚；但不炫耀术语、不堆砌脚注。
5. **圣经引用必须核对和合本原文**，标注出处（如"（马太福音 7:21-23 和合本）"），不可凭记忆转写。

### 反面禁令

1. **禁止大纲式写作**：正文不得写成要点罗列。结构性小标题可以用，但每个标题下必须有完整的段落论述；列表只能作为修辞工具，不能替代论证。
2. **剔除 AI 写作弊病**：
   - 禁模板化开头："在当今时代""随着……的发展""众所周知"
   - 禁空洞过渡句："值得注意的是""总而言之""不难发现"
   - 禁句式排比堆砌（AI 味最浓的"不是……而是……"连续排比）
   - 禁同义词叠床架屋："至关重要、举足轻重、不可或缺"三连
   - 禁段末空泛回收：没有新信息量的"这提醒我们……"式总结
   - 禁为强调而强调：滥用**加粗**、滥用感叹号
   - 禁中英夹杂八股："not only……but also……"翻译腔
3. **不留"AI 痕迹"的段落骨架**：一段若删去后读者毫无损失，就是空段，重写。

### 示例

- **AI 味（反面）**："在当今时代，基督徒面临着诸多挑战。值得注意的是，效忠并非简单的口头宣告。总而言之，我们需要在生活中践行信仰。"
- **Wright/Stott 风（正面）**："假如你住在公元 50 年的帖撒罗尼迦，忽然听见一群人高喊'另有一个王耶稣'，你会怎么想？……"

## OMO Model Allocation

OMO 类别 → 模型 ID 映射，用于 `task()` 派发时的模型路由。

### 模型池

| 层级 | 模型 ID | 用途 |
|------|---------|------|
| **High** | `coding-plan/glm-5.2` | 最高推理 —— 架构、纯逻辑、审查、规划 |
| **Medium** | `opencode-go/qwen3.7-plus` | 中等推理 —— UI/设计、写作、高努力综合 |
| **Low** | `opencode-go/deepseek-v4-flash` | 轻量 —— 编排、检索、简单修改 |

### 类别 → 模型映射

| 目标 | 模型 | 理由 |
|------|------|------|
| **Sisyphus**（编排器） | `opencode-go/deepseek-v4-flash` | 只做路由/派发，不写实现代码 |
| `ultrabrain` | `coding-plan/glm-5.2` | 纯逻辑密集型 —— 表设计、评分引擎、并发策略 |
| `deep` | `coding-plan/glm-5.2` | 端到端解决"毛刺问题"，含研究和实现决策 |
| `artistry` | `coding-plan/glm-5.2` | 非常规复杂问题，需跳出框架的推理 |
| `oracle` | `coding-plan/glm-5.2` | 读只架构咨询、硬调试 |
| `metis` | `coding-plan/glm-5.2` | 预规划，模糊需求澄清、隐藏意图挖掘 |
| `momus` | `coding-plan/glm-5.2` | 计划审查、质量闸门 |
| `visual-engineering` | `opencode-go/qwen3.7-plus` | 前端/UI/设计，qwen 多模态支持视觉 |
| `unspecified-high` | `opencode-go/qwen3.7-plus` | 高努力非标任务 |
| `writing` | `opencode-go/qwen3.7-plus` | 文档/散文，需表达质量 |
| `quick` | `opencode-go/deepseek-v4-flash` | typofix、配置改值 |
| `unspecified-low` | `opencode-go/deepseek-v4-flash` | 低努力非标任务 |
| `explore` | `opencode-go/deepseek-v4-flash` | 代码库 grep，纯检索不推理 |
| `librarian` | `opencode-go/deepseek-v4-flash` | 外部文档搜索，检索+摘要 |

### 路由规则

1. **schema 先行** —— 每个 Phase 先派 `ultrabrain`(High) 设计表，确认后再派 API/UI
2. **API + UI 可并行** —— schema 就绪后 `deep`(High) 和 `visual-engineering`(Medium) 同时派发
3. **oracle 闸门** —— 关键 schema 或算法完成时，咨询 `oracle`(High) 确认正确性
4. **momus 闸门** —— 每个 Phase 合并前，经 `momus`(High) 审查完整性

---

## Memory System

本项目使用 `.memory/` 目录进行持久化记忆管理，实现跨会话的知识连续性。

### 目录结构

```
.memory/
├── INDEX.md                    # L0 - 全局索引（每次会话必读）
├── config.yaml                 # 记忆系统配置
├── sessions/                   # L1 - 会话记忆（_active.md + 历史记录）
├── project/                    # L2 - 项目知识（架构/约定/依赖/术语）
├── decisions/                  # L3 - 决策记录（ADR）
├── tasks/                      # L4 - 任务追踪（待办/进行中/完成）
├── patterns/                   # L5 - 模式与经验（方案/踩坑）
├── entities/                   # L6 - 实体地图（文件/模块）
└── archive/                    # 冷存储归档
```

### 会话启动时
1. **必须**先读取 `.memory/INDEX.md` 获取项目全貌
2. 如存在 `.memory/sessions/_active.md`，优先恢复未完成任务
3. 根据用户意图按需加载对应层（架构→project/、决策→decisions/、定位→entities/）

### 工作过程中
- 做出任何架构/技术决策 → 写入 `.memory/decisions/`
- 发现坑或验证了方案 → 写入 `.memory/patterns/`
- 修改了关键文件 → 更新 `.memory/entities/files.md`
- 每完成一个步骤 → 更新 `.memory/sessions/_active.md`

### 会话结束时
- 总结写入 session 历史文件（`sessions/YYYY-MM-DD_id.md`）
- 更新 INDEX.md 的 Current Focus 和 Quick Context
- 未完成任务写入 tasks/_in-progress.md
- 检测过期文件 → 更新 Staleness Warnings

### 禁止事项
- 🚫 不要删除 .memory/ 下的任何文件（只能归档）
- 🚫 不要在 INDEX.md 中写入超过 200 行
- 🚫 不要跳过决策记录直接做重大变更