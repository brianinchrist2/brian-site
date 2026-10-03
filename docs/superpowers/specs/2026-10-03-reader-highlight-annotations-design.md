# 设计文档：阅读器正文高亮 + 笔记（登录用户 · 跨设备同步）

> 日期：2026-10-03
> 来源：用户需求（登录后选中正文 → 多色高亮 → 对高亮/位置写笔记 → 服务端持久化跨设备同步；未登录给登录引导且本地草稿不丢）
> 决策（建议，待批准）：后端落点 = **方案 A′**（博客项目同域挂载 Functions + `_routes.json` 白名单 + 共享 D1）；锚定 = **块级定位 + 块内偏移 + quote/prefix/suffix + 所属 heading，五级降级恢复**；新表 `reader_annotations`，不复用 `highlights`
> 状态：**Proposed（待用户评审）**——未改动任何业务代码
> 关联：ADR-007（MD 阅读器）、`2026-08-06-reader-courseware-login-design.md`（课件登录 + 笔记）、`2026-07-16-online-course-system-design.md` §2.4（博客/课程系统分离）

---

## 0. 结论摘要（TL;DR）

1. **前置阻塞（P0，必须先解决）**：生产博客站 `jiadongli.online` **没有任何 Pages Functions**，所有 `/api/*` 请求落到 SPA 兜底首页（GET → 200 HTML，POST → 405）。根因已在源码层面坐实：wrangler 只从**当前工作目录**下的 `functions/` 编译 Functions，而现行博客部署脚本 `drafts/oikos_lectures/deploy_site.sh` 在 `/tmp/cfdeploy` 里执行（该目录没有 `functions/`）。所以已上线的"课件登录 + 课件笔记"在生产上同样不可用。高亮笔记功能离不开这一层，必须先把生产 API 恢复。
2. **推荐后端落点 A′**：给 `brianinchrist-site` 绑定**同一个** D1（`brianinchrist-db`）和 KV（`USERS_KV`），用**独立的** `JWT_SECRET`，在 `brianinchrist/_routes.json` 中只放行阅读器需要的 5 组路由，并换用一个受版本管理、部署后自检的部署脚本。这样同源调用，无需 CORS，现有 `reader-auth.js` 一行不改，课件笔记也随之恢复。方案 B（跨域打到 courses）列为备选：今天 courses 的 CORS 预检返回 **405**，而且 `learn.organicchurch.dpdns.org` 的 TLS 握手失败，都已实测。
3. **锚定**：不用裸字符 offset。锚点 = `{块序号+块内规范化偏移}` + 全章偏移 + `quote` + 32 字 `prefix/suffix` + 所属 heading（aid/文本/层级）+ 章节指纹 `rev`。恢复分五级：L1 精确 → L2 同名小节内查 quote → L3 全章查 quote → L4 首尾模糊（需用户确认）→ L5 孤儿（不渲染、不删数据）。我用**真实改稿**（commit `177dd41` 的 3 个文件，加上工作区未提交的第十章修订）离线仿真了 2400 个高亮：**97.1% 正确恢复，错位 0 例，69 例孤儿全部对应确实被改写的原文**；同样场景下裸字符 offset 只有 **30.8%** 仍指向原文。
4. **数据模型**：新建 `reader_annotations` 表（迁移 `016`）。主键用客户端生成的 UUID，保证离线创建和幂等重试；软删除墓碑 `deleted_at` 防止离线队列把已删数据"复活"；时间戳一律 ISO 8601。不复用 `highlights`：它的 `item_id` 硬 FK 指向 `course_items`，要改就得重建表。
5. **API**：`GET /api/reader/annotations?book=&chapter=`、`PUT /api/reader/annotations/:id`（幂等 upsert）、`DELETE /api/reader/annotations/:id`（软删）。风格对齐 `functions/api/courseware/notes.js` 与 `profile.js`。
6. **前端**：新增经典脚本 `reader-annotations.js`（暴露 `window.ReaderAnnotations`，与 `reader-auth.js` 同模式）。`reader.js` 只加 3 处挂接，`reader.html` 加 1 个按钮和 1 个 `<script>`，`reader-auth.js` 加一个 `onLogin` 事件。渲染**幂等**：每次先拆掉全部 `mark.rdr-hl` 再 `normalize()`，然后整体重画。
7. **分期**：P0 恢复生产 API → P1 后端 → P2 高亮 → P3 笔记、面板与离线 → P4 漂移恢复与自愈 → P5 打磨（复制/打印/移动端/对比度）。每期都有可判定的验收标准。

---

## 1. 系统分析

### 1.1 部署结构（已读源码与配置核实）

| 项目 | 配置文件 | `name` | 输出目录 | 绑定 | 线上 | Functions |
|---|---|---|---|---|---|---|
| 博客 | `wrangler-blog.toml` | `brianinchrist-site` | `brianinchrist/` | 无（文件注释："Pure static site — no D1, no KV, no Functions bindings"） | `https://jiadongli.online`（旧域 `organicchurch.dpdns.org` 同部署） | **无**（见 1.2） |
| 课程 | `wrangler.toml` | `brianinchrist-courses` | `course-app/` | D1 `DB`→`brianinchrist-db`；KV `USERS_KV`；`JWT_SECRET` 为 Pages secret | `https://brianinchrist-courses.pages.dev` | 有：`functions/` 全量 |

**wrangler 行为（读本机 wrangler 4.123.0 源码 `wrangler-dist/cli.js` 核实）：**

- `pages deploy` 若带 `--config` 会直接报错 `Pages does not support custom paths for the Wrangler configuration file`（cli.js:371673）。这与 `.memory` S-006 的记录一致。
- Functions 目录 = `customFunctionsDirectory || path.join(process.cwd(), "functions")`（370549 行）。也就是说，**只认当前工作目录下的 `functions/`**。
- 若 `<部署目录>/_routes.json` 存在，就用它代替自动生成的路由（370503、370550 行）。
- 项目名优先级：`args.projectName ?? config.name ?? cache`（371710 行）。即使指定了 `--project-name`，wrangler 仍会读取 cwd 下的 `wrangler.toml`，并上传其 hash 与 `pages_build_output_dir`（370632–370640 行）。
- `pages_build_output_dir` 按配置文件所在目录 `path.resolve`，因此绝对路径同样可用（`normalizeAndValidatePagesBuildOutputDir`）。

**实际部署方式：**

- `.memory` S-006（2026-08-05）记录的博客部署命令是：在仓库根执行 `npx wrangler pages deploy brianinchrist --project-name brianinchrist-site`。按上面的源码，这条命令**会**把仓库根的 `functions/` 一并打包。
- `drafts/oikos_lectures/deploy_site.sh`（未入库，`drafts/` 整体未跟踪）先 `cd /tmp/cfdeploy`，再 `npx wrangler pages deploy /Users/brianw/projects/brian-site/brianinchrist --project-name=brianinchrist-site --branch=main --commit-dirty=true`。`/tmp/cfdeploy` 目录里只有一个 `wrangler.toml`（内容只有 `name = "brianinchrist-site"`，没有 `pages_build_output_dir`，因此被 wrangler 忽略）和 `.wrangler/`，**没有 `functions/`**。该目录的创建时间是 2026-10-02 09:51。
- 线上 `reader.js` / `reader-auth.js` / `reader.css` 的 md5 与工作区文件**完全一致**（2026-10-03 实测）。这说明最近一次部署用的就是工作区（含未提交的 `aidFor`/`extras` 改动），很可能就是 `deploy_site.sh` 那次。

### 1.2 前置问题：静态站无 Functions ⇒ 登录与笔记 API 生产不可用

**实测（2026-10-03，curl）：**

| 请求 | 结果 |
|---|---|
| `GET https://jiadongli.online/api/health` | `200 text/html`，内容是首页 HTML |
| `GET https://brianinchrist-courses.pages.dev/api/health` | `200 application/json` `{"status":"ok",...,"db":"connected","kv":"connected"}` |
| `OPTIONS https://brianinchrist-courses.pages.dev/api/courseware/notes`（Origin=jiadongli.online，PUT + authorization 预检） | **405**，空体（没有 `onRequestOptions`，CORS 预检必失败） |
| `https://learn.organicchurch.dpdns.org/api/health` | curl exit 35（TLS 握手失败，该域名未就绪） |
| 用户已测：`POST https://jiadongli.online/api/auth/signin` | 405 空体 |

**因果链：**

1. 部署时 cwd 下没有 `functions/`，所以博客项目没有 Functions。`/api/*` 不匹配任何静态文件，按 `.memory` 记录的 SPA fallback 返回首页（仓库没有顶层 `404.html`）。
2. `reader-auth.js:16-24` 的 `getProfile()` 收到 `200 text/html`：`res.ok === true`，`res.json()` 抛错后被 catch 吞掉，返回 `null`，页面表现为"未登录"。它**不会**清 token，因为只有非 2xx 时才清。
3. `reader-auth.js:26-37` 的 `signIn()` 收到 405 空体：`res.json()` 失败，`data = {}`，于是抛出 `Error('登录失败')`。用户看到的是"登录失败"，而不是"服务不可用"。
4. 结果是课件锁屏永远解不开，课件笔记 PUT 永远不发（2026-08-06 spec 写"博客域已验证可用"，当时大概率是从仓库根部署、带上了 Functions。⚠ 待核实：需要在 CF 控制台查看 `brianinchrist-site` 的部署历史确认时间线；本机 wrangler 未登录，我也**没有**去动另一项目 `.env` 里的 token）。

**结论**：高亮笔记的任何后端工作都要以 P0（恢复生产 API）为前提。P0 本身还能顺带修好已上线却失效的课件登录和课件笔记。

### 1.3 阅读器现状调用链（`reader.html` 142 行 / `reader.js` 955 行 / `reader-auth.js` 180 行 / `reader.css` 1661 行）

```
reader.html:138-140  <script> reader-auth.js → marked.min.js(v12.0.2) → reader.js
reader.js:912 init()
  ├─ applySettings() / renderAuthRow()(:427，齿轮里的登录/登出行) / wireStaticUi() / initLayout()
  ├─ state.bookId = ?book= ; fetchManifest() → <book>/manifest.json
  ├─ renderToc(null) / updateNav() / updateCourseware(null) / initCoursewarePanel()
  └─ ?ch= 命中 → renderChapter()(:168)；否则 renderCover()(:941)
renderChapter()
  ├─ fetch(<book>/<ch.file>) → splitMarkdown()（拆首行 "# 标题"）→ marked.parse()
  ├─ #rdr-content.innerHTML = <h1.rdr-chapter-title> + <div.rdr-chapter-body>…</div>   (:180-182)
  ├─ renderToc / showCoursewareFor(ch.cw) / localStorage.reader_last_page = location.href
  ├─ decorateHeadings()(:186)：.rdr-chapter-body h2/h3/h4 无 id 者设 id = aidFor(textContent, i+1)
  └─ setTimeout 0：jumpToHash() 失败才恢复 book_pos_<book>_<ch>；再在 160ms / 420ms 各补一次 jumpToHash
jumpToHash()(:125)：findAnchor(hash) 在 '.rdr-chapter-body [id]' 里找 → 滚 #rdr-main → 加 .rdr-anchor-hit（2.2s）
hashchange(:406) → jumpToHash()
keydown(:409-423)：←/→ 翻章；输入框、设置面板打开、窄屏抽屉展开时忽略
```

