# MD 在线阅读器实施计划（2026-08-05）

## Context / 背景

- 已批准设计文档：`docs/superpowers/specs/2026-08-05-md-book-reader-design.md`
- 目标：在 `brianinchrist/organicchurch/books/` 下实现**通用** `reader.html` 阅读器 —— 书籍内容以 MD 存储，manifest 描述书籍结构，客户端 marked.js 渲染，**零构建步骤**（用户明确选择）。
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
├── reader.html                                  # 新增：通用阅读器（单文件）
├── assets/                                      # 新增：共享静态资源
│   ├── css/reader.css                           # 复制自 lordship_gospel/assets/css/reader.css
│   └── js/
│       ├── reader.js                            # 复制 + 适配（暴露 reader 模式 hooks）
│       └── marked.min.js                        # 新增：vendored marked@12.0.2（35479 B）
└── lordship_gospel/
    ├── manifest.json                            # 新增：由 gen_manifest.py 生成
    ├── tools/gen_manifest.py                    # 新增：manifest 生成器（迁移脚本）
    ├── tests/test_gen_manifest.py               # 新增：unittest
    └── book2/
        ├── 00_绪论_速成福音的危机与反思.md        # git mv 自仓库根 lordship_gospel/
        ├── 01_第一章_福音的视角_从人的需要到神的计划.md
        ├── …（共 18 个章节 MD，见 CHAPTERS 表）
        └── （旧 *.html 保留不动）
```

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
      { "id": "00", "title": "绪论：速成福音的危机与反思", "file": "book2/00_绪论_速成福音的危机与反思.md", "cw": "introduction" }
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
- 路径语义：`file` 相对书籍目录（`lordship_gospel/book2/…`）；`courseware` 相对书籍目录（`lordship_gospel/courseware/chapter.html`）；reader.html 位于 `books/`，fetch 前缀用 `book` 参数拼接。

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

### Task 2：复制 reader.css 到共享 assets

**目标**：`brianinchrist/organicchurch/books/assets/css/reader.css` == `lordship_gospel/assets/css/reader.css`（799 行 / 23561 B）。

**步骤**：
1. 复制源文件（保留原文件不动）。
2. 字节级校验。

**验证**：
```bash
python -c "from pathlib import Path; a=Path('brianinchrist/organicchurch/books/lordship_gospel/assets/css/reader.css'); b=Path('brianinchrist/organicchurch/books/assets/css/reader.css'); print('MATCH' if a.read_bytes()==b.read_bytes() else 'MISMATCH')"
# 期望: MATCH
```

---

### Task 3：git mv 18 个章节 MD 进部署树

**目标**：仓库根 `lordship_gospel/NN_*.md`（仅 00–17 章节文件）→ `brianinchrist/organicchurch/books/lordship_gospel/book2/`，保留 git 历史。

**步骤**：
1. 按 CHAPTERS 表逐一执行（共 18 个）：
   `git mv "lordship_gospel/00_绪论_速成福音的危机与反思.md" "brianinchrist/organicchurch/books/lordship_gospel/book2/00_绪论_速成福音的危机与反思.md"`（其余 17 个同理，文件名按表逐字一致）。
2. **严禁**移动 `摘要.md`、`讨论课件.md`。

**验证**：
```bash
git status --short lordship_gospel brianinchrist/organicchurch/books/lordship_gospel
# 期望: 18 条 R (renamed)，book2/ 下 18 个 .md 存在；摘要.md / 讨论课件.md 仍留在仓库根
git status --porcelain | grep -E '摘要|讨论课件' | head   # 期望无新增变更（保持用户未提交状态）
```

---

### Task 4：gen_manifest.py（TDD）+ 生成 manifest.json

**目标**：`brianinchrist/organicchurch/books/lordship_gospel/tools/gen_manifest.py` 读取 courseware.json 与 book2/*.md，输出契约一致的 `manifest.json`；`tests/test_gen_manifest.py` 全绿。

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
   - 对每章：`file = f"book2/{id}_*.md"` 用 glob 精确匹配唯一文件（找不到或多匹配则抛错）；
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

### Task 5：适配 reader.js → books/assets/js/reader.js

**目标**：复制 `lordship_gospel/assets/js/reader.js`（135 行）并做**最小适配**，使同一脚本兼容两种页面：(a) 旧章节页（无改动语义）；(b) reader.html（异步注入内容）。

**适配点（全部向后兼容，旧页行为不变）**：
1. **pageKey 抽象**：`var page` 现在取自 pathname 末段。reader.html 中多章共用 `reader.html`，滚动位置 key 会互相覆盖 → 引入 `window.readerPageKey`（如 `"lordship_gospel_01"`），存在则用它替换 `page` 作为 `book_pos_<key>` 与 `reader_last_page` 的 key。
2. **reader_last_page 存完整 URL**：`set('reader_last_page', page)` 改为 `window.readerLastPage ? window.readerLastPage() : page`（reader.html 提供返回完整 `reader.html?book=..&ch=..` 的函数；旧页无该 hook → 行为不变）。
3. **buildOutline 幂等化 + 对外暴露**：`buildOutline` 是 `DOMContentLoaded` 时执行的，reader.html 里此时内容尚未注入。改为：
   - `buildOutline()` 增加幂等守卫（先 `removeEventListener('scroll', spy)` 再 `addEventListener`，或记录已绑定 flag），避免重复绑定 spy；
   - `window.readerBuildOutline = buildOutline` 暴露；
   - `DOMContentLoaded` 里若 `window.readerDeferOutline` 为真则跳过自动调用（由 reader.html 注入后手动调）。
4. **restoreScroll 暴露**：`window.readerRestoreScroll = restoreScroll`（reader.html 注入完成后调用）。
5. **onScroll/setupResume/syncControls 保持原语义**；theme/font/measure 导出 API（`readerSetTheme`/`readerStepFont`/`readerSetMeasure`）原样保留。

**验证（走查前置）**：`node --check` 语法通过；旧章节页（chapter01.html）加载新 reader.js 后行为与原先一致（手工走查：字体/主题/进度条）。

---

### Task 6：创建 books/reader.html

**目标**：单文件通用阅读器，无外部依赖（除共享 assets 与 Google Fonts）。

**结构（复用旧页 class/id 约定，见 chapter01.html / book2/index.html 验证过的标记）**：
- `<head>`：字体 preconnect + Noto Serif SC / Noto Sans SC / EB Garamond（与旧页一致）；`<link rel="stylesheet" href="assets/css/reader.css">`；内联主题预应用脚本（读取 localStorage 的 `reader_theme/reader_font/reader_measure` 立即设 CSS 变量 + `data-theme`，防闪烁）。
- body 骨架：`<div id="progress-bar">`、`#overlay`、`#sidebar`（toc-tree：由 manifest 渲染，`toc-part` + `toc-item`）、`aside#outline`、`<main class="layout">` > `<div class="content">`（封面 or 正文）、顶部栏 `#topbar`（hamburger / `#topbar-title` / 章节导航 `#chapterNav`：prev-btn / next-btn / courseware-btn）+ `#settingsBtn` + `#settingsPanel`（font-stepper / measure seg / theme seg）、`#backToTop`、页脚 `chapter-nav-footer`（`foot-home` + `courseware-footer-btn`）。
- 封面模式（`?book=X` 无 `ch`）：复用 book2/index.html 的封面标记：`cover-hero`、`cover-decoration`、`cover-main-title`、`cover-greek`、`cover-tagline`、`cover-stat`、`cover-toc`（`cover-part-title` + `cover-toc-item` 链接）、`cover-resume`（`#resumeLink`，setupResume 用）、`cover-cta`（开始阅读 →）。
- 脚本：`assets/js/marked.min.js` + `assets/js/reader.js` + 内联引导脚本。

