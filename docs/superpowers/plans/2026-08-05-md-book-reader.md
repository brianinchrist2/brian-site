# MD 在线阅读器实施计划（2026-08-05）

## Context / 背景

- 已批准设计文档：`docs/superpowers/specs/2026-08-05-md-book-reader-design.md`
- 目标：在 `brianinchrist/organicchurch/books/` 下实现**全新独立**的 `reader.html` 阅读器 —— 书籍内容以 MD 存储，manifest 描述书籍结构，客户端 marked.js 渲染，**零构建步骤**（用户明确选择）。
- **架构红线（用户明确要求）**：新阅读器是**独立重设计**，**不改造、不复制、不复用旧系统任何实现**（旧 `lordship_gospel/assets/js/reader.js`、`assets/css/reader.css`、`book2/*.html` 及其内联脚本全部**原样保留、零修改**）。新阅读器自带全新的 CSS/JS，避免"改造不到位导致旧系统崩溃"。
- 首个迁移书籍：`lordship_gospel`（主权福音与传福音）—— 18 个章节 MD 从仓库根 `lordship_gospel/` 移入部署树 `book2/`，生成 `manifest.json`。
- 旧静态页面（`book2/*.html`、`guide.html` 等）**保留不动**，作为过渡期并存。

## 验收标准（来自 spec，执行时逐条核对）

1. `reader.html?book=lordship_gospel` 显示封面与完整目录（按 part 分组）。（spec AC1）
2. 点任意章节正确渲染 MD（标题/加粗/列表/分隔线/反思练习有序列表），中文无乱码。（spec AC2）
3. 上/下一章、目录跳转、侧栏当前章高亮正确。（spec AC3）
4. 三主题/字号/版宽切换生效且刷新后保持（localStorage 持久化）。（spec AC4）
5. 进度条与回到顶部工作；离开后经封面「继续阅读」可回到上次章节与位置。（spec AC5）
6. `books/index.html` 中「中文本」按钮可点击进入 `reader.html?book=lordship_gospel`。（spec AC6）
7. 投放新书步骤验证：复制一份最小 manifest + 单章 MD 到测试目录，`reader.html?book=<测试id>` 可用。（spec AC7）
8. 顶部栏显示**书名**（manifest.title，旧页为「主权福音」）；存在 `courseware` 时显示「互动课件」按钮 `courseware/chapter.html?c=<cw>`。
9. 本地 `python3 -m http.server` 全流程走查通过（无 404、无控制台错误）。

## 文件结构（迁移前后）

### 迁移后目标结构（新增/移动）

```
brianinchrist/organicchurch/books/
├── reader.html                                  # 新增：全新独立阅读器（单文件）
├── assets/                                      # 新增：共享静态资源（全新文件，非旧系统复制品）
│   ├── css/reader.css                           # 新增：全新设计稿（独立实现，与旧 reader.css 无共享）
│   └── js/
│       ├── reader.js                            # 新增：全新实现（独立，不读取/不修改旧 reader.js）
│       └── marked.min.js                        # 新增：vendored marked@12.0.2（35479 B）
└── lordship_gospel/
    ├── manifest.json                            # 新增：由 gen_manifest.py 生成
    ├── manuscript/                              # 新增：书稿规范目录（唯一数据源）
    │   ├── 00_绪论_速成福音的危机与反思.md        # git mv 自旧 book2/（原仓库根 lordship_gospel/）
    │   ├── 01_第一章_福音的视角_从人的需要到神的计划.md
    │   ├── …（共 18 个章节 MD）
    │   ├── 摘要.md                              # git mv 自仓库根 lordship_gospel/
    │   └── 讨论课件.md                          # git mv 自仓库根 lordship_gospel/
    ├── tools/gen_manifest.py                    # 新增：manifest 生成器（读取 manuscript/）
    ├── tests/test_gen_manifest.py               # 新增：unittest
    └── book2/                                   # 旧系统目录：仅剩 *.html 与旧 assets，原样保留
```

> **旧系统零接触红线**：`lordship_gospel/assets/js/reader.js`、`lordship_gospel/assets/css/reader.css`、所有 `book2/*.html`（含内联脚本）在本次工作中**不得读取逻辑用于实现、不得复制、不得修改**。新阅读器不引用它们，旧页面继续引用原路径。