关键事实：

- **滚动容器是 `#rdr-main`**，不是 body。浮层定位、滚动到高亮都要基于 `#rdr-main` 计算。
- **翻章是整页跳转**（`window.location.href = href`），每章都是一次全新 `init()`，不存在 SPA 内的章节切换残留。
- marked v12 **不生成 heading id**（已用仓库内的 `marked.min.js` 渲染 3 章确认，`id=` 出现 0 次），所以 `decorateHeadings` 会给所有 h2–h4 赋 aid。
- 层级（`reader.css`）：进度条 60、设置弹层 45、顶栏 40、窄屏抽屉 32 / scrim 31、回到顶部 26、分隔条 15、布局 10；`reader-auth.js` 的登录弹窗 9999。
- 主题：`html[data-theme=light|sepia|dark|olive]` 四套 token（`reader.css:55-165`），`::selection` 用 `--rdr-mark`（:176）。**没有 `@media print`**。

### 1.4 既有登录与课件笔记链路，以及顺带发现的缺陷

- 后端：`functions/api/courseware/notes.js`（GET/PUT；`verifyAuth` → `payload.sub`；`ON CONFLICT(...) DO UPDATE` 幂等 upsert；`MAX_CONTENT=20000`；**无限流**）、迁移 `015-courseware-notes.sql`。
- 前端：`reader.js:739 renderCourseware()`。未登录时显示锁屏，已登录时 `GET` 预填，`change` 后防抖 600ms 再 `PUT`；草稿 key 为 `cw_draft_<userId>_<chapter>_<type>_<index>`。
- **既有缺陷（不在本需求范围，按 AGENTS.md 只记录不擅改，建议在 P0 一并修，需用户确认）：**
  1. `reader.js:824` 调用了 `loadDraft(...)`，但全文**没有定义 `loadDraft`**（grep 仅此一处）。只要课件笔记 GET 失败就会走 `.catch(fillDraft)`，进而抛 `ReferenceError`。
  2. `reader.js:818` 起，`AUTH.getProfile()` 解析出来的是 `{ success, user: {...} }`，而代码按 `user.id` 取值，结果是 `undefined`。于是草稿 key 实际是 `cw_draft_undefined_…`：**同一浏览器上不同账号共享草稿**，存在串号隐患。对比 `renderAuthRow` 用的是 `user.user.nickname`，取法正确。
- `signup.js` 新用户角色硬编码为 `'["student"]'`：在博客阅读器注册的读者会以 student 身份出现在课程系统里（产品层面需知悉，见 §8）。

### 1.5 书稿内容特征（直接决定锚定设计）

| 事实（2026-10-03 统计） | 对锚定的影响 |
|---|---|
| 三本书：`oikos_church` 23 章、`oikos_church_en` 24 章、`lordship_gospel` 19 章；manifest 章节 id 唯一（`'00'…'18'`、`preface`、`guide` 等） | `(book_id, chapter_id)` 可作主键域；`book_id` = `?book=` 目录名 |
| `lordship_gospel/讨论课件.md`：正文内含 **17 个 `h1`**、19 张表格（td/th 196 个）、loose list 的 **`li>p` 122 处** | 块集合必须包含 `h1`、`td/th`；必须用"最近叶子块"规则处理 `li>p` 嵌套 |
| `oikos_church_en/guide.md`：14 万字符；段内软换行 62 处（`<p>` 内含 `\n`） | 必须做空白规范化，否则改换行就会让锚点失配 |
| 书稿无原始 HTML、无脚注、无代码块、无图片 | 块类型有限，规则可以保持简单 |
| 书稿在持续修订：`177dd41`（2026-09-02）改了第八章、第十章和讨论课件；工作区里第十章还有未提交修订 | 锚点漂移是**常态**，不是边缘情况 |

### 1.6 约束

- 纯 vanilla JS，**无前端构建**；`brianinchrist/` 原样部署。
- `reader.html/js/css` 由三本书共用；任何改动都要回归 `oikos_church`、`oikos_church_en`、`lordship_gospel`。
- **不得改变 `aidFor()` 与 `drafts/oikos_lectures/build_anchors.py: aid_for()` 的一致性**（大纲、思维导图的深链 `#h<i>-<文本>` 依赖它）。
- AGENTS.md：最小改动、不做无谓抽象、每处改动可追溯到需求；CF Functions 统一 `try/catch` + `{ error }` JSON。
- 基线状态：线上阅读器 = 工作区（包含未提交的 `aidFor`/`extras`/`manifest` 改动）。**P0 前应先把这批已上线的改动提交为基线**，否则后续 diff 无法审阅。

---

## 2. 后端落点：方案对比与推荐

### 2.1 方案 A：给 `brianinchrist-site` 挂 D1 + Functions（同域）

博客项目绑定同一个 D1 和 KV，部署时带上 `functions/`，阅读器继续用相对路径 `/api/*`。

- 优点：同源，无 CORS、无预检，`reader-auth.js` 与课件笔记代码零改动即恢复；部署后 `jiadongli.online` 和 `organicchurch.dpdns.org` 两个域名都生效（同一项目）。
- 缺点：推翻了 2026-07-16 §2.4"博客不绑 D1/JWT_SECRET"的分离决策；`functions/` 要部署到两个项目，存在版本漂移；博客内容发布很频繁，每次都会顺带部署 Functions，一旦工作区里有未提交的后端改动就会被带上线；若不加限制，课程系统的全部 API（含 `admin/migrate-users`）都会暴露在博客域上。

### 2.2 方案 B：阅读器留在博客，API 跨域打到 `brianinchrist-courses`

- 需要做的事：
  1. 在 courses 的 Functions 加 `functions/api/_middleware.js`：按 Origin 白名单（`https://jiadongli.online`、`https://organicchurch.dpdns.org`、本地开发源）回 `Access-Control-Allow-Origin/Methods/Headers`、`Vary: Origin`，`OPTIONS` 直接 204，`Access-Control-Max-Age` 设 7200。
  2. `reader-auth.js` 的 3 处 fetch、`reader.js` 的 2 处 `/api/courseware/notes`，以及新模块，全部改为 `API_BASE + path`，`API_BASE` 由 `reader.html` 的 `<meta name="rdr-api-base">` 注入。
  3. 选定稳定的 API 域名：`brianinchrist-courses.pages.dev` 今天可用；`learn.organicchurch.dpdns.org` TLS 失败（实测）；如改用 `learn.jiadongli.online` 等新子域，需要配 DNS（⚠ 待核实 jiadongli.online 的 DNS 托管方）。
- Token：Bearer 头 + `localStorage`（按 origin 隔离），不涉及第三方 cookie，CSRF 不适用。
- 优点：博客保持纯静态，Functions 只有一份部署。
- 缺点：带 `Authorization` 的 GET/PUT/DELETE 都会触发预检，多 1 个 RTT（缓存后摊薄；Chrome 上 Max-Age 封顶 2h）；中间件作用于全部课程 API，会动到课程系统；生产代码里写死 `*.pages.dev` 或依赖一个尚未就绪的域名；博客域上的 `/api/*` 仍会返回 200 HTML，这个坑依旧存在。

### 2.3 方案 C：同源反向代理（博客侧 Pages Function 或 Worker Route → courses）

- C1：在博客项目只部署一个 `functions/api/[[path]].js`，转发到 courses。但仍需在博客项目部署 Functions（而且是另一套 `functions/` 目录），复杂度不低于 A。转发后课程侧看到的 `CF-Connecting-IP` 很可能是 Worker 的出口 IP（⚠ 待核实），`signin` 的"每 IP 5 次/15 分钟"限流会把所有读者算进同一个桶，造成**全站登录被锁**。规避办法是改造 `signin.js` 信任带共享密钥的 `X-Forwarded-For`，代价扩散到认证核心。
- C2：`jiadongli.online/api/*` 配 Worker Route。前提是 zone 托管在 Cloudflare（⚠ 待核实），而且这会多出第三个部署单元，代码还得复制一份。
- 结论：C 两种都比 A 更复杂，也没有换来真实收益，**否决**。

### 2.4 对比

| 维度 | A：同域挂 Functions | **A′：A + 白名单 + 独立密钥 + 受控部署（推荐）** | B：跨域打 courses | C：同源代理 |
|---|---|---|---|---|
| 浏览器视角 | 同源 | 同源 | 跨源 + 预检 | 同源 |
| 现有课件登录/笔记恢复 | 零前端改动 | 零前端改动 | 需改 5 处 fetch + 注入 API_BASE | 零前端改动 |
| 课程系统受影响 | 无 | 无 | 需加全局 CORS 中间件 | 需改 signin 限流信任链 |
| 博客持有 DB/密钥 | 是 | 是（路由白名单收窄暴露面；JWT 密钥独立） | 否 | 否（但持有代理 Functions） |
| 暴露的 API 面（博客域） | 全部 `/api/*` | 仅 5 组白名单 | 无（全部在 courses 域） | 视代理规则 |
| 部署耦合 | `functions/` 双部署 | 同左，加脏树守卫和部署后自检 | 单份 | 双份代码 |
| 依赖未就绪资源 | 无 | 无 | 稳定 API 域名 | zone 托管 / IP 头 |
| 回滚 | Pages 一键回滚 | 同左，数据在 D1 不受影响 | 回滚两处 | 回滚两处 |

### 2.5 推荐：方案 A′，以及它与"系统分离"决策的关系

2026-07-16 §2.4 让博客"不绑 D1/JWT_SECRET"，理由是"博客是纯静态内容，不需要 D1、Functions 或认证"。这个前提在 2026-08-06（阅读器课件登录 + 笔记同步）时就已不成立，本需求进一步需要认证与持久化。A′ 在保留分离精神的同时满足新需求，做法如下：

- **暴露面最小**：`_routes.json` 只把 `/api/health`、`/api/auth/*`、`/api/user/*`、`/api/courseware/*`、`/api/reader/*` 路由给 Functions。课程模块与 `admin` 路由在博客域不可达，仍按静态资源处理（返回 SPA HTML）。
- **密钥隔离**：博客项目单独设置 `JWT_SECRET`，与 courses 不同值。两域 token 互不可用（`localStorage` 本就按 origin 隔离，共用密钥没有收益），任一项目密钥泄露的影响也被限制在本域。
- **账号共用**：同一张 `users` 表。读者用课程系统的账号就能登录阅读器，反之亦然。
- **部署可控**：一个入库的部署脚本（§2.6-5），先守卫 `functions/`、`migrations/` 有无未提交改动，部署后再自检 `/api/health` 必须返回 JSON。这个脚本同时根治"换个目录部署就把 API 弄丢"的问题（P0 根因）。
- **独立回滚**：Pages 部署可单独回滚，数据在共享 D1，不随部署丢失。

需新增 **ADR-011**，把这次"重新审视系统分离"记录下来（本次已在 `.memory/decisions/011-*.md` 记为 Proposed）。

### 2.6 A′ 实施步骤（可直接执行；凡需外部凭据的步骤由用户执行）

**1. 绑定配置**：`wrangler-blog.toml` 改为真源（仍由脚本复制使用，因为 Pages 不支持 `--config`）：

