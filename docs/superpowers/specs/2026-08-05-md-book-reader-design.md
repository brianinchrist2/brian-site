# MD 书籍在线阅读器设计文档

> 日期：2026-08-05
> 来源：用户需求（书籍改为 MD 存储，便于修订与扩展）+ Software Architect 架构评估（2026-08-05）
> 决策：客户端 JS 渲染 / 单页阅读器 + manifest / MD 为唯一内容源 / 零构建步骤
> 状态：已获用户批准（2026-08-05）

## 背景与目标

当前书籍内容以 HTML 存储（`oikos_church/{en,zh}/book2/` 各 26 个文件；`lordship_gospel/` 已有 18 个 MD 草稿文件）。用户反馈：

- **HTML 维护不便**——修订困难，未来扩展书籍时工作量大
- **期望**：内容以 **MD 格式**存放（便于修订），显示时自动变为 HTML
- **扩展愿景**：以后投放新书时，只要提供 MD 格式的书籍，站点自动展示为 HTML

本项目本质是做一个**在线阅读器：后台数据以 MD 格式**。

### 目标

1. 书籍内容源改为 Markdown（单一事实来源，便于修订与版本管理）
2. 零构建步骤——不引入任何构建框架/脚本到部署流程
3. 投放新书 = 放置 MD 文件 + 一个 manifest 文件 + 目录入口
4. 复用现有阅读器体验：三主题（纸/赭/夜）、字号、版宽、进度条、回到顶部、阅读位置记忆

## 决策与取舍

| 决策点 | 选择 | 被否方案 | 原因 |
|--------|------|----------|------|
| 渲染时机 | **客户端 JS 渲染**（fetch .md + 浏览器渲染） | 构建时 Python 渲染（更利于 SEO，但需要构建步骤）；CF Pages Function 渲染（过度设计） | 用户明确选择零构建步骤；投入 MD 即自动显示 |
| 阅读器形态 | **单页阅读器 + manifest**（`reader.html?book=x&ch=NN`） | 每章独立 HTML 外壳（保留章节 URL 但新书需生成外壳） | 用户明确选择；投放新书零额外步骤 |
| 渲染引擎 | **marked.js**（本地 vendor 到 `assets/js/marked.min.js`） | CDN 加载（中国网络可用性差）；markdown-it（当前内容不需要其扩展性） | 标准 Markdown 已够用；本地 vendor 无第三方依赖 |
| MD 源位置 | **移入部署树** `brianinchrist/organicchurch/books/<book>/book2/` | 保留仓库根目录 + 拷贝步骤（违背零构建） | 源码即部署文件，git 版本管理不受影响 |

### 已知取舍（客户端渲染固有）

- **SEO**：所有章节共用 `reader.html` 一个 URL（`?ch=` 参数），搜索引擎收录弱于每章独立页面——用户已接受
- **无 JS 环境不可读**；内容注入前有短暂白屏
- **MD 源在部署树内**——与"`brianinchrist/` 为纯部署产物"的旧心智模型不同，但无构建步骤时两者必然重合

## 架构总览

```
brianinchrist/organicchurch/books/
├── index.html                    # 著作总目录（新增 lordship_gospel 入口）
├── reader.html                   # ★ 通用单页阅读器（所有 MD 书共用）
├── assets/                       # ★ 新增：共享阅读器资产（MD 阅读器专用）
│   ├── css/reader.css            # 从 lordship_gospel/assets/css/ 复制（现有样式）
│   ├── js/reader.js              # 从 lordship_gospel/assets/js/ 复制并适配 init 时机
│   └── js/marked.min.js          # ★ 新增：本地 vendor 的 marked.js
└── lordship_gospel/
    ├── manifest.json             # ★ 书籍元数据 + 章节清单
    ├── assets/                   # 现有每书资产（旧 chapter*.html 外壳仍引用，不动）
    └── book2/
        ├── 00_绪论_速成福音的危机与反思.md   # ★ MD 源（从仓库根目录移入）
        ├── 01_第一章_福音的视角_从人的需要到神的计划.md
        └── …（共 18 个 MD 文件）
```

注意：现有每书一份的 `lordship_gospel/assets/` 与 `oikos_church/.../assets/` 继续为旧 HTML 外壳服务，**保持不动**；`books/assets/` 是 MD 阅读器新增的共享目录（一次性复制 + 适配）。

**投放新书流程**：在 `books/<书ID>/` 放置 `manifest.json` + `book2/*.md`，在 `books/index.html` 加入口。无任何构建步骤。

## 数据契约（manifest.json）

```json
{
  "id": "lordship_gospel",
  "title": "主权的福音",
  "subtitle": "The Lordship Gospel",
  "desc": "从改教正统出发，重思福音的主权呼召……",
  "lang": "zh-CN",
  "courseware": "courseware/chapter.html",
  "parts": [
    {
      "part": "绪论",
      "chapters": [
        { "id": "00", "title": "绪论：速成福音的危机与反思",
          "file": "book2/00_绪论_速成福音的危机与反思.md" }
      ]
    },
    {
      "part": "第一部 福音的根基",
      "chapters": [
        { "id": "01", "title": "第一章 福音的视角",
          "file": "book2/01_第一章_福音的视角_从人的需要到神的计划.md" }
      ]
    }
  ]
}
```