**引导脚本逻辑（内联，放在两脚本之后）**：
1. 解析 `location.search`：`book`、`ch`（book 缺失 → 错误提示）。
2. `fetch(book + '/manifest.json')`（book 相对 books/，如 `lordship_gospel/manifest.json`）→ 失败显示错误提示。
3. 无 `ch` → 渲染封面：主标题（manifest.title）/副标题/desc/stat + 目录（按 parts 分组）；cover-cta「开始阅读」href = `reader.html?book=<id>&ch=<首章id>`。
4. 有 `ch` → 找对应章节（id 匹配），设 `window.readerPageKey = book + '_' + ch`、`window.readerLastPage = () => 'reader.html?book=' + book + '&ch=' + ch`、`window.readerDeferOutline = true`；`fetch(book + '/' + chapter.file)` → `marked.parse(md)` → 注入 `.content`；MD 首个 `h1` 为正文章节标题，`#topbar-title` 文本 = **manifest.title（书名，旧页为「主权福音」）**；构建 prev/next 链接（按 parts 顺序线性前后章节）；courseware-btn href = `book + '/' + manifest.courseware + '?c=' + chapter.cw`（如 `lordship_gospel/courseware/chapter.html?c=chapter01`）；调用 `window.readerBuildOutline()` + `window.readerRestoreScroll()`。
5. 章节导航隐藏/禁用边界：首章无 prev、末章无 next（旧页用 `href="#"` 时给 disabled 样式）。
6. 侧边栏 TOC 渲染所有章节（当前章 `toc-item active`）；`foot-home` href = `reader.html?book=<id>`（回封面）。

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
8. **投放新书验证（spec AC7）**：临时建 `books/_ac7_test/manifest.json`（最小：1 部 1 章）+ `book2/00_测试.md`，`reader.html?book=_ac7_test` 封面与章节均可用 → 删除临时目录。
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
        brianinchrist/organicchurch/books/lordship_gospel/book2 \
        brianinchrist/organicchurch/books/index.html \
        docs/superpowers/plans/2026-08-05-md-book-reader.md
git commit -m "feat: MD 在线阅读器（reader.html + manifest + 共享 assets），lordship_gospel 迁移为 MD 书"
```

**验证**：`git status` 无遗留；`git log -1` 确认；未提交用户文件（摘要/讨论课件 等）不在提交内。

---

## 自查清单（提交前逐条）

- [ ] manifest 契约与 spec 一致（字段名、相对路径语义）。
- [ ] 18 个 MD 全部 `git mv` 成功且旧页未受影响；摘要/讨论课件 未被触碰。
- [ ] reader.js 适配为最小 diff，旧章节页行为不变。
- [ ] 零构建步骤成立：无构建脚本、无 package.json 新增、无 CDN 运行时依赖（marked 已本地化）。
- [ ] 所有新增文件无 `@ts-ignore`/`as any` 类问题（纯 JS/HTML/CSS，语法自检通过）。
- [ ] 验收标准 AC1–AC9 全部过；浏览器控制台无错误。
- [ ] 提交内容仅含本计划文件；未提交用户文件排除在外。