```toml
#:schema node_modules/wrangler/config-schema.json
# 博客站点 brianinchrist-site：静态内容 + 阅读器所需的最小 API（由 brianinchrist/_routes.json 白名单限定）
# Pages 不支持 --config：本文件由 scripts/deploy-blog.sh 复制为临时目录中的 wrangler.toml 使用
name = "brianinchrist-site"
pages_build_output_dir = "brianinchrist"
compatibility_date = "2026-06-24"          # 与 wrangler.toml（courses）一致，保证两边 Functions 运行时语义相同

[[kv_namespaces]]
binding = "USERS_KV"                        # rateLimit 与 /api/health 依赖；与 courses 共用同一 namespace
id = "b8ae6043b8784ce59fdbd602e4c2da0c"

[[d1_databases]]
binding = "DB"
database_name = "brianinchrist-db"          # 与 courses 共用：同一 users 表 = 同一账号体系
database_id = "0d035c3d-d7f0-47ad-b733-c4cacab516f2"

# JWT_SECRET：npx wrangler pages secret put JWT_SECRET --project-name brianinchrist-site（与 courses 使用不同值）
```

> ⚠ 待核实：Pages 项目一旦用带 `pages_build_output_dir` 的配置文件部署，控制台里的绑定会变为"由配置文件管理"（只读）。这是预期行为，请知悉。

**2. 路由白名单**：新增 `brianinchrist/_routes.json`

```json
{
  "version": 1,
  "include": ["/api/health", "/api/auth/*", "/api/user/*", "/api/courseware/*", "/api/reader/*"],
  "exclude": []
}
```

> ⚠ 待核实：`/api/reader/*` 能否匹配多段路径 `/api/reader/annotations/<id>`（按 CF 文档 `*` 可跨段匹配）。P0/P1 的验收用 curl 实测。

**3. 密钥**：`npx wrangler pages secret put JWT_SECRET --project-name brianinchrist-site`（新值；生产**不设** `ENVIRONMENT=dev`，否则限流会被放宽到 10000）。

**4. D1 迁移**（P1；是增量建表，对 courses 无影响；先备份）：

```bash
bash scripts/backup-d1.sh                                              # 现有脚本：逐表导出 JSON 到 backups/<ts>/
npx wrangler d1 execute brianinchrist-db --local  --file=migrations/016-reader-annotations.sql
npx wrangler d1 execute brianinchrist-db --remote --file=migrations/016-reader-annotations.sql
npx wrangler d1 execute brianinchrist-db --remote --command="SELECT name FROM sqlite_master WHERE name='reader_annotations';"
```

**5. 部署脚本**：新增并入库 `scripts/deploy-blog.sh`，取代未入库的 `drafts/oikos_lectures/deploy_site.sh`（凭据沿用现有方式，由用户环境变量提供，脚本不读其它项目的 `.env`）：

```bash
#!/bin/bash
# 部署 brianinchrist/ + Functions → Pages 项目 brianinchrist-site（同域 API，见 ADR-011）
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/cfdeploy-blog"
# 守卫：不把未提交的后端改动随内容发布带上线
if [ -n "$(git -C "$REPO" status --porcelain -- functions migrations wrangler-blog.toml brianinchrist/_routes.json)" ]; then
  echo "functions/ migrations/ 或部署配置有未提交改动，拒绝部署"; exit 1
fi
rm -rf "$WORK" && mkdir -p "$WORK"
sed "s#^pages_build_output_dir *=.*#pages_build_output_dir = \"$REPO/brianinchrist\"#" "$REPO/wrangler-blog.toml" > "$WORK/wrangler.toml"
cp -R "$REPO/functions" "$WORK/functions"          # wrangler 只认 cwd/functions（cli.js:370549）
cd "$WORK"
npx wrangler pages deploy --branch=main --commit-dirty=true
# 自检：API 必须返回 JSON 且 ok——这正是 P0 事故的检测点
curl -fsS https://jiadongli.online/api/health | grep -q '"status":"ok"' || { echo "❌ /api/health 不是 ok JSON"; exit 1; }
```

**6. DNS**：A′ **不需要任何 DNS 变更**（`jiadongli.online` 与 `organicchurch.dpdns.org` 已指向该项目）。

**7. 验证与回滚**：见 §7 P0 的验收清单。回滚可在 CF 控制台 Pages → Deployments 回到上一版，或重新跑旧脚本部署纯静态版本；数据在 D1，不受影响。

**8. 课程项目**：无需改动。下次课程发布时 `functions/` 里会多出 `api/reader/*` 端点，无害；课程域上没有调用方。

### 2.7 账号体系、token 与 CORS（A′）

- 账号：共用 D1 `users`；`signin/signup/profile` 原样复用。
- token：`localStorage.auth_token`（`reader-auth.js` 现状），7 天过期，`Authorization: Bearer`。由于同源，**不需要 CORS**，也不引入 cookie。
- 401 处理：新模块遇到 401 时**保留待同步队列**，提示重新登录，登录成功后再 flush（§6.9）。
- 非 JSON 响应（白名单外路由，或部署再次丢失 Functions）：新模块按"服务暂不可用"处理，**不**当作未登录，也不清空任何本地数据。

### 2.8 若最终选 B：落地清单（备选）

1. 新增 `functions/api/_middleware.js`（CORS 白名单 + OPTIONS 204 + `Vary: Origin`），并补 vitest：允许源有头、非允许源无头、OPTIONS 204、非 OPTIONS 透传 `context.next()`。
2. `reader.html` 增加 `<meta name="rdr-api-base" content="https://brianinchrist-courses.pages.dev">`；`reader-auth.js` 增加 `apiUrl(path)`，替换 3 处 fetch；`reader.js` 替换 2 处 notes fetch；新模块统一用 `apiUrl`。
3. 部署 courses；用 curl 验证预检返回 204，且带有 `Access-Control-Allow-Origin: https://jiadongli.online`。
4. 风险：§2.2 所列。另外本地开发需要跨端口联调（8000 → 8788）。

---

## 3. 高亮锚定方案（技术核心）

### 3.1 为什么不用裸字符 offset

1. **源码 offset 与 DOM 文本 offset 不同构**：`**粗体**`、链接、表格竖线等 Markdown 语法字符不会出现在渲染文本中，`<p>` 之间还有 marked 生成的 `\n` 空白文本节点。
2. **任何前文编辑都会让其后全部 offset 平移**。仿真（§3.6）中，第八章只在靠前的段落补了一句，全章 600 个样本的裸 offset **全部（100%）失效**，而"块序号 + 块内偏移"**全部（100%）仍然命中**。
3. **失效是静默的**：裸 offset 不带任何校验信息，漂移后会"高亮了别的字"。在 4 份真实改稿上，裸 offset 只有 **30.8%** 仍指向原文，剩下 69.2% 会错标且用户无从察觉。
4. **渲染器与空白不稳定**：段内软换行（`guide.md` 有 62 处）、marked 版本升级、块间空白节点都会改变全局 offset，但不改变"块 + 块内规范化文本"。
5. **无法跨设备复现 DOM 引用**：Range 本身只能存成某种坐标，必须选一种对内容变化稳健、且能自我校验的坐标。

因此本方案用**块坐标定位，quote 校验，prefix/suffix + heading 消歧，失败分级降级**。思路与 W3C Web Annotation 的 TextQuoteSelector + TextPositionSelector 组合同源，但针对本站的块结构做了简化。

### 3.2 文本模型（TextModel）

只作用于 `.rdr-chapter-body`，章节标题 `h1.rdr-chapter-title` 不可标注。

```
BLOCK_SEL = 'p,li,h1,h2,h3,h4,h5,h6,pre,td,th,dt,dd,figcaption'   // 叶子块候选；容器 blockquote/ul/ol/table 不算
```

- **块归属**：每个文本节点归属于 `node.parentElement.closest(BLOCK_SEL)`（必须在 body 内）。不在任何块内的文本节点，例如块间的 `"\n"`，直接忽略。`li>p` 中的文字归 `p`，`li` 自身只剩空白，规范化后为空而被丢弃。`blockquote>p` 归 `p`，表格归 `td/th`，正文内的 `h1`（讨论课件）也算块。
- **块顺序**：按文档序中各块首个文本节点出现的先后。块序号 `block` = 非空块的 0 基序号。
- **规范化**：块内所有文本节点按序拼接，把 `[\s\u00a0\u3000]+` 折叠为单个空格并去掉首尾空白。同时记录双向映射：`norm[i] → (textNode, rawOffset)`，以及 `textNode → Int32Array(rawOffset → 规范化下标)`。
- **全章文本**：`chapterText = blocks.map(b => b.text).join('\n')`，`block.start` 为该块在 `chapterText` 中的起点。
- **章节指纹**：`rev = cyrb53(chapterText)`（同步 53 位哈希，16 进制）。不用 `crypto.subtle`，因为它在非安全上下文（局域网 http 预览）不可用。`rev` 只用于判断"章节是否变过"，碰撞不影响正确性，因为任何命中都还要过 quote 校验。
- **`<mark>` 不改变文本模型**：高亮只插入内联 `mark` 元素，不改变 `textContent` 和块归属。所以无论页面上是否已有高亮，模型都一样，可以随时重建。

```js
// 伪代码（ES5 风格，与 reader.js 一致）
function buildModel(body) {
  var recs = [], byEl = new Map(), w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (var n = w.nextNode(); n; n = w.nextNode()) {
    var el = n.parentElement && n.parentElement.closest(BLOCK_SEL);
    if (!el || !body.contains(el)) continue;
    var r = byEl.get(el); if (!r) { r = { el: el, nodes: [] }; byEl.set(el, r); recs.push(r); }
    r.nodes.push(n);
  }
  var text = '', blocks = [];
  recs.forEach(function (r) {
    var s = '', map = [];                                   // map[i] = [node, rawOffset]
    r.nodes.forEach(function (node) {
      for (var k = 0; k < node.data.length; k++) {
        var ws = /[\s\u00a0\u3000]/.test(node.data[k]);
        if (ws && (!s || s[s.length - 1] === ' ')) continue;
        s += ws ? ' ' : node.data[k]; map.push([node, k]);
      }
    });
    if (s.slice(-1) === ' ') { s = s.slice(0, -1); map.pop(); }
    if (!s) return;
    if (text) text += '\n';
    blocks.push({ el: r.el, tag: r.el.tagName.toLowerCase(), text: s, map: map, start: text.length });
    text += s;
  });
  return { blocks: blocks, text: text, len: text.length, rev: cyrb53(text) };
}
```

### 3.3 锚点数据结构（`anchor` v1，存为 JSON 文本；`quote` 单独成列）

```json
{
  "v": 1,
  "rev": "1f3a9c07be21d4",
  "len": 5169,
  "start": { "block": 23, "offset": 5 },
  "end":   { "block": 24, "offset": 18 },
  "pos":   { "start": 2210, "end": 2301 },
  "prefix": "选区前 32 个规范化字符",
  "suffix": "选区后 32 个规范化字符",
  "heading": { "id": "h7-恩典作为天国临到的记号", "text": "恩典作为天国临到的记号", "tag": "h3" }
}
```