### 不动清单（用户未提交改动 / 不在本计划范围）

- 仓库根 `lordship_gospel/摘要.md`、`lordship_gospel/讨论课件.md` —— **不移动、不修改**（未提交，属用户工作）。
- 仓库根 `lordship_gospel/*.md` 中**只有** 18 个章节文件（00–17）执行 `git mv`。
- `book2/chapter{01,02,03,05,07}.html`、`guide.html`、`introduction.html` 等旧页面 —— 不动。
- `scripts/convert_lordship_gospel.py`、`courseware/assets/` 改动、`backups/`、`scratch/`、`login-page-snapshot.md`、`opencode.json` —— 一律不触碰。
- 不删除任何旧文件；`reader.css` 源文件保留原位（复制而非移动）。
- 提交时只 `git add` 本计划创建/修改的文件，绝不含未提交用户文件。

> **spec 偏差说明（已核证）**：spec「一次性迁移步骤 2」写"章节清单从现有文件名 + `generate_book.py` 的 CHAPTERS 表提取"——但核证发现 `lordship_gospel/assets/tools/generate_book.py` 内的 CHAPTERS 属**另一本书**（家教会的本体论革命），不可用。本计划改用 `courseware/assets/data/courseware.json` 作为章节 id/分部权威来源（与旧页面 TOC/侧栏一致，已逐章比对）。

## CHAPTERS 表（权威清单，gen_manifest.py 数据源）

来源：`brianinchrist/organicchurch/books/lordship_gospel/courseware/assets/data/courseware.json`（分部结构 + 章节 id + 回退标题）+ 仓库根 MD 文件名 + **MD 首行 `# 标题`（manifest title 主来源，符合"MD 为唯一内容源"，与 spec manifest 示例的冒号式标题一致）**。章节排序按书籍顺序（00→17）。

| id | cw (courseware id) | 章节标题（courseware.json，参考） | MD 文件（book2/ 内） |
|----|--------------------|---------------------------|----------------------|
| 00 | introduction | 绪论 速成福音的危机与反思 | 00_绪论_速成福音的危机与反思.md |
| 01 | chapter01 | 第一章 福音的视角——从人的需要到神的计划 | 01_第一章_福音的视角_从人的需要到神的计划.md |
| 02 | chapter02 | 第二章 福音的锚点——你的神做王了 | 02_第二章_福音的锚点_你的神做王了.md |
| 03 | chapter03 | 第三章 十字架与复活——得胜做王的记号与凭证 | 03_第三章_十字架与复活_得胜做王的记号与凭证.md |
| 04 | chapter04 | 第四章 在主权中的赦罪与悔改 | 04_第四章_在主权中的赦罪与悔改.md |
| 05 | chapter05 | 第五章 信心的实质——效忠于所信的王 | 05_第五章_信心的实质_效忠于所信的王.md |
| 06 | chapter06 | 第六章 效忠与婚约——信仰关系的两个类比 | 06_第六章_效忠与婚约_信仰关系的两个类比.md |
| 07 | chapter07 | 第七章 跟随耶稣——加入使命的共同体 | 07_第七章_跟随耶稣_加入使命的共同体.md |
| 08 | bridging | 承转章 从认识福音到传扬福音 | 08_承转章_从认识福音到传扬福音.md |
| 09 | chapter08 | 第八章 福音宣告与见证——传福音的本质 | 09_第八章_福音宣告与见证_传福音的本质.md |
| 10 | chapter09 | 第九章 领人归主的四个阶段 | 10_第九章_领人归主的四个阶段.md |
| 11 | chapter10 | 第十章 传福音的策略——恩典、宣讲与寻找 | 11_第十章_传福音的策略_恩典宣讲与寻找.md |
| 12 | chapter11 | 第十一章 圣灵的能力与传福音的祷告 | 12_第十一章_圣灵的能力与传福音的祷告.md |
| 13 | chapter12 | 第十二章 个人布道实操——三个故事与两个范例 | 13_第十二章_个人布道_三个故事与两个范例.md |
| 14 | chapter13 | 第十三章 小组布道与福音小组 | 14_第十三章_小组布道与福音小组.md |
| 15 | chapter14 | 第十四章 常见误区与反思 | 15_第十四章_常见误区与反思.md |
| 16 | conclusion | 结语 重价的福音，真正的门徒 | 16_结语_重价的福音与真正的门徒.md |
| 17 | appendix | 附录 效忠与历史神学的对话 | 17_附录_效忠与历史神学的对话.md |

