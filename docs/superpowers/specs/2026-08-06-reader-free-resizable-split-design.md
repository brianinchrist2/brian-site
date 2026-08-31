# 阅读器：正文 / 课件分栏自由拖拽设计

日期：2026-08-06
状态：Approved（用户选择「完全自由」；左栏目录保持固定边界）
范围：共享 MD 阅读器 `brianinchrist/organicchurch/library/`（`reader.html` + `assets/js/reader.js` + `assets/css/reader.css`）

## 背景与目标

共享阅读器是三栏布局：左栏目录（TOC）、中栏正文、右栏互动课件。当前右栏课件宽度被硬性锁定在 **280–600px**（`RCOL_MIN/RCOL_MAX`、CSS `max-width: 600px`、`reader.html` 中 `#rdr-divider-cr` 的 `aria-valuemin/max`），用户无法自由调节正文与课件的比例。

目标：**正文 / 课件分栏完全自由拖拽**，取消 600px 上限。左栏目录保持现状（200–500px）不动。

## 边界策略

- **右栏课件**：
  - 下限 `RCOL_MIN = 140px`（仅保证分隔条可抓住、不塌成 0 宽后找不到）。
  - 上限动态：`rcolMax() = 视口宽度 − 左栏实际宽度 − 2×分隔条(8px) − 中栏地板(60px)`。
  - 即课件可拖到「接近全屏」（减去固定的左栏目录），正文可被压到很窄但不至于 0。
- **中栏正文**：维持 `flex: 1 1 0; min-width: 0`，随课件增宽自动收缩；约 60px 地板由 `rcolMax()` 计算隐含保证。
- **左栏目录**：**固定宽度 280px**（`--rdr-lcol-w`），不随拖拽变化。目录栏自身不可调整，但顶栏菜单按钮仍可整体收起/展开（`rdr-lcol-collapsed`）。

## 改动点

### 1. `assets/js/reader.js`

- 常量：`RCOL_MIN` 280→140；删除 `RCOL_MAX`；新增 `DIVIDER_W=8`、`CENTER_MIN=60` 与 `rcolMax()` 函数（左栏收起时按 0 计算）。
- `restoreLayoutState`：恢复的 `--rdr-rcol-w` 改为 `clamp(rw, RCOL_MIN, rcolMax())`。
- `syncDividerAria`：`#rdr-divider-cr` 的 `aria-valuemin/max/now` 动态按 `RCOL_MIN` / `rcolMax()` 更新。
- `wireDividerDrag` / `wireDividerKeyboard`：pair 的 `max` 改为函数（右栏 → `rcolMax()`），拖拽/键盘 `End` 时实时取上限。
- 新增 `window.resize` 监听（仅桌面模式）：当 `--rdr-rcol-w` 超出新 `rcolMax()` 时压缩回来并 `saveLayoutState()`。

## 后续变更（2026-08-06，用户要求「左侧目录栏固定宽度」）

- 左栏目录改为**固定 280px**，不再可拖拽：
  - 删除 `#rdr-divider-lc` 分隔条（`reader.html`）与对应的 `wireDividerDrag`/`wireDividerKeyboard` pair、`syncDividerAria` 中左栏分支（`reader.js`）。
  - 移除 `LCOL_MIN/LCOL_MAX` 常量、`reader_lcol_w` 持久化与恢复逻辑。
  - `.rdr-col-left` 去掉 `max-width:500px`，加 `border-right: 1px solid var(--rdr-rule)` 保持视觉分隔。
  - 顶栏目录按钮的收起/展开（`rdr-lcol-collapsed`）保留。
- `rcolMax()` 仍按当前左栏实际宽度计算（收起时按 0）。

## 后续变更（2026-08-06，用户要求「正文宽度用 -+ 控制，不要三档」）

- 阅读器设置面板的「行宽」从三档预设（窄/标准/宽，`data-measure` 属性）改为 **−/+ 数字步进**（照搬字号 A−/A+ 模式）。
- 新的行宽参数是 `--rdr-measure`（em），由 reader.js 内联设置：`MEASURE_MIN=26 / MAX=76 / STEP=2 / DEFAULT=38`。
- `reader_measure` 存储改为数值（如 `"40"`）；旧值 `narrow/standard/wide` 自动映射到 30/38/48em。
- 移除 `html[data-measure="…"]` CSS 规则与三档高亮选择器；`#rdr-content` 仍用 `max-width: var(--rdr-measure)`。
- 设置面板 UI：`−` / `#rdr-measure-label`(如 38em) / `+`，复用 `.rdr-setting-group` 样式。
- 布局微调（2026-08-06 用户反馈）：设置面板 `#rdr-settings` 加宽至 304px；`.rdr-setting-group` gap 8→10px；`#rdr-measure-minus/plus` 与字号按钮同尺寸（34×34）且字号 1.25em（比 A−/A+ 的 1em 大）；`#rdr-measure-label` 加入标签样式（min-width 3em）。

## 后续变更（2026-08-06，用户要求「library 里的静态页面要移除」）