| 字段 | 含义 | 用途 |
|---|---|---|
| `start/end.block` + `offset` | 块序号 + 块内规范化偏移（end 为开区间） | L1 主定位；跨段落选区天然支持 |
| `pos` | 全章 `chapterText` 偏移 | 排序（冗余为 `pos_start` 列）；降级时估算期望位置 |
| `len` | 创建时全章长度 | 期望位置按 `pos.start × 新长度/len` 缩放 |
| `rev` | 创建或最近一次自愈时的章节指纹 | 快速判断章节是否变过；决定是否自愈 |
| `prefix/suffix` | 前后各 32 字（跨块时含 `\n`） | 多处出现时消歧；模糊匹配打分 |
| `heading` | 起点之前最近的 h1–h6：`id`（h2–h4 才有 aid）、规范化文本、标签 | L2 小节内查找；面板里展示"所在小节" |
| `quote`（列） | 选中的规范化原文 | 所有级别的校验依据；孤儿展示 |

### 3.4 选区 → 锚点

1. 取 `sel.getRangeAt(0)` 与 `.rdr-chapter-body` 求交：起点在 body 之前就钳到 body 首，终点在 body 之后就钳到 body 尾。求交后为空，则不出工具条。
2. 把边界点 `(container, offset)` 转成文本位置：
   - 若 `container` 是元素，起点取 `childNodes[offset]` 及其后第一个**模型内**文本节点的 0 偏移，终点取其前最后一个模型内文本节点的末尾。
   - 若是模型外文本（块间空白），起点向后、终点向前，移到最近的模型文本。
3. 用 `textNode → Int32Array` 把原始偏移映射到 `(block, 规范化 offset)`，并求全章偏移 `gs/ge`。
4. 收紧首尾空白；`ge - gs` 须在 1 到 `MAX_QUOTE`（5000）之间，越界则提示"选区过长"。建议至少 2 个字，单字的 quote 区分度太低。
5. `quote = text.slice(gs, ge)`，`prefix = text.slice(gs-32, gs)`，`suffix = text.slice(ge, ge+32)`，`heading` 取起点块之前最近的 heading 块。

### 3.5 锚点 → Range：多级恢复（逐级尝试，命中即停）

设当前模型为 `M`，`T = M.text`，`q = quote`，期望位置 `E = pos.start × M.len / anchor.len`。打分函数如下：

```
ctx(s, e) = 公共后缀长(prefix, T[s-|prefix|, s]) / |prefix|  +  公共前缀长(suffix, T[e, e+|suffix|]) / |suffix|     ∈ [0, 2]
score(s) = ctx(s, s+|q|) − 0.5 × |s − E| / |T|
```

| 级别 | 规则 | 命中后状态 |
|---|---|---|
| **L1 精确** | 若 `rev === M.rev`，直接用 `pos`；否则用 `start/end` 的块坐标求出区间。两种情况都要求 `T.slice(s,e) === q`；`rev` 不同时还要求 `ctx ≥ 1.0`（防同文异处的巧合） | `exact` |
| **L2 小节内** | 在当前模型中找出**所有** `tag` 与 `text` 都等于 `anchor.heading` 的 heading 块（不按 aid 比，因为 aid 含序号，插入标题后会整体平移）。小节范围 = 该 heading 到下一个同级或更高级 heading。汇总**所有同名小节**里 `q` 的全部出现位置，取 `score` 最大者 | `moved` |
| **L3 全章** | 在 `T` 中找 `q` 的所有出现位置，取 `score` 最大者 | `moved` |
| **L4 首尾模糊** | 仅当 `|q| ≥ 16`：取 `k = min(12, ⌊|q|/3⌋)`，分别找头 `q[0:k]` 和尾 `q[-k:]` 的出现位置，配对条件为尾在头之后，且跨度在 `[0.6, 1.5] × |q|` 之间；按 `ctx − |跨度−|q||/|q|` 取最高者 | `fuzzy`：虚线样式 + "原文已修订"，**不自动保存** |
| **L5 孤儿** | 以上均失败 | `orphan`：正文不渲染；面板"无法定位"分组展示 quote 与笔记；**绝不自动删除** |

> 关键修正（仿真发现）：L2 早期版本"命中第一个同名小节就返回"，在 `讨论课件.md`（标题与模板文字大量重复）上产生 **42 例错位**。改为"汇总所有同名小节的候选再统一打分"后错位降为 **0**。实现时必须采用后者。

### 3.6 离线仿真：用真实改稿验证降级策略

方法：取 `177dd41^ → 177dd41` 的 3 个改动文件，加上第十章 `HEAD → 工作区` 的未提交修订，共 4 份。用仓库内 `marked.min.js` 渲染后按 §3.2 规则建模（脚本中用正则近似块解析）。每份在旧稿上随机生成 600 个高亮（单块内，长 4–63 字，固定随机种子），在新稿上按 §3.5 恢复，再用 Python `difflib` 对齐新旧文本作为**真值**判定对错。脚本在 `/tmp/anchor_sim/`，未入库；P4 会把它改写成仓库内的固定夹具单测。

| 改稿样本 | 旧/新块数 | 旧/新规范化字数 | L1 | L2 | L3 | L4 | L5 | 裸 offset 仍有效 |
|---|---|---|---|---|---|---|---|---|
| 177dd41 第八章 | 56/56 | 3577/3661 | 600 | 0 | 0 | 0 | 0 | 0/600（0%） |
| 177dd41 第十章 | 79/81 | 4248/5169 | 40 | 453 | 47 | 8 | 52 | 40/600（6.7%） |
| 177dd41 讨论课件 | 575/579 | 14586/14965 | 409 | 181 | 0 | 0 | 10 | 409/600（68.2%） |
| 工作区 第十章（未提交） | 81/81 | 5169/5188 | 577 | 16 | 0 | 0 | 7 | 289/600（48.2%） |
| **合计 2400** | | | **1626（67.8%）** | **650（27.1%）** | **47（2.0%）** | **8（0.3%）** | **69（2.9%）** | **738（30.8%）** |

真值核对（采用 §3.5 的 L2 汇总打分版）：

- L1/L2/L3 共 2323 例，**全部落在正确的那一处出现**；其中 47 例有多个候选，也全部选对。
- 8 例 L4 全部落在"同一段话的修订版"上，例如 `采取的是另一种策略` 变为 `采取的是一种以静制动的策略`。但也有含义大改的情况，例如撒玛利亚妇人一句从"种族歧视……婚史"改写为"屡经破碎的婚姻而蒙羞自卑"。因此 L4 **必须让用户确认**，不能自动接受。
- 69 例孤儿**全部**对应确实被改写或删除的原文，没有一例"原文还在却没找到"。

局限：块解析是正则近似，样本全部是单块内选区，没有覆盖跨块选区，也没有覆盖 marked 升级场景。P4 的单测会补上跨块用例和 DOM 版建模。

### 3.7 自愈与用户确认

- `exact` 且 `rev` 相同：无动作。
- `exact`（`rev` 不同）、`moved`：若候选唯一或 `ctx ≥ 1.5`，就在后台用新的 `start/end/pos/len/rev/prefix/suffix/heading` 发 PUT 自愈（`quote` 不变），走同步队列（§6.9）。不满足条件时只渲染，不回写。
- `fuzzy`：渲染为虚线，面板显示"原文已修订"，并给出"确认新位置"（用新 quote 加新 anchor 回写）或"删除"两个选项。
- `orphan`：只在面板展示，用户可以删除，也可以"重新定位"：在正文选一段新文字，把这条笔记挂上去（PUT 同一 id，新 quote/anchor）。

### 3.8 与 `aidFor()` / `#锚点` 深链的兼容

- **不修改** `aidFor`、`decorateHeadings`、`findAnchor` 的任何规则。高亮只插入 `<mark>`，heading 的 `textContent` 不变，因此 aid 不变；`decorateHeadings` 只处理 h2–h4 本身，也不受影响。
- `heading.id` 只是**展示与辅助信息**。匹配用 `tag + text`，因为 aid 含序号 `i`，前面插入一个标题就会整体平移。
- **高亮深链**：每条高亮的**第一个** `mark` 片段设 `id="hl-<uuid>"`，深链为 `reader.html?book=<b>&ch=<c>#hl-<uuid>`。`hl-` 前缀与 aid 的形态 `^h\d+` 不冲突（`h` 后跟 `l` 而非数字）。`findAnchor` 搜索的是 `.rdr-chapter-body [id]`，天然能找到 mark，所以 `jumpToHash()` 和 `.rdr-anchor-hit` 闪烁**原样复用**。
- 时序：带 `#hl-` 进入时，0/160/420ms 的 `jumpToHash()` 可能早于高亮渲染，届时会先恢复上次阅读位置。高亮渲染完成后，模块回调一次 `jumpToHash()` 完成定位（`reader.js` 把 `jumpToHash` 作为回调传入，不新增全局）。
- 大纲、思维导图的 `#h<i>-…` 深链完全不受影响；P2 起用 Playwright 对全部章节的 heading id 做前后比对（§9.4）。

---

## 4. 数据模型

### 4.1 DDL：`migrations/016-reader-annotations.sql`

```sql
-- 016-reader-annotations.sql
-- 阅读器正文高亮 + 笔记：按用户隔离，跨设备同步（last-write-wins；软删除墓碑防离线队列复活）
-- 增量建表，对既有表零影响；可重复执行（IF NOT EXISTS）

CREATE TABLE IF NOT EXISTS reader_annotations (
  id          TEXT PRIMARY KEY,                     -- 客户端生成 UUID v4：离线创建 + 幂等重试
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     TEXT NOT NULL,                        -- reader.html?book=（= library/<book>/ 目录名，如 lordship_gospel）
  chapter_id  TEXT NOT NULL,                        -- manifest.json parts[].chapters[].id（如 '11'、'preface'）
  color       TEXT NOT NULL DEFAULT 'yellow',       -- yellow|green|blue|pink|purple|none（none = 仅笔记，下划线样式）；由 API 白名单校验
  quote       TEXT NOT NULL,                        -- 选中的规范化原文（≤ 5000 字）
  note        TEXT NOT NULL DEFAULT '',             -- 笔记纯文本（≤ 20000 字，与 courseware_notes 上限一致）
  anchor      TEXT NOT NULL,                        -- JSON（v=1，见设计文档 §3.3），≤ 4096 字节
  pos_start   INTEGER NOT NULL DEFAULT 0,           -- = anchor.pos.start，仅用于排序
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT                                   -- 软删除墓碑；NULL = 有效
);

CREATE INDEX IF NOT EXISTS idx_reader_ann_user_book
  ON reader_annotations(user_id, book_id, chapter_id, pos_start);
```

### 4.2 字段口径

- **时间戳**：遵循 `docs/migrations.md`（"New columns must default to ISO, not `datetime('now')`"）。默认值用 `strftime('%Y-%m-%dT%H:%M:%fZ','now')`，产出形如 `2026-10-03T07:12:34.567Z`，与 `functions/_shared/db.js` 的 `now()`（`toISOString()`）同格式。API 写入时**一律显式传 `now()`**，默认值只是兜底。
- **`id`**：客户端 `crypto.randomUUID()`；非安全上下文时用 `crypto.getRandomValues` 拼 v4。服务端用正则校验 v4 形态。不信任 id 的归属：每次写入都要求 `user_id = payload.sub`。
- **`user_id`**：只取 JWT `payload.sub`，**绝不读请求体**（与 `notes.js` 一致）。
- **`book_id/chapter_id`**：创建后不可变（PUT 时不一致返回 400）。它们与 D1 `books` 表无关：`books` 种子 id 是 `book-zh-001` 这类，与阅读器 manifest 不是同一体系，所以不加 FK。
- **软删除**：DELETE 只写 `deleted_at = updated_at = now()`。作用有两个：(1) 离线队列里迟到的 PUT 遇到墓碑返回 410，客户端据此丢弃，**不会复活**；(2) 误删可由管理员按 SQL 恢复。保留策略：墓碑 30 天后可手工清理（Pages 没有 cron）：
  `DELETE FROM reader_annotations WHERE deleted_at IS NOT NULL AND deleted_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days');`