- 共 18 章、6 部（绪论 / 第一部分 认识主权福音 / 承转 / 第二部分 传扬主权福音 / 结语 / 附录）。
- courseware.json 中第 7 部「学习资源」(guide = 讨论课件) **不进入 manifest**（对应 `讨论课件.md` 未迁移）。

## manifest.json 契约（gen_manifest.py 输出）

```json
{
  "id": "lordship_gospel",
  "title": "主权福音与传福音",
  "subtitle": "The Lordship Gospel",
  "desc": "从圣经神学重新认识福音——福音不是关于你需要的叙事，而是关于神掌权的宣告。",
  "lang": "zh-CN",
  "stat": "全书 18 章 · 六部 · 约 8 万字",
  "courseware": "courseware/chapter.html",
  "parts": [
    { "part": "绪论", "chapters": [
      { "id": "00", "title": "绪论：速成福音的危机与反思", "file": "manuscript/00_绪论_速成福音的危机与反思.md", "cw": "introduction" }
    ]},
    { "part": "第一部分 认识主权福音", "chapters": [ … ] },
    { "part": "承转", "chapters": [ … ] },
    { "part": "第二部分 传扬主权福音", "chapters": [ … ] },
    { "part": "结语", "chapters": [ … ] },
    { "part": "附录", "chapters": [ … ] }
  ]
}
```

- **part 键名按 spec 为 `"part"`**（非 `"title"`）；章节对象含 `id/title/file`（spec 契约）+ `cw`（**计划扩展字段**：courseware 按钮需 `?c=<cw>` 拼接，旧页链接如 `chapter.html?c=chapter01`；spec 契约未列但投放必需）。
- 章节 `title` 取自 **MD 首行 `# ` 标题（冒号式）**，回退 courseware.json 标题；分部标题取自 courseware.json（空格式），与旧页侧栏一致。
- 路径语义：`file` 相对书籍目录（`lordship_gospel/manuscript/…`）；`courseware` 相对书籍目录（`lordship_gospel/courseware/chapter.html`）；reader.html 位于 `books/`，fetch 前缀用 `book` 参数拼接。

## 任务清单

> 执行顺序依赖：T1 → T2 → (T3 与 T4 可并行) → T5 → T6 → T7 → T8。
> 每任务给出：目标 / 步骤 / 验证。测试先行（TDD）适用于 T4（Python）与 T5（JS 走查）。

---

### Task 1：vendor marked@12.0.2 到共享 assets

**目标**：`brianinchrist/organicchurch/books/assets/js/marked.min.js` 就位（本地自托管，零 CDN 依赖）。

**步骤**：
1. 确认目标目录 `books/assets/js/` 存在（不存在则创建）。
2. 下载 https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js 到目标文件（35479 字节）。
3. 文件顶部保留 marked 自带版本 banner（`marked v12.0.2`），不要改写。

**验证**：
```bash
node -e "const m = require('./brianinchrist/organicchurch/books/assets/js/marked.min.js'); console.log(typeof m.parse, m.parse('# hi').trim());"
# 期望输出: function <h1>hi</h1>
```

---

### Task 2：全新编写 books/assets/css/reader.css（独立设计）

**目标**：`brianinchrist/organicchurch/books/assets/css/reader.css` 是**全新设计稿**——非旧 `lordship_gospel/assets/css/reader.css` 的复制品，两者零共享、零引用关系。

**步骤**：
1. 删除之前误复制的旧 CSS（`books/assets/css/reader.css`，来源为旧系统文件）。
2. 从零编写新 `books/assets/css/reader.css`，实现全新阅读器设计系统：
   - 设计语言自定（可继承站点 Scriptorium 暖色基调做视觉一致性，但代码完全独立）；
   - 覆盖：封面/目录、章节正文排版（标题/段落/加粗/引用/分隔线/有序列表/代码块）、顶部栏、侧边栏目录、设置面板（三主题/字号/版宽）、进度条、回到顶部、章节导航、响应式；
   - 类名独立命名，不与旧页面 class 混用。