- 移除 `library/` 下旧静态系统：`oikos_church/{book2,en,zh,assets}`、独立课件应用（`courseware/{chapter,index,print,review}.html` + app 资源 + `tests`/`tools`）、`lordship_gospel` 的 `courseware` 应用页 + `tests`/`tools` + `manifest_before.json` + `.pytest_cache`。删除内容移入 `%TEMP%\library_static_backup_20260806\`（含 build 工具，可恢复）。
- 保留：`reader.html`、`index.html`、`assets/`、两书 `manifest.json` + `manuscript/*.md` + `courseware/assets/data/courseware.json`。
- 入口同步改指新阅读器：`library/index.html`（oikos 卡 → `reader.html?book=oikos_church`，去掉 "EN" 与移动端课件链接）、`bookshelf/index.html`（两书卡 → 在线阅读器）、根 `index.html` 页脚（书籍 → 阅读器，去掉课件链接）。
- 两书 manifest 的 `courseware` 字段改为 `"assets/data/courseware.json"`；清除 courseware.json 中 43 个指向已删 book2 的旧 `href` 字段。
- 部署后已删静态页 URL 走 SPA fallback（返回首页 200）；如需优雅 301 可在 `_redirects` 补 oikos book2 → reader 规则。

## 后续变更（2026-08-06，用户要求「把 oikos_church 的英文版 md 提取出来」）

- 从静态页备份 `.backup/library_static_20260806/oikos_church_en/book2/*.html` 提取英文版并接入阅读器，新书 ID **`oikos_church_en`**（`reader.html?book=oikos_church_en`，无需改阅读器代码）。
- 转换 22 个英文章节 HTML → MD（`library/oikos_church_en/manuscript/`，格式对齐中文书稿：`# 标题` / `> 引言` / `##`/`###`）。跳过 conclusion/guide（原文是中文）与 part1（中英混杂）。转换脚本在 `%TEMP%\convert_en.py`。
- 新建 `library/oikos_church_en/manifest.json`（8 部 22 章，镜像中文结构去掉结语）；复制英文 `courseware/assets/data/courseware.json`（清掉 24 个死 href）。
- 目录页加英文入口：`library/index.html` 与 `bookshelf/index.html` oikos 卡新增「English Version → reader.html?book=oikos_church_en」；library 恢复「中 EN」标识。
- 已部署（preview `84e6146d...`），线上验证英文封面/章节/em-dash 标题/课件数据均正常，中英三本书互不影响。

## 后续变更（2026-08-06，用户要求「需要补全」英文书）

- **conclusion**：从 `conclusion.html`（干净 UTF-8）直接翻译为英文，写入 `manuscript/conclusion.md`（结语：回归唯独圣经的彻底性）。
- **guide**（学习讨论手册，`manuscript/guide.md`，23 节）：中文源 `guide.html` **编码损坏**（UTF-8 文件但中文经多次 GBK 转码、约 1258 字符丢失），采用「乱码模式识别 + 书本上下文还原」的子代理翻译（先 12 代理 Workflow 产出 17 节后失稳被停，改 3 个定向 Opus 代理补齐 6 节）。翻译质量良好但源非纯净。
- 英文 manifest 扩为 **9 部 / 24 章**：结语入「Conclusion / Appendix」，新增「Study Guide」部。
- 已部署（preview `289edb4e...`），线上验证 conclusion（2.3 万字符）与 guide（14.2 万字符）均正常渲染。

### 2. `assets/css/reader.css`

- 删除 `.rdr-col-right` 的 `max-width: 600px;`。

### 3. `reader.html`

- `#rdr-divider-cr`：`aria-valuemin="280"` → `"140"`；`aria-valuemax="600"` → 宽松占位（JS 运行时校正为 `rcolMax()`）；`aria-valuenow="360"` 保留默认。

## 持久化

宽度仍存 `localStorage['reader_rcol_w']`（px，与现有机制一致）。恢复时按新边界 clamp。用户要求的是「自由拖拽」而非「比例随视口自适应」，故不改为百分比存储。

## 无障碍 / 响应式

- 分隔条保持 `role="separator"` + `tabindex` + 键盘（←/→ ±10、Home/End 跳最小/最大），aria 值保持准确。
- < 1280px 时课件仍为抽屉（现有逻辑），拖拽仅在桌面模式；`resize` clamp 在窄屏跳过。

## 验证

本地起 HTTP 服务打开 `reader.html?book=lordship_gospel&ch=…`，用 DevTools 模拟在 `#rdr-divider-cr` 上拖动：
1. 拖到超过 600px → 课件列 > 600px、正文收缩，不再被锁。
2. 拖到极限 → 课件接近全屏（减去左栏），正文约 60px 地板。
3. 键盘 `End` → 课件到最大；`Home` → 140px。
4. 刷新 → 宽度按新边界恢复。
5. 左栏目录固定 280px：无 `#rdr-divider-lc`，边界处拖拽无效，菜单按钮仍可收起/展开。

已通过：本地 + 生产域（`organicchurch.dpdns.org`）真实浏览器（headless Playwright）验证，无 console 报错。