- **用户注销**：`ON DELETE CASCADE` 随用户一并删除。

### 4.3 为什么不复用 `highlights` 表（附改造代价）

`migrations/003-interactions.sql` 中的 `highlights`，加上 `functions/api/modules/interactions/highlights.js`：

| 现状 | 与需求的冲突 |
|---|---|
| `item_id TEXT NOT NULL REFERENCES course_items(id) ON DELETE CASCADE` | 阅读器章节不是课程条目。复用就得为每本书每一章伪造 `course_items` 行，而 `course_items.course_id` 又 FK 到 `courses`，等于再伪造课程 |
| `visibility` / `class_ids` / `highlight_replies` | 社交与班级可见性语义。本需求只需私有，GET 却会对每次请求 JOIN `class_members` 和 `json_each` |
| API 只有 GET/POST（无 PUT/DELETE），也没有幂等主键 | 编辑、删除、离线重试都得重写 |
| 时间戳默认 `datetime('now')`（空格格式） | 与 ISO 规范不一致（014 迁移专门修过这一类问题） |
| 排序依赖 `json_extract(anchor_data,'$.position.start')` | 锚点结构不同 |

改造代价：把 `item_id` 改成可空、加 `book_id/chapter_id/deleted_at`，在 SQLite/D1 上**只能整表重建**（`docs/migrations.md`：rebuild + `PRAGMA foreign_keys=OFF`）；还要改 `highlights.js` 的必填校验与可见性 SQL，回归 `tests/migrations/003-interactions.test.js` 与课程侧语义。`course-app/` 前端目前**没有调用** highlights API（grep 证实），但该表属于课程系统的规划资产，改动它就是跨系统耦合。结论：新建 `reader_annotations` 的成本远低于改造，语义也更干净。

### 4.4 约束取舍

- **为什么不加内容级唯一约束**（例如 `UNIQUE(user_id, book_id, chapter_id, pos_start, pos_end)`）：自愈会改坐标。若某处原文被删，两条高亮可能自愈到同一位置，UNIQUE 冲突会让自愈失败成 500。幂等性已由主键（客户端 UUID）保证；"同一选区重复高亮"由前端去重：区间与已有高亮完全相同时改为变更颜色。
- **为什么 `color` 不加 `CHECK`**：SQLite 改 CHECK 需要重建表，以后增减颜色代价很大。白名单放在 API 层，与 `notes.js` 用 `QUESTION_TYPES` Set 的做法一致。
- **为什么不分页**：每用户总量上限 5000 条（创建时校验），GET 单书一次返回足够，前端分章渲染。

---

## 5. API 设计

### 5.1 通用约定（与仓库现有 Functions 一致）

- 文件：`functions/api/reader/annotations/index.js`（GET，路径 `/api/reader/annotations`，参照 `functions/api/modules/assignments/index.js`），以及 `functions/api/reader/annotations/[id].js`（PUT/DELETE，参照 `assignments/[id].js`）。
- 鉴权：`verifyAuth(env.DB, request, env)`（`functions/_utils/requireAuth.js`），失败时用 `jsonError(auth.status, auth.error)` 返回 401 `Unauthorized` / `Invalid token`。
- 错误体：`{ "error": "<message>" }`；成功体：`{ "success": true, ... }`；`Content-Type: application/json`；每个 handler 都整体 `try/catch`，失败时 `console.error` 并返回 500 `Internal server error`。
- 绑定检查：`if (!env.DB) return jsonError(500, 'DB binding is missing.')`（与 `signin.js` 一致）。
- 限流：写操作（PUT/DELETE）调用 `rateLimit(env, 'w:' + sub, 60, 60000)`，桶与 `profile.js`、`highlights.js` 共用；429 带 `Retry-After`。GET 不限流（与 `notes.js` GET 一致）。⚠ 待核实：账户计划下的 KV 写配额，因为每次 `rateLimit` 会产生 1 读 1 写，见 §8-R5。
- 时间：`now()`（ISO）。
- 校验常量：

```
ID_RE      = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
BOOK_RE    = /^[a-z0-9_]{1,64}$/            // oikos_church / oikos_church_en / lordship_gospel
CHAPTER_RE = /^[A-Za-z0-9_-]{1,64}$/        // '00'…'18' / preface / guide / appendix …
COLORS     = yellow|green|blue|pink|purple|none
MAX_QUOTE = 5000, MAX_NOTE = 20000, MAX_ANCHOR_BYTES = 4096, MAX_PER_USER = 5000
```

### 5.2 `GET /api/reader/annotations?book=<id>[&chapter=<id>]`

- 用途：带 `chapter` 时返回本章（渲染用）；不带时返回全书（"我的笔记"面板）。
- SQL：`SELECT id, book_id, chapter_id, color, quote, note, anchor, created_at, updated_at FROM reader_annotations WHERE user_id=? AND book_id=? [AND chapter_id=?] AND deleted_at IS NULL ORDER BY chapter_id, pos_start, created_at LIMIT 5000`
- 200：

```json
{ "success": true,
  "annotations": [
    { "id": "6f1c…", "book_id": "lordship_gospel", "chapter_id": "11", "color": "yellow",
      "quote": "采取的是一种以静制动的策略", "note": "对照约翰福音 3 章尼哥底母",
      "anchor": { "v": 1, "...": "..." },
      "created_at": "2026-10-03T07:12:34.567Z", "updated_at": "2026-10-03T07:20:01.002Z" } ] }
```

- 错误：400 `invalid book` / `invalid chapter`；401；500。

### 5.3 `PUT /api/reader/annotations/:id`：幂等 upsert（创建与更新同一入口）

- 请求体：

```json
{ "book": "lordship_gospel", "chapter": "11", "color": "yellow",
  "quote": "……", "note": "", "anchor": { "v": 1, "rev": "…", "len": 5169, "start": {…}, "end": {…}, "pos": {…},
  "prefix": "…", "suffix": "…", "heading": {…} } }
```

- 校验：`params.id` 符合 `ID_RE`；`book/chapter` 符合正则；`color ∈ COLORS`；`quote` 是 1–5000 字的字符串；`note` 是 ≤20000 字的字符串（缺省为 `''`）；`anchor` 满足 `v===1`，`start/end.block/offset` 为非负整数，`pos.end > pos.start`，`prefix/suffix` 为 ≤64 字的字符串，且 `JSON.stringify(anchor)` ≤ 4096 字节。
- 流程：
  1. `verifyAuth` → `rateLimit` → 解析并校验 body。
  2. `existing = SELECT user_id, book_id, chapter_id, deleted_at FROM reader_annotations WHERE id = ?`
  3. 若 `existing` 不存在：检查配额 `SELECT COUNT(*) AS n FROM reader_annotations WHERE user_id=? AND deleted_at IS NULL`，`n ≥ 5000` 时返回 403 `annotation quota exceeded`。否则 `INSERT`（`created_at = updated_at = now()`，`pos_start = anchor.pos.start`），返回 **201**。主键冲突（两次并发创建同一 id，极少见）时 catch 并返回 409 `conflict, retry`，客户端重试即走更新分支。
  4. 若 `existing.user_id !== sub`：返回 **404** `Not found`（不泄露他人 id 存在与否）。
  5. 若 `existing.deleted_at` 非空：返回 **410** `Gone`（墓碑不复活）。
  6. 若 `book/chapter` 与已有记录不一致：返回 400 `book/chapter mismatch`。
  7. `UPDATE … SET color=?, quote=?, note=?, anchor=?, pos_start=?, updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`，返回 **200**。
- 200/201：`{ "success": true, "annotation": { id, book_id, chapter_id, color, quote, note, anchor, created_at, updated_at } }`

> 不依赖 `meta.changes`：测试用的 `tests/helpers/setup-db.js` 的 `run()` 只返回 `{ meta: {} }`，取不到 changes。所以用"先 SELECT 再分支"的写法，测试与生产行为一致。

### 5.4 `DELETE /api/reader/annotations/:id`：软删除，幂等

- 流程：`verifyAuth` → `rateLimit` → `SELECT user_id, deleted_at …`。
  - 不存在或属于他人：404。
  - 已删：200（幂等）。
  - 否则 `UPDATE … SET deleted_at=?, updated_at=? WHERE id=? AND user_id=?`，返回 200 `{ "success": true }`。
- 客户端把 404 也视作"已完成"，从队列中移除。

### 5.5 错误码总表

| 码 | 场景 | 客户端处理 |
|---|---|---|
| 400 | 参数或体校验失败、book/chapter 不可变 | 丢弃该队列项并提示（属于程序缺陷，记 console） |
| 401 | 缺 token、token 无效或过期 | **保留队列**，`openLoginModal`，登录后 flush |
| 403 | 配额超限 | 提示"标注数量已达上限" |
| 404 | id 不属于本人或不存在（PUT/DELETE） | PUT：丢弃并提示；DELETE：视为成功 |
| 409 | 并发创建同 id | 立即重试一次 |
| 410 | 已删除（墓碑） | 丢弃，并从本地移除该高亮 |
| 429 | 限流 | 保留队列，按 `Retry-After` 退避 |
| 500 / 非 JSON / 网络错误 | 服务异常，或路由未部署（HTML） | 保留队列，提示"服务暂不可用，已存本地" |

### 5.6 handler 骨架（风格对齐 `profile.js` / `notes.js`）

```js
// functions/api/reader/annotations/[id].js
import { verifyAuth, jsonError } from "../../../_utils/requireAuth.js";
import { queryOne, execute, now } from "../../../_shared/db.js";
import { rateLimit } from "../../../_utils/rate-limit.js";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// … BOOK_RE / CHAPTER_RE / COLORS / MAX_* / validateBody(body) → { value } | { error }

export async function onRequestPut(context) {
  try {
    const { env, request, params } = context;
    if (!env.DB) return jsonError(500, "DB binding is missing.");
    const auth = await verifyAuth(env.DB, request, env);
    if (!auth.ok) return jsonError(auth.status, auth.error);
    const rl = await rateLimit(env, "w:" + auth.payload.sub, 60, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfter || 60) } });
    }
    if (!ID_RE.test(params.id || "")) return jsonError(400, "invalid id");
    const v = validateBody(await request.json());
    if (v.error) return jsonError(400, v.error);
    // … §5.3 第 2–7 步
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message }));
    return jsonError(500, "Internal server error");
  }
}
```

---

## 6. 前端实现

### 6.1 文件改动清单