3. 不引用、不复制旧 CSS 任何规则。

**验证**：新 CSS 文件与旧文件字节不同（`python -c "… 比较"` 输出 MISMATCH 即符合预期）；本地打开新阅读器视觉正常（见 Task 8）。

---

### Task 3：git mv 全部书稿 MD 进 manuscript/（规范数据源）

**目标**：按用户方向「先要整理完整的md书稿，放在规范的目录中，作为数据源」，将仓库根 `lordship_gospel/NN_*.md`（00–17 章节）+ `摘要.md` + `讨论课件.md` 全部移入 `brianinchrist/organicchurch/books/lordship_gospel/manuscript/`，保留 git 历史。`manuscript/` 成为唯一书稿数据源。

**步骤**：
1. 创建 `books/lordship_gospel/manuscript/` 目录。
2. 按 CHAPTERS 表逐一执行（共 18 个章节）：
   `git mv "lordship_gospel/00_绪论_速成福音的危机与反思.md" "brianinchrist/organicchurch/books/lordship_gospel/manuscript/00_绪论_速成福音的危机与反思.md"`（其余 17 个同理，文件名按表逐字一致）。
3. 移动 `摘要.md`、`讨论课件.md`（保持其未提交的用户修改内容不变）。

**验证**：
```bash
git status --short | grep -E '\.md'   # 期望: 20 条 R (renamed) → manuscript/，book2/ 下无 .md
# 期望: manuscript/ 下 20 个 .md（18 章节 + 摘要 + 讨论课件）
```

---

### Task 4：gen_manifest.py（TDD）+ 生成 manifest.json

