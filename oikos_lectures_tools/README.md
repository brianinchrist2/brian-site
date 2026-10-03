# oikos_lectures_tools —— 四讲讲义的幻灯片构建工具

这套工具生成《家教会的本体论革命》四讲讲义的 HTML 幻灯片
（成品在 `brianinchrist/organicchurch/library/oikos_church/lectures/slides/`）。

**放在 `brianinchrist/` 之外是刻意的**：`brianinchrist/` 是 Cloudflare Pages 的发布目录，
工具与源码不该被当静态资源公开上传。

## 目录

| 路径 | 作用 |
|---|---|
| `src/index.html`、`src/lecture-1..4.html` | **源模板**。含 `{{fig:xxx()}}`（内联 SVG 图解）、`{{tl:L1}}`（时间轴）、`{{icon:…}}`、`{{check}}` 占位符 |
| `figs.py` | 生成上述 SVG 图解与时间轴的函数库（约 25 幅图） |
| `build.py` | 把模板展开成成品 HTML |
| `sync_src.py` | 把成品里的改动**反展开**回模板（保证二者同步） |
| `assets.py` | 生成 `slides/assets/*.svg` 那几个独立装饰文件的脚本 |
| `check.cjs` | 逐页版面检查：元素越界、字号 < 28px、压到页脚区 |
| `shot.cjs` | 单页截图（需 playwright-core + 本机 Chrome） |
| `src.pre-image-sync/` | 配图同步**之前**的模板快照（回滚用） |

## 三个命令

```bash
cd oikos_lectures_tools

python3 build.py --verify      # 只构建到临时目录，与成品逐字节比对（不写成品）——改完必跑
python3 build.py               # 真正写入成品（会覆盖！）
node check.cjs ../brianinchrist/organicchurch/library/oikos_church/lectures/slides/lecture-1.html …
```

`shot.cjs` 需要 `playwright-core`（本机在 `~/.hermes/hermes-agent/node_modules`）与
Chrome，路径见脚本顶部。

## ⚠️ 改内容的正确顺序

成品是**生成物**，直接改成品会被下次 `build.py` 覆盖。规则：

1. 改 `src/` 里的模板（要改版式/文字/图解都在这里）；
2. 跑 `python3 build.py --verify`，必须**全部 ✔ 完全一致**或差异符合预期；
3. 确认无误后再 `python3 build.py`。

已经有一次"直接改成品"的历史（2026-10-02 的 17 处配图插入），是用 `sync_src.py` 追平回来的：
它取成品页文本，按顺序把「展开串」换回「占位符」，从而得到等价的模板文本。
以后再出现成品超前于模板的情况，同样用它追平，然后 `--verify` 验证。

## 配图（photos/illustrations）

`slides/assets/img/` 下的 17 张图**不是这套工具生成的**，而是一条独立流水线：

| 环节 | 工具/位置 |
|---|---|
| 设计（出提示词、决定页位与尺寸） | Claude CLI（opus），产出 `../drafts/oikos_lectures/image_plan.json` |
| 出图（本机） | klein 4B GGUF：`../drafts/oikos_lectures/gen_images.py`（约 106 秒/张） |
| 插入成品 | `../drafts/oikos_lectures/apply_plan.py`（按 slot 分派：full/tall/wide/half/spot） |
| 版面校验 | `check.cjs`（图片插入后必跑） |

因为配图是写进成品的，**插完图要立刻 `sync_src.py`**，否则模板与成品脱节。
图片槽位的 CSS（`.fig.plate`、`.band`、`.spot`、`half`、`.tall`）在
`slides/assets/deck.css`，那份文件是手写的、不由 build.py 生成。