| 文件 | 改动 | 量级 |
|---|---|---|
| `library/assets/js/reader-annotations.js` | **新增**。经典 IIFE，暴露 `window.ReaderAnnotations`（文本模型、锚定、渲染、工具条、笔记浮层、面板、同步队列、草稿） | 约 700 行 |
| `library/assets/js/reader.js` | 3 处挂接（§6.3） | +8 行 |
| `library/assets/js/reader-auth.js` | 新增 `onLogin(cb)`，登录/注册成功时触发（与现有 `onLogout` 对称） | +6 行 |
| `library/reader.html` | 顶栏加 `#rdr-notes-btn`；在 `reader-auth.js` 之后加 `<script src="assets/js/reader-annotations.js">` | +4 行 |
| `library/assets/css/reader.css` | 四套主题各加 5 个高亮色 token；末尾追加"高亮与笔记"段（mark、工具条、浮层、面板、打印） | 约 +120 行 |
| `functions/api/reader/annotations/index.js`、`[id].js` | **新增** | 约 200 行 |
| `migrations/016-reader-annotations.sql` | **新增** | 约 25 行 |
| `brianinchrist/_routes.json`、`wrangler-blog.toml`、`scripts/deploy-blog.sh` | P0：新增或修改 | 小 |
| `tests/…`、`scripts/verify_reader_annotations.cjs` | **新增**（§9） | — |

为什么拆成独立脚本，而不是写进 `reader.js`：(1) 有先例，`reader-auth.js` 就是同样的经典脚本 + 全局对象模式；(2) 约 700 行的独立特性塞进 955 行的 IIFE 会让审阅和回归都更难；(3) `tests/frontend/reader-auth.test.js` 已示范用 happy-dom `eval` 加载经典脚本，可以对锚定算法做纯单测；(4) **故障隔离**：`reader.js` 只在 `window.ReaderAnnotations` 存在时调用，脚本加载失败时阅读器行为与今天完全一致。

### 6.2 `reader-annotations.js` 结构

```js
window.ReaderAnnotations = {
  mount: function (opts) {},   // { bookId, chapter|null, manifest, body|null, onRendered }
  refresh: function () {},     // 登录/登出后：重拉 → 合并本地队列/草稿 → 重渲染
  openPanel: function () {}, closePanel: function () {},
  _internal: { buildModel, anchorFromRange, resolveAnchor, applyMarks, clearMarks }   // 仅测试用（同 ReaderAuth._emitLogout 先例）
};
```

内部分层：`TextModel`（§3.2）→ `Anchor`（§3.4–3.5）→ `Marks`（§6.5）→ `UI`（工具条、浮层、面板）→ `Store`（API、队列、草稿，§6.8–6.9）。所有用户内容（quote/note）**一律 `textContent` 渲染**（`.memory` P-001 存储型 XSS 教训）。

### 6.3 与 `reader.js` 的挂接点（精确到行，均为纯追加）

1. `renderChapter()` 在 `decorateHeadings(qs('#rdr-content'))`（:186）之后追加：

   ```js
   if (window.ReaderAnnotations) window.ReaderAnnotations.mount({ bookId: state.bookId, chapter: ch,
     manifest: state.manifest, body: qs('#rdr-content .rdr-chapter-body'), onRendered: jumpToHash });
   ```

   放在 `decorateHeadings` 之后，保证 heading 已有 aid，可以写进 `anchor.heading.id`。
2. `init()` 封面分支 `renderCover()`（:941）之后追加同样的 `mount`，传 `chapter: null, body: null`，只提供"全书笔记"面板。
3. keydown 守卫（:414 下一行）追加：`if (document.body.classList.contains('rdr-notes-open')) return;`，避免在笔记面板里按 ←/→ 误翻章。
4. 登录与登出：**不改** `renderAuthRow` 或 `renderCourseware` 的回调。模块自己订阅 `ReaderAuth.onLogin`（新增）和 `ReaderAuth.onLogout`（已有，`AUTH.logout()` 会触发），因此不论从齿轮、课件锁屏还是高亮工具条登录，都会自动刷新。

### 6.4 选区交互与浮动工具条

- 触发：在 `#rdr-content` 上监听 `pointerup`、`keyup`（Shift+方向键），在 document 上监听 `selectionchange`（防抖 150ms，主要照顾移动端拖动选择柄）。选区非空且与 `.rdr-chapter-body` 有交集才显示。
- 内容：`●黄 ●绿 ●蓝 ●粉 ●紫 | ✎ 笔记`。若选区与某条已有高亮的区间完全相同，色点改为"换色"，并多出"删除"。
- 定位：工具条挂在 body 上，`position: fixed`，按 `range.getClientRects()` 定位。鼠标操作时放在首行上方；触屏（`pointerType==='touch'`）时放在末行下方，避开 iOS/Android 原生选区菜单。顶部空间不足（会被 `#rdr-topbar` 54px 挡住）时自动翻到下方。`#rdr-main` 滚动或窗口 resize 时隐藏。
- 不吞选区：按钮在 `pointerdown` 时 `preventDefault()`，在 `click` 时执行，否则点击会先清掉选区。
- 点色点：先 `anchorFromRange`，再生成 UUID，然后乐观渲染、入队 PUT、`removeAllRanges()`。点"笔记"：以 `color:'none'` 创建，并立即打开笔记浮层。

### 6.5 高亮渲染：跨节点 Range 与幂等

```
applyMarks(list):
  clearMarks(body)                       // 拆掉全部 mark.rdr-hl：子节点移回父级，对受影响父节点 normalize()
  M = buildModel(body)                   // 在"原始"DOM 上建模（mark 不影响文本，但拆了更利于节点映射）
  rs = list.map(a => resolveAnchor(a, M))           // 先把全部注解解析成 DOM Range（边界都落在文本节点上）
  rs 按 (start asc, end desc) 排序                   // 外层先包，内层后包 → 重叠时自然嵌套
  for r in rs: wrapRange(r)              // DOM 规范保证 splitText/插入时活动 Range 自动修正边界
wrapRange(range, a):
  nodes = range 覆盖的、属于模型块的文本节点（先收集成数组，再变更 DOM）
  for node in nodes:
    s = node===startContainer ? startOffset : 0 ; e = node===endContainer ? endOffset : node.length
    if s>=e continue ; if e<node.length node.splitText(e) ; if s>0 node=node.splitText(s)
    mark = <mark class="rdr-hl rdr-hl-{color}" data-hl-id="{id}">，首段加 id="hl-{id}"，末段加 rdr-hl-tail（有笔记时加 rdr-hl-has-note）
    node 前插入 mark，再把 node 移入 mark
```

- **幂等**：每次都从 `clearMarks` 开始。`marked` 产出经 `innerHTML` 解析后不存在相邻文本节点，所以拆 mark 再 `normalize()` 就能精确回到原始节点结构。重复调用 `applyMarks` N 次，`innerHTML` 完全相同（P2 验收项）。
- **跨段落**：每个文本节点单独包一个 mark，从不包块级元素，HTML 始终合法，不破坏 `p/li/td` 结构。
- **局部更新**：换色只改 `[data-hl-id=X]` 的 class；改笔记只切换 `rdr-hl-has-note`。只有新增、删除、自愈时才走全量 `applyMarks`（本站最大章约 14 万字，O(n) 重建；P2 验收要求 < 50ms，⚠ 待实测）。
- **重叠**：允许重叠，渲染为嵌套 mark，内层颜色优先。点击时取最内层 `closest('mark.rdr-hl')`。被完全覆盖的外层高亮可以从面板进入。

### 6.6 点击高亮：查看、编辑、删除笔记

- 在 `#rdr-content` 上做委托 `click`：选区为空、目标在 `mark.rdr-hl` 内、且不在 `a[href]` 内（链接照常跳转），就打开浮层。
- 浮层 `#rdr-hl-pop`（`role="dialog"`）：
  - 顶部：5 个色点、一个"仅笔记"选项、"删除"按钮。
  - 中部：`textarea`（占位"写下你的笔记…"）。
  - 底部：quote 摘要（`textContent`）、更新时间、同步状态（"已保存 / 保存中… / 离线，已存本地"）。
- 自动保存：`input` 时立即写本地队列（刷新也不丢），并防抖 800ms 发 PUT；`blur` 或关闭时立即 flush。
- 删除：先本地移除，并弹出"已删除 · 撤销"提示（5s）。5s 后才真正入队 DELETE，所以撤销不需要服务端恢复接口。
- 关闭：Esc、点击外部、再次点同一 mark。≤1023px 时浮层变为底部抽屉（fixed bottom，全宽）。
- 焦点：打开时聚焦 textarea，关闭后焦点还给 `#rdr-main`。

### 6.7 "我的笔记"面板与深链

- 入口：顶栏 `#rdr-notes-btn`（笔形 SVG，`aria-label="我的笔记"`，`aria-controls="rdr-notes-panel"`），位于 `#rdr-settings-btn` 之前。
- 面板 `#rdr-notes-panel`：由模块注入，右侧固定抽屉，宽 `min(420px, 92vw)`，位于顶栏之下；`body.rdr-notes-open` 控制开合，带独立 scrim。它**独立于三栏布局**，不碰 `--rdr-rcol-w`、分隔条或课件抽屉逻辑，从而避开最容易回归的布局代码。
- 内容：
  - 页签"本章 / 全书"（封面模式只有全书）。全书数据来自 `GET ?book=`。
  - 按 manifest 顺序分章，章名取自 `state.manifest`。
  - 每条显示：色块、quote（两行截断）、笔记（三行截断）、所在小节（`anchor.heading.text`）、更新时间。
  - 分组"原文已修订（待确认）"（fuzzy）和"无法定位"（orphan）。
  - 未登录时显示登录引导和本地草稿。
- 跳转：
  - 同章：`history.replaceState` 改 hash 为 `#hl-<id>`，再调用 `jumpToHash()`。
  - 异章：`saveScroll` 之后 `location.href = reader.html?book=<b>&ch=<c>#hl-<id>`。目标页按 §3.8 的时序完成定位。

### 6.8 未登录门禁与本地草稿

- 未登录时工具条**照常出现**，这本身就是引导。点任一色点或"笔记"时：
  1. 先算锚点，生成访客草稿 `{id, book, chapter, color, quote, note, anchor, ts}`，写入 `localStorage.rdr_ann_guest`。
  2. 立即以"未同步"样式（虚线外框）渲染，然后打开 `ReaderAuth.openLoginModal`。
  3. 登录或注册成功后，把**当前章**的草稿转入该用户的队列并 flush。
  4. 关闭弹窗也不丢：草稿保留，刷新后照样渲染，面板显示"N 条本地草稿，登录后同步"。
- 登录后若还有其它章的访客草稿，提示"将 N 条未登录时的标注保存到当前账号？"并让用户确认。确认是为了防止公用电脑上把前一个人的草稿传进下一个人的账号。
- 已登录用户的笔记输入同样先落本地队列（§6.9），因此"写到一半断网或刷新"也不丢。

### 6.9 同步队列与离线

- `localStorage.rdr_ann_pending_<userId>` 的结构为 `{ [id]: { op: 'put'|'delete', book, chapter, body?, ts } }`，按 id 折叠：同一 id 的多次编辑只保留最新状态，delete 覆盖 put。
- 渲染合并：服务端列表 + 本章队列项（put 覆盖或插入，delete 移除）。
- flush 时机：挂载后、每次本地变更后（防抖）、`online` 事件、`visibilitychange` 变为可见、429 退避到期。按 §5.5 处理各响应。
- 多标签页：队列在 `localStorage` 中共享，并发 flush 会产生重复 PUT。由于 PUT 幂等，不会出错。
- 冲突策略：**last-write-wins**（与 2026-08-06 课件笔记设计一致），不做多设备实时合并。
- `userId` 取 `ReaderAuth.getProfile()` 返回值的 `.user.id`（注意不是 `.id`，见 §1.4 缺陷 2）。

### 6.10 CSS：主题适配、层级与打印