**目标**：`brianinchrist/organicchurch/books/lordship_gospel/tools/gen_manifest.py` 读取 courseware.json 与 manuscript/*.md，输出契约一致的 `manifest.json`；`tests/test_gen_manifest.py` 全绿。

**步骤（测试先行）**：
1. 先写 `tests/test_gen_manifest.py`（unittest），覆盖：
   - 读取真实 courseware.json → 输出的 parts 数 = 6、章节总数 = 18；
   - 每章字段完整性：id/title/file/cw 均非空，file 指向存在的 MD；
   - id 顺序 00→17；每部 **`part` 键**与 courseware.json 分部标题一致（跳过「学习资源」部）；
   - 章节 `title` 取自 MD 首行 `# ` 标题（冒号式，如 00 → `绪论：速成福音的危机与反思`），courseware 标题作回退；
   - `courseware` 顶层字段 = `"courseware/chapter.html"`；id/title/subtitle/desc/lang/stat 顶层字段正确；
   - 输出 JSON 可被 `json.loads` 解析且 `ensure_ascii=False`（中文不转义）。
2. 实现 `gen_manifest.py`：
   - 用 `pathlib.Path`；`BOOK_DIR = Path(__file__).resolve().parents[1]`（= `…/books/lordship_gospel`）；
   - 读 `BOOK_DIR / "courseware/assets/data/courseware.json"` 拿分部标题 + 每章 courseware 标题 + cw；
   - 内置 CHAPTERS 映射（id ↔ cw，18 行，见上表）；
   - 对每章：`file = f"manuscript/{id}_*.md"` 用 glob 精确匹配唯一文件（找不到或多匹配则抛错）；
   - 章节 `title`：读 MD 首行，若以 `# ` 开头则去掉前缀（冒号式）；否则回退 courseware 标题；
   - 按 courseware.json parts 顺序组装 `parts`（键名 `"part"`），跳过「学习资源/guide」；
   - 顶层元数据硬编码：id/title/subtitle/desc/lang/stat/courseware；
   - 输出 `json.dumps(data, ensure_ascii=False, indent=2)` 写 `BOOK_DIR / "manifest.json"`。
3. 运行测试 → 全绿后生成 manifest.json。

**验证**：
```bash
python -m unittest discover -s brianinchrist/organicchurch/books/lordship_gospel/tests -p "test_*.py" -v
python brianinchrist/organicchurch/books/lordship_gospel/tools/gen_manifest.py
python -c "import json; d=json.load(open('brianinchrist/organicchurch/books/lordship_gospel/manifest.json',encoding='utf-8')); print(d['id'], len(d['parts']), sum(len(p['chapters']) for p in d['parts']))"
# 期望: lordship_gospel 6 18
```

---

### Task 5：全新编写 books/assets/js/reader.js（独立实现）

**目标**：`brianinchrist/organicchurch/books/assets/js/reader.js` 为**全新实现**——不读取旧 `lordship_gospel/assets/js/reader.js` 的逻辑，不复用其代码，二者零共享。旧 reader.js 原样保留供旧页面继续使用。

**功能清单（独立实现）**：
1. **manifest 加载**：`fetch(book + '/manifest.json')`，失败显示错误提示。
2. **封面渲染**（无 `ch` 参数）：主标题/副标题/desc/stat + 按 parts 分组的目录 + 「开始阅读」入口（指向首章）+ 继续阅读入口（localStorage 记录上次章节）。
3. **章节渲染**（有 `ch` 参数）：`fetch(book + '/' + chapter.file)` → `marked.parse(md)` → 注入正文；MD 首个 `h1` 为正文章节标题。
4. **阅读设置持久化**：三主题（`data-theme`）/ 字号步进 / 版宽三档 → localStorage 存取，刷新保持。
5. **进度条 + 回到顶部**：滚动时更新；`#topbar-title` 显示书名（manifest.title）。
6. **侧边栏目录**：按 parts 分组渲染所有章节，当前章高亮；点击跳转。
7. **章节导航**：上一章/下一章按 parts 线性顺序，首/末章边界禁用。
8. **滚动位置恢复**：切章返回时恢复上次滚动位置（以 `book + '_' + ch` 为 key）。
9. **互动课件按钮**：manifest 存在 `courseware` 且章节有 `cw` 时显示，href = `book + '/' + manifest.courseware + '?c=' + chapter.cw`。
10. **代码风格**：纯 ES 模块风格（IIFE 或普通脚本），无依赖，`node --check` 通过。

**验证（走查前置）**：`node --check` 语法通过；本地服务器打开封面与章节页均正常（见 Task 8）。

---

### Task 6：创建 books/reader.html

**目标**：单文件全新阅读器外壳，无外部依赖（除共享 assets 与 Google Fonts）；标记结构独立设计，不复用旧页 class/id。

**结构（全新标记约定）**：
- `<head>`：字体 preconnect + Noto Serif SC / Noto Sans SC / EB Garamond（与站点基调一致）；`<link rel="stylesheet" href="assets/css/reader.css">`；内联主题预应用脚本（读取 localStorage 的 `reader_theme/reader_font/reader_measure` 立即设 CSS 变量 + `data-theme`，防闪烁）。
- body 骨架（类名独立，见 Task 5 功能清单对应）：进度条、侧边栏目录（分组渲染）、正文容器（封面 or 章节）、顶部栏（菜单按钮 / 书名 / 章节导航：prev/next/课件）、设置按钮 + 设置面板（字号/版宽/主题）、回到顶部、页脚章节导航。
- 封面模式（`?book=X` 无 `ch`）：书名/副标题/desc/stat + 分组目录 + 开始阅读 + 继续阅读。
- 脚本：`assets/js/marked.min.js` + `assets/js/reader.js`（无内联业务逻辑，仅初始化调用）。

**引导逻辑（内联初始化，放在两脚本之后）**：
1. 解析 `location.search`：`book`、`ch`（book 缺失 → 错误提示）。
2. `fetch(book + '/manifest.json')`（book 相对 books/，如 `lordship_gospel/manifest.json`）→ 失败显示错误提示。
3. 无 `ch` → 封面渲染（调用 Task 5 导出函数）；「开始阅读」href = `reader.html?book=<id>&ch=<首章id>`；「继续阅读」指向上次章节。
4. 有 `ch` → 章节渲染（调用 Task 5 导出函数）；顶部栏书名 = manifest.title；构建 prev/next（parts 线性序）；课件按钮按 cw 拼接。
5. 首章无 prev、末章无 next（disabled 样式）；侧边栏当前章高亮；页脚「回封面」href = `reader.html?book=<id>`。

**验证**：本地服务器打开三种 URL 均正常（见 Task 8）。

**验证**：本地服务器打开三种 URL 均正常（见 Task 8）。

---

### Task 7：books/index.html 增加/更新入口

**目标**：`books/index.html` 中「中文本」按钮指向新阅读器。

**步骤**：
1. 把 lordship_gospel 卡片里 `<a href="lordship_gospel/book2/index.html" class="btn btn-primary" ...>中文本...</a>` 的 href 改为 `reader.html?book=lordship_gospel`（保留按钮样式与 SVG）。
2. 「学习讨论手册」（guide.html）按钮**保持原样**。
3. 检查该卡片描述文本（book-desc）与 manifest desc 一致（「从圣经神学重新认识福音——福音不是关于你需要的叙事，而是关于神掌权的宣告。」）。

**验证**：打开 `books/index.html`，点击「中文本」→ 进入封面页。

---

### Task 8：本地全流程走查（验收标准逐条）

**步骤**（`python3 -m http.server` 于仓库根）：
1. `http://localhost:8000/brianinchrist/organicchurch/books/reader.html?book=lordship_gospel` → 封面 + 完整目录按 part 分组（AC1）。
2. 封面目录点任意章节 → 章节页正确渲染（AC2）。
3. 抽查 3 个代表性章节：绪论(00)、第 8 章(09)、结语(16) → 正文/标题/加粗/列表/分隔线/反思练习有序列表，中文无乱码（AC2）。
4. 顶部栏显示**书名**「主权福音与传福音」；设置面板改字号/行宽/三主题 → 刷新后保持（AC4 + AC8）。
5. 滚动 → 进度条增长、back-to-top 出现；切换章节再回 → 滚动位置恢复（AC5）。
6. 侧边栏目录跳转 + 当前章高亮；上一章/下一章边界正确；互动课件按钮 → `lordship_gospel/courseware/chapter.html?c=<cw>`（AC3 + AC8）。
7. `books/index.html` → 中文本按钮进入阅读器封面（AC6）。
8. **投放新书验证（spec AC7）**：临时建 `books/_ac7_test/manifest.json`（最小：1 部 1 章）+ `manuscript/00_测试.md`，`reader.html?book=_ac7_test` 封面与章节均可用 → 删除临时目录。
9. 浏览器控制台无报错；无 404（AC9）。

**回归**：旧页面 `book2/chapter01.html`、`book2/index.html` 打开正常（确认 reader.js 适配未破坏旧页）。

---

### Task 9：提交

**目标**：仅提交本计划产物。

**步骤**：
```bash
git add brianinchrist/organicchurch/books/reader.html \
        brianinchrist/organicchurch/books/assets \
        brianinchrist/organicchurch/books/lordship_gospel/manifest.json \
        brianinchrist/organicchurch/books/lordship_gospel/tools \
        brianinchrist/organicchurch/books/lordship_gospel/tests \
        brianinchrist/organicchurch/books/lordship_gospel/manuscript \
        brianinchrist/organicchurch/books/index.html \
        docs/superpowers/plans/2026-08-05-md-book-reader.md
git commit -m "feat: MD 在线阅读器（reader.html + manifest + 共享 assets），lordship_gospel 迁移为 MD 书"
```

**验证**：`git status` 无遗留；`git log -1` 确认；未提交用户文件（摘要/讨论课件 等）不在提交内。

---

## 自查清单（提交前逐条）

- [ ] manifest 契约与 spec 一致（字段名、相对路径语义）。
- [ ] 20 个 MD 全部 `git mv` 成功进 `manuscript/` 且旧页未受影响；`book2/` 下无 .md 残留。
- [ ] **旧系统零接触**：旧 `assets/js/reader.js`、`assets/css/reader.css`、所有 `book2/*.html` 未被修改/复制；新 reader.css / reader.js 为全新实现（字节不同）。
- [ ] 零构建步骤成立：无构建脚本、无 package.json 新增、无 CDN 运行时依赖（marked 已本地化）。
- [ ] 所有新增文件无 `@ts-ignore`/`as any` 类问题（纯 JS/HTML/CSS，语法自检通过）。
- [ ] 验收标准 AC1–AC9 全部过；浏览器控制台无错误。
- [ ] 提交内容仅含本计划文件；未提交用户文件排除在外。