规则：
- `id` 与 `books/index.html` 中的链接一致（`reader.html?book=<id>`）
- 章节顺序 = `chapters` 数组顺序，阅读器据此推导上/下一章
- `courseware` 可选——**相对书籍目录的路径**（manifest 位于 `books/<id>/manifest.json`，如 `"courseware": "courseware/chapter.html"`，阅读器以 `?c=<章节id>` 拼接）；存在时章节页显示"互动课件"按钮
- 章节 `title` 用于目录与顶部栏；MD 文件内的 `# 标题` 作为正文首标题

## reader.html 工作流程

1. **URL 解析**：`reader.html?book=<id>` → 封面模式；`reader.html?book=<id>&ch=<NN>` → 章节模式
2. **加载 manifest**：`fetch('lordship_gospel/manifest.json')`（相对路径由 `book` 参数决定），失败时显示错误提示
3. **封面模式**：渲染书名、副题、描述、按 part 分组的目录；"开始阅读"指向第一章
4. **章节模式**：
   - `fetch` 对应 `.md` 文件
   - marked.js 渲染为 HTML → 注入 `.body-text`
   - 顶部栏显示书名 + 上一章/下一章按钮；"目录"侧栏由 manifest 渲染（当前章高亮）
   - 存在 `courseware` 时显示"互动课件"按钮
5. **阅读器行为**（复用现有 reader.js 能力）：
   - 三主题切换（纸/赭/夜）、字号（16–24px）、版宽（640/720/840px）→ localStorage 持久化
   - 滚动进度条、回到顶部
   - 阅读位置记忆：`reader_last_page`（封面"继续上次阅读"入口）
   - 章节内 scroll-spy 大纲：**内容注入完成后初始化**（适配点，见下）
6. **导航**：上/下一章与目录跳转 = 整页导航（`?ch=` 参数变化），简单可靠，localStorage 偏好跨页生效

### 现有资产复用与适配

| 资产 | 处理 |
|------|------|
| `reader.css` | 原样复用 |
| `reader.js` | 复用主题/字号/版宽/进度/回顶逻辑；**scroll-spy 大纲初始化时机改为注入正文之后**（现有实现假定内容在 DOM 中就绪） |
| 旧 `chapterNN.html` 外壳 | 过渡期保留，reader.html 验证通过后清理（单独提交） |
| `generate_book.py` | 对 lordship_gospel 弃用；保留文件不删（oikos_church 相关工具不受影响） |

## 一次性迁移步骤（lordship_gospel）

1. 移动：`lordship_gospel/*.md`（18 个）→ `brianinchrist/organicchurch/books/lordship_gospel/book2/`（git mv）
2. 生成 `manifest.json`：章节清单从现有文件名 + `generate_book.py` 的 CHAPTERS 表提取（18 章 + 绪论，按原顺序分组）
3. 编写 `reader.html` + vendor `marked.min.js` + reader.js 适配
4. `books/index.html` 加入 lordship_gospel 入口
5. 本地验证（`python3 -m http.server` 起站，走通封面→章节→导航→主题→记忆全流程）
6. 旧外壳清理（可选，单独提交）

## 范围

### 本阶段（In Scope）

- 通用 `reader.html` 单页阅读器 + marked.js vendor + reader.js 适配
- lordship_gospel 作为第一个 MD 书籍投产（MD 移入 + manifest + 目录入口）
- 验证全流程

### 明确不做（Out of Scope）

- **oikos_church 的 HTML 书籍不动**（继续走旧阅读器；未来如需迁移是单独工作项）
- 博客文章不动（保持 HTML）
- 不迁移 lordship_gospel 旧 courseware（`courseware/` 应用维持现状）
- 不引入构建框架、不做服务端渲染、不做离线 PWA

## 风险与注意

- **MD 文件编码**：必须 UTF-8（含 BOM 亦可）；git 保持 LF 换行（现有仓库惯例）
- **fetch 路径**：`reader.html` 位于 `books/` 下，manifest/MD 均为相对路径，本地 http.server 与 CF Pages 行为一致
- **marked.js 版本**：vendor 固定版本（如 v12+），文件内注释版本号，便于更新
- **CJK 渲染验证**：中文标点、`**加粗**` 与中文混排、`---` 分隔线、有序/无序列表逐项验证
- **manifest 校验**：章节 `file` 指向不存在的 MD 时显示友好错误，不白屏

## 验收标准

1. `reader.html?book=lordship_gospel` 显示封面与完整目录（按 part 分组）
2. 点任意章节正确渲染 MD（标题/加粗/列表/分隔线/反思练习有序列表），中文无乱码
3. 上/下一章、目录跳转、侧栏当前章高亮正确
4. 三主题/字号/版宽切换生效且刷新后保持
5. 进度条与回到顶部工作；离开后经封面"继续阅读"可回到上次章节与位置
6. `books/index.html` 新入口可点击进入
7. 投放新书步骤验证：复制一份最小 manifest + 单章 MD 到测试目录，reader.html 可用（README 或 spec 附录说明步骤）