- Token：在四个 `html[data-theme=…]` 块中各加 `--rdr-hl-yellow/green/blue/pink/purple`，浅色主题用 alpha 约 0.30–0.38 的半透明色，深色主题用更低 alpha、更亮的色相。`mark.rdr-hl` 必须写 `color: inherit`，因为 UA 默认 `mark{color:black}`，在深色主题下不可读。对比度按 ADR-006 先例在 P5 做 WCAG AA 校验（正文前景色叠加在高亮混色上 ≥ 4.5:1）。
- 样式：
  - `none`：主题 `--rdr-accent` 色点状下划线。
  - `fuzzy`：虚线下划线。
  - 未同步草稿：虚线外框。
  - 有笔记：末段 `::after` 显示一个小圆点。生成内容不进入文本模型，也不会被复制。
- 层级：工具条和浮层 50（高于设置弹层 45、低于进度条 60），面板 44、scrim 43（低于设置弹层，高于窄屏抽屉 32），登录弹窗 9999 保持最上层。
- 打印：`@media print` 隐藏工具条、浮层、面板和按钮；高亮加 `print-color-adjust: exact` 尽量保留底色，并加底边框兜底（打印"不含背景图形"时仍可辨认）。阅读器目前整体没有打印样式，这里只处理新增元素。

### 6.11 防回归（三本书共用）

- 所有逻辑只依赖 `state.bookId`、`ch.id` 和 `.rdr-chapter-body`，**没有任何按书分支**。三本书的差异（英文空格、表格、`h1`、`li>p`、软换行）已在 §3.2 的规则中统一处理。
- `reader.js` 的改动全部是追加，并以 `if (window.ReaderAnnotations)` 守护；`aidFor/decorateHeadings/findAnchor/jumpToHash` 一字不改。
- 回归手段：(1) Playwright 对三本书全部章节在改动前后抓取 heading id 并逐一比对（复用 `drafts/oikos_lectures/dump_reader_anchors.cjs` 的思路）；(2) 未登录且无高亮时，`.rdr-chapter-body` 的 `innerHTML` 与改动前完全一致；(3) 控制台无报错；(4) 三本书各取封面、首章、最大章（`oikos_church_en/guide`、`lordship_gospel/讨论课件`）做截图比对。

---

## 7. 分期实施计划

> 按全局规范（`~/.claude/CLAUDE.md`），代码实现委派 Sonnet 子代理：P0/P1 用 `sonnet-high`；P2–P4 涉及渲染、同步等易错逻辑，用 `sonnet-xhigh`。主会话负责审阅、复跑测试和部署收尾。每期开始前更新 `.memory/sessions/_active.md`。

### P0：恢复生产 API（前置，与高亮无关，但阻塞一切）

内容：
- 先提交已上线但未提交的阅读器基线（`aidFor/extras/manifest`），是否提交由用户决定。
- 用户批准 ADR-011（A′），然后落地 `wrangler-blog.toml`、`brianinchrist/_routes.json`、`scripts/deploy-blog.sh`。
- `pages secret put JWT_SECRET`，部署。
- 可选（需用户确认）：修 §1.4 的两处课件笔记缺陷。

验收（全部可判定）：
1. `curl -s https://jiadongli.online/api/health` 返回 `application/json`，内容 `{"status":"ok",…,"db":"connected","kv":"connected"}`；`organicchurch.dpdns.org` 同样如此。
2. `POST /api/auth/signin` 用错误密码返回 **401 JSON** `{"error":"Invalid email or password."}`，不再是 405。
3. `GET https://jiadongli.online/api/modules/books` 返回 `text/html`，证明白名单外的路由不可达。
4. 浏览器用测试账号在阅读器登录：齿轮显示昵称；课件面板解锁；输入一条课件笔记，刷新后仍在；DevTools 中 `PUT /api/courseware/notes` 返回 200。
5. `https://brianinchrist-courses.pages.dev/api/health` 仍为 ok（课程系统无回归）。
6. 部署脚本在 `functions/` 有未提交改动时退出码为 1。

### P1：后端（迁移 016 + API + 单测 + 上线）

验收：
1. `npx vitest run tests/migrations/016-reader-annotations.test.js tests/api/reader/annotations.test.js` 全绿，至少覆盖 §9.1 列出的用例。
2. 先 `scripts/backup-d1.sh`，再执行远端迁移；`sqlite_master` 中能查到 `reader_annotations` 和索引。
3. 在生产用测试账号走一遍 curl 序列：PUT 新 id 返回 201 → 同 id 再 PUT 返回 200 → GET 本章 1 条 → DELETE 返回 200 → 再 DELETE 返回 200 → PUT 返回 410 → 换另一账号 PUT 同 id 返回 404 → GET 返回 0 条。
4. `curl https://jiadongli.online/api/reader/annotations/<uuid> -X DELETE` 返回 JSON，证明 `_routes.json` 能匹配多段路径。

### P2：高亮核心（选区 → 多色高亮 → 持久化 → 重载复现；仅 L1 + 孤儿）

内容：文本模型、锚点生成、L1 解析（失败一律当孤儿，**宁缺勿错**）、幂等渲染、工具条、换色与删除、`ReaderAuth.onLogin`、访客草稿与登录引导、`#rdr-notes-btn` 占位。

验收：
1. 三本书各在一个章节上：跨两个段落选区高亮后刷新，高亮文字与原选区逐字相同，且 `data-hl-id` 一致。
2. 连续调用 `ReaderAnnotations.refresh()` 3 次，`.rdr-chapter-body` 的 `innerHTML` 完全相同；清空高亮后与未登录基线完全相同。
3. 三本书全部章节的 heading id 在改动前后逐一相同（脚本比对 0 差异）。
4. 未登录：点色点后出现登录弹窗；关闭后刷新，访客草稿仍在（存在 `localStorage.rdr_ann_guest`，正文虚线渲染）；登录后草稿入库，GET 能查到。
5. 控制台 0 报错；`python3 -m http.server`（无 API）下阅读、翻章、主题与字号均正常。

### P3：笔记、面板、深链与离线队列

验收：
1. 点高亮写笔记，1 秒后在另一浏览器上下文（模拟另一台设备）打开同章，能看到该笔记。
2. 断网（Playwright `route.abort`）时编辑笔记，`rdr_ann_pending_<uid>` 出现该项；恢复网络并触发 `online` 后队列清空，服务端拿到最新内容。
3. 面板"全书"按章列出全部条目；点异章条目后 URL 为 `…&ch=<c>#hl-<id>`，`#rdr-main` 滚到该 mark（mark 顶部距 `#rdr-main` 顶部 ≤ 40px），并出现 `rdr-anchor-hit`。
4. 删除后 5 秒内点撤销，服务端无 DELETE 请求；不撤销则 GET 不再返回该条。
5. 面板打开时按 ←/→ 不翻章。

### P4：漂移恢复（L2–L5）、自愈、孤儿与模糊确认

验收：
1. 夹具单测：用 `177dd41^`、`177dd41` 两版第十章和讨论课件（加工作区版第十章）作为固定夹具，复现 §3.6 的分级分布；在真值核对下 L1–L3 **0 例错位**、**0 例误判孤儿**；另外补充跨块选区用例。
2. Playwright 用 `page.route` 把章节 md 替换为修订版：预置的 3 条高亮分别落入 moved（且已自动 PUT 新 anchor，`rev` 更新）、fuzzy（虚线，面板"待确认"）、orphan（不渲染，面板"无法定位"）。
3. "确认新位置"后 quote 与 anchor 更新，刷新后显示为 exact；孤儿"重新定位"后显示正常。

### P5：打磨

内容：复制处理（`copy` 事件中当选区含 mark 时改写 `text/html` 去掉 mark，`text/plain` 不变）、打印样式、四主题对比度、移动端底部抽屉与软键盘、a11y（键盘可达、`aria-*`）。可选：导出本书笔记为 Markdown。

验收：
1. 复制含高亮的段落粘贴到富文本编辑器，没有底色（剪贴板 `text/html` 不含 `<mark`）。
2. 打印预览中没有工具条和面板，高亮可辨。
3. 四主题下五色的对比度脚本全部 ≥ 4.5:1。
4. iPhone 尺寸（390×844）Playwright 模拟触屏选区时，工具条出现在选区下方，浮层为底部抽屉。

---

## 8. 风险、坑与边界情况

| # | 风险或边界 | 影响 | 对策 |
|---|---|---|---|
| R1 | 有人用旧脚本或在别的目录部署博客，Functions **再次静默消失**（即 P0 事故） | 登录与笔记全挂 | 唯一入库脚本 + 部署后 `/api/health` 自检；`.memory` 记坑 P-005；废弃 `deploy_site.sh` |
| R2 | `functions/` 双项目部署导致版本漂移 | 两域行为不一致 | 改动 `functions/` 后两个项目都发布；`/api/health` 可加 `version` 字段（可选） |
| R3 | 内容发布顺带发布未审阅的后端改动（`--commit-dirty=true`） | 生产引入半成品 API | 脚本守卫：`functions/`、`migrations/` 及配置不干净就拒绝 |
| R4 | 博客项目开始持有 DB 和密钥，与 07-16 分离决策相悖 | 攻击面扩大 | 路由白名单 + 独立 `JWT_SECRET` + ADR-011 记录 |
| R5 | `rateLimit` 每次写操作产生 1 次 KV 读和 1 次 KV 写（⚠ 账户计划与配额待核实） | 配额耗尽后限流失效或报错 | 客户端防抖与队列折叠；监控用量；必要时换成 D1 计数或 CF 原生限流 |
| R6 | 读者注册即获得 `student` 角色（`signup.js` 硬编码） | 课程后台出现大量"学生" | 产品确认；如需区分，另立需求加 `reader` 角色 |
| R7 | 跨段落、跨表格单元格选区；选区延伸到章节标题、目录或课件栏 | 越界高亮 | 与 body 求交；只包文本节点；章节标题不可标注 |
| R8 | `mark` 嵌套或重叠 | 点击歧义 | 内层优先；面板可达全部条目 |
| R9 | 选区过短（1 字）或文本高度重复（讨论课件模板） | 漂移后歧义 | 建议至少 2 字；prefix/suffix 消歧；L2 汇总打分（仿真 0 错位） |
| R10 | 选区过长 | 存储膨胀 | `MAX_QUOTE=5000` 前后端都校验 |
| R11 | 改稿导致锚点失效 | 高亮错位或丢失 | 五级恢复；fuzzy 需确认；孤儿不删；仿真 97.1% 恢复、0 错位 |
| R12 | **manifest 章节 id 或书目录改名**（manifest 为手工维护，见 S-008） | 该章或该书全部标注不可达 | 约定"章节 id 视同永久链接"；确需改名时，用迁移 SQL `UPDATE reader_annotations SET chapter_id=…` 同步，写进 conventions |
| R13 | marked 升级改变 DOM 或空白 | `rev` 全部变化 | L2/L3 自动恢复并自愈；升级前用夹具单测回归 |
| R14 | 复制带出高亮底色（富文本粘贴） | 体验 | P5 的 `copy` 处理 |
| R15 | 打印时背景被丢弃 | 高亮不可见 | `print-color-adjust` + 底边框兜底 |
| R16 | 四主题对比度（尤其深色）；UA 默认 `mark{color:black}` | 可读性 | `color: inherit`；P5 对比度脚本 |
| R17 | 移动端原生选区菜单遮挡；iOS 的 `selectionchange` 时序；软键盘遮挡浮层 | 交互 | 触屏时工具条放下方；`selectionchange` 防抖；底部抽屉 + `visualViewport` 调整 |
| R18 | 多标签或多设备同时编辑同一笔记 | 后写覆盖先写 | 明示 LWW；PUT 幂等 |
| R19 | token 7 天过期发生在编辑途中；同一浏览器切换账号 | 丢写或串号 | 401 保留队列并重新登录；队列按 userId 分区；访客草稿上传前确认 |
| R20 | 笔记或 quote 注入 | XSS | 一律 `textContent`；服务端只存纯文本 |
| R21 | `reader_last_page` 记录了带 `#hl-` 的 URL | "继续阅读"跳到该高亮 | 可接受（当作书签）；如不想要，记录前去掉 hash |
| R22 | 大章节（`guide.md` 约 14 万字）全量重建模型 | 性能 | O(n)；P2 实测要求 < 50ms；局部更新不重建 |
| R23 | 既有缺陷：`loadDraft` 未定义；`user.id` 实为 `undefined` 导致课件草稿跨账号共享 | 课件笔记离线兜底失效且有串号隐患 | P0 可选修复（需确认） |
| R24 | `.dev.vars` 不在 `.gitignore` 中（根目录目前也没有该文件） | 本地 `JWT_SECRET` 被误提交 | 建立本地联调时先把 `.dev.vars` 加进 `.gitignore` |
| R25 | 软删除墓碑保留了内容 | 隐私 | 30 天保留期，之后手工清理 SQL（§4.2），写进隐私说明 |
| R26 | 非安全上下文（局域网 http）下没有 `crypto.randomUUID` | 本地预览报错 | 改用 `getRandomValues` 拼 v4；`rev` 用同步哈希 |

---

## 9. 测试与验收方案

### 9.1 单元测试（vitest，沿用 `tests/` 现有模式；先 `npm ci`，仓库目前没有 `node_modules`）

- `tests/migrations/016-reader-annotations.test.js`（参照 `015-courseware-notes.test.js`）：列齐全；`created_at` 默认值匹配 `/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/`；删除用户时级联删除；同一 id 再次 INSERT 被拒。
- `tests/api/reader/annotations.test.js`（参照 `tests/api/courseware/notes.test.js` 的 `setupTestDB` + `signJWT` + `makeCtx`）：
  - 401（无 token 或坏 token）
  - PUT 新建 201，GET 本章 1 条，GET 全书 1 条
  - 同 id 再 PUT 200，内容已更新，记录数不变
  - 跨用户：u2 看不到 u1 的条目；u2 PUT 或 DELETE u1 的 id 返回 404
  - DELETE 200 后再 DELETE 200（幂等），PUT 已删 id 返回 410，GET 不再返回
  - 400：非 UUID、坏 book/chapter、非法 color、quote 为空或过长、note 过长、anchor 缺字段或超 4096 字节、book/chapter 与已有记录不一致
  - 403：配额（测试中把上限常量置低，或预插 N 行）
  - 时间戳为 ISO 格式
- `tests/frontend/reader-annotations.test.js`（参照 `reader-auth.test.js`，在 happy-dom 中 `eval` 经典脚本，通过 `_internal` 测纯逻辑）：
  - 夹具 HTML 由仓库 `marked.min.js` 现场渲染（含 `li>p`、表格、`blockquote`、正文 `h1`、段内软换行）
  - `buildModel` 的块数与文本符合预期
  - `anchorFromRange` → `resolveAnchor` 往返，跨块选区命中 L1
  - P4 加入 §3.6 的真实改稿夹具，断言分级分布与 0 错位
  - `applyMarks` 重复调用后 `innerHTML` 不变，`clearMarks` 后与原始 HTML 相同

  ⚠ 待核实：happy-dom 对 `Range` 活动边界和 `splitText` 的实现是否完整。若不足，DOM 包裹部分只在 Playwright 中验证，单测只覆盖模型与解析。

### 9.2 `python3 -m http.server`（纯静态、无 API：验证不回归和降级行为）

```bash
cd brianinchrist && python3 -m http.server 8000
# http://localhost:8000/organicchurch/library/reader.html?book=lordship_gospel&ch=11
```

要验证的点：
- 三本书阅读、翻章、主题、字号、行宽、深链 `#h3-…` 均正常，控制台 0 报错。
- 选区工具条出现，点色点后弹出登录窗；登录会失败，此时提示应为"服务暂不可用"而不是"未登录"。
- 访客草稿写入并在刷新后保留。
- 无高亮时 `.rdr-chapter-body` 的 `innerHTML` 与基线一致。

### 9.3 `wrangler pages dev`（本地全链路：静态 + Functions + 本地 D1/KV）

```bash
# 仓库根执行：cwd/functions 会被加载；绑定取根 wrangler.toml（DB / USERS_KV 的本地模拟）
printf 'JWT_SECRET=dev-only-secret\nENVIRONMENT=dev\n' > .dev.vars      # 先把 .dev.vars 加进 .gitignore（R24）
for f in migrations/0*.sql; do npx wrangler d1 execute brianinchrist-db --local --file="$f"; done
npx wrangler pages dev brianinchrist --port 8789
# http://localhost:8789/organicchurch/library/reader.html?book=oikos_church&ch=07
```

> ⚠ 待核实：根目录 `wrangler.toml` 的 `pages_build_output_dir = "course-app"` 与位置参数 `brianinchrist` 同时存在时，`pages dev` 是否以位置参数为准（`deploy` 是以位置参数为准，已核实）。如果不是，就照 §2.6-5 的做法建临时目录启动。另外，本地 `_routes.json` 白名单应同样生效：`/api/modules/*` 应返回 HTML。

要验证的点：注册、登录，高亮与笔记的完整 CRUD，跨"设备"同步（两个浏览器 profile），离线队列，401 后重新登录再 flush，429（临时把 `ENVIRONMENT` 去掉，再快速连续写）。

### 9.4 Playwright（沿用 `drafts/oikos_lectures/verify_*.cjs` 的 ad-hoc 惯例）

更正背景信息：仓库**根目录**只有 `scratch_retake_test.mjs`，`verify_*.cjs` 都在 `drafts/oikos_lectures/`（未入库），它们 `require` 的是 `/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core`，并调用系统 Chrome。新脚本 `scripts/verify_reader_annotations.cjs` 建议入库：优先 `require('playwright')`（`npm ci` 后由 `@playwright/test` 提供），失败时回退到同一路径的 hermes 版本；`BASE` 由环境变量传入（本地 8789 或生产）。现有 `playwright.config.js` 的 webServer 固定为 `course-app`，不适用于本场景，所以不改它。

场景清单（每项输出 PASS/FAIL 汇总，失败时退出码为 1）：
1. **锚点契约回归**：遍历三本书全部章节，抓取 `.rdr-chapter-body h2,h3,h4` 的 id，与改动前生成的基线 JSON 逐一比对，要求 0 差异。
2. 用 API 注册测试账号并把 token 写入 `localStorage`。
3. 每本书取一章：用 `document.createRange` 选中跨两段的文本 → 点黄色 → 断言 mark 片段数 ≥ 2 → 刷新 → 断言 mark 文本等于 quote。
4. 幂等：`refresh()` 3 次，`innerHTML` 哈希不变。
5. 笔记：点 mark → 输入 → 等 1s → 新开 context 打开同章 → 笔记一致。
6. 深链：`…#hl-<id>` → `#rdr-main` 滚动到位，并出现 `rdr-anchor-hit`。
7. 访客：清 token → 选区 → 点色点 → 断言 `#ra-modal` 可见 → 关闭 → 刷新 → 访客草稿仍在。
8. 离线：`page.route('**/api/reader/**', r => r.abort())` → 改笔记 → 断言队列 key 存在 → `unroute` → `dispatchEvent(new Event('online'))` → 队列清空。
9. 漂移（P4）：`page.route` 用修订版替换章节 md → 断言 exact、moved、fuzzy、orphan 四种状态各就其位。
10. 全程收集 `pageerror` 和 `console.error`，必须为 0。
11. 收尾：DELETE 掉测试数据。

### 9.5 生产冒烟（每次部署后）

```bash
curl -s -w '\n%{http_code} %{content_type}\n' https://jiadongli.online/api/health          # 200 application/json, status ok
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://jiadongli.online/api/modules/books   # 200 text/html（白名单外）
BASE=https://jiadongli.online node scripts/verify_reader_annotations.cjs                     # 使用专用测试账号
```

---

## 10. 明确不做（YAGNI）

- 高亮或笔记的分享、公开、班级可见（`highlights` 表那套语义）；评论回复。
- 实时多设备合并（CRDT 或 OT）；冲突提示 UI（维持 LWW）。
- 笔记富文本或 Markdown 渲染（只存纯文本）；全文搜索；标签。
- 旧 `book2/`、课程系统 `course-app/reader/` 的高亮。
- 服务端校验 book/chapter 是否真实存在（只做格式校验，与 `notes.js` 一致）。
- 导出（列为 P5 可选项，不在验收范围）。

---

## 11. 待核实项汇总（⚠）

| # | 事项 | 如何核实 |
|---|---|---|
| V1 | `brianinchrist-site` 的 Functions 何时消失（推测为 2026-10-02 `deploy_site.sh` 从 `/tmp/cfdeploy` 部署所致）；该项目是 Direct Upload 而非 Git 集成 | CF 控制台 → Pages → brianinchrist-site → Deployments（本机 wrangler 未登录） |
| V2 | Pages 项目改由配置文件管理后，控制台绑定变为只读的具体表现 | 首次按 A′ 部署后在控制台确认 |
| V3 | `_routes.json` 的 `/api/reader/*` 能否匹配多段路径 | P1 验收第 4 条 curl |
| V4 | CF 账户计划与 KV 写配额（`rateLimit` 成本） | 控制台 → Workers & Pages → Plans / KV 用量 |
| V5 | `wrangler pages dev <dir>` 与根 `wrangler.toml` 的 `pages_build_output_dir` 的优先级 | 本地执行一次 |
| V6 | happy-dom 的 `Range`、`splitText` 保真度 | P2 编写单测时验证 |
| V7 | 方案 C：Worker 子请求的 `CF-Connecting-IP` 取值；`jiadongli.online` 的 zone/DNS 托管方 | 仅在重新评估 C 或 B 的自定义域名时需要 |
| V8 | `learn.organicchurch.dpdns.org`：TLS 握手失败（2026-10-03 实测 curl exit 35），域名配置状态 | 仅方案 B 需要 |
| V9 | 大章节全量重建模型的耗时 | P2 Performance 实测 |

## 12. 需要用户拍板的决策

1. **后端落点**：A′（推荐），还是 B？（决定 ADR-011 的最终状态。）
2. 是否先把已上线但未提交的阅读器基线（`aidFor/extras/manifest` 等）**提交**？
3. P0 是否顺带修复 §1.4 的两处课件笔记缺陷（`loadDraft` 未定义；`user.id` 实为 `undefined` 导致草稿跨账号共享）？
4. 博客项目的 `JWT_SECRET` 是否与 courses **分开**（推荐分开）？
5. 读者在阅读器注册即成为课程系统的 `student`：可以接受吗？
6. 软删除墓碑的保留期定为 30 天，可以吗？
