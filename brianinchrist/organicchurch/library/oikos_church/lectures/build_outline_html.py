#!/usr/bin/env python3
"""把 v2 讲座大纲（Markdown）渲染成站内讲义 HTML 页。
输出：library/oikos_church/lectures/outline.html
用法：python3 build_outline_html.py
"""
import html
import pathlib
import re
import markdown

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "家教会的本体论革命_四讲讲座大纲_v2_opus修订.md"
OUT = ROOT / "outline.html"

md_text = SRC.read_text(encoding="utf-8")

# 去掉首行的一级标题（页面自己有 h1），保留其余结构
body_md = re.sub(r"\A#\s+.*?\n", "", md_text, count=1)

md = markdown.Markdown(
    extensions=["tables", "fenced_code", "toc", "attr_list", "sane_lists", "md_in_html"],
    extension_configs={"toc": {"permalink": False, "toc_depth": "2-3"}},
)
body_html = md.convert(body_md)
toc_html = md.toc

# ⚠ 标记做成可辨识的徽标
body_html = body_html.replace("⚠", '<span class="warn">⚠</span>')

# 讲义页导航（相对路径：本文件与 slides/ 同级）
NAV = [
    ("幻灯片总览", "slides/index.html"),
    ("第 1 讲 诊断", "slides/lecture-1.html"),
    ("第 2 讲 本体", "slides/lecture-2.html"),
    ("第 3 讲 机制", "slides/lecture-3.html"),
    ("第 4 讲 落地", "slides/lecture-4.html"),
]
nav_html = "".join(
    f'<a href="{href}">{html.escape(label)}</a>' for label, href in NAV
)

template = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#FAF6EC">
<title>四讲讲座大纲 · 家教会的本体论革命</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../../assets/css/vars.css">
<style>
  :root {{
    --hp-measure: 46rem;
  }}
  body {{ background-attachment: fixed; }}

  /* ---- 顶部导航 ---- */
  #hp-top {{
    position: sticky; top: 0; z-index: 20;
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px var(--space-sm);
    padding: 10px clamp(16px, 4vw, 48px);
    background: rgba(250, 246, 236, 0.94);
    backdrop-filter: saturate(140%) blur(6px);
    border-bottom: 1px solid var(--border);
  }}
  #hp-top .hp-brand {{
    font-family: var(--font-ui); font-size: 13px; font-weight: 700;
    letter-spacing: 0.16em; color: var(--accent);
    margin-right: auto;
  }}
  #hp-top a {{
    font-family: var(--font-ui); font-size: 13px;
    color: var(--muted); text-decoration: none;
    padding: 5px 10px; border: 1px solid var(--border); border-radius: 999px;
    transition: var(--transition);
  }}
  #hp-top a:hover {{ color: var(--accent-ink); border-color: var(--accent); background: rgba(138,53,23,0.06); }}

  /* ---- 页头 ---- */
  header.hp-head {{
    max-width: var(--hp-measure); margin: 0 auto;
    padding: clamp(28px, 6vw, 64px) clamp(16px, 4vw, 32px) 8px;
  }}
  header.hp-head .hp-kicker {{
    font-family: var(--font-ui); font-size: 12px; font-weight: 600;
    letter-spacing: 0.22em; color: var(--accent2);
  }}
  header.hp-head h1 {{
    font-size: clamp(28px, 5vw, 42px); line-height: 1.28; font-weight: 600;
    margin: 10px 0 12px; letter-spacing: 0.01em;
  }}
  header.hp-head .hp-sub {{ color: var(--muted); font-size: 15px; line-height: 1.9; }}
  header.hp-head .hp-rule {{
    margin: 26px 0 0; height: 1px; border: 0;
    background: linear-gradient(90deg, var(--rule), rgba(217,205,180,0));
  }}

  /* ---- 正文 ---- */
  main.hp-main {{
    max-width: var(--hp-measure); margin: 0 auto;
    padding: 8px clamp(16px, 4vw, 32px) 96px;
  }}
  main.hp-main h2 {{
    font-size: 24px; line-height: 1.4; font-weight: 600;
    margin: 52px 0 16px; padding-top: 18px; border-top: 1px solid var(--rule);
  }}
  main.hp-main h3 {{ font-size: 19px; font-weight: 600; margin: 34px 0 10px; color: var(--accent-ink); }}
  main.hp-main h4 {{ font-size: 16px; font-weight: 600; margin: 24px 0 8px; color: var(--muted); }}
  main.hp-main p {{ margin: 12px 0; line-height: 1.95; }}
  main.hp-main ul, main.hp-main ol {{ margin: 12px 0 12px 1.35em; }}
  main.hp-main li {{ margin: 6px 0; line-height: 1.9; }}
  main.hp-main li > ul, main.hp-main li > ol {{ margin: 6px 0 6px 1.2em; }}
  main.hp-main strong {{ color: var(--accent-ink); }}
  main.hp-main code {{
    font-family: var(--font-ui); font-size: 0.88em;
    background: var(--surface-2); padding: 1px 5px; border-radius: 4px;
  }}
  main.hp-main blockquote {{
    margin: 18px 0; padding: 12px 18px;
    background: var(--quote-bg); border-left: 3px solid var(--accent2);
    color: var(--muted);
  }}
  main.hp-main blockquote p {{ margin: 6px 0; }}
  main.hp-main table {{
    width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14.5px;
    display: block; overflow-x: auto;
  }}
  main.hp-main th, main.hp-main td {{
    border: 1px solid var(--border); padding: 8px 10px; text-align: left;
    vertical-align: top; line-height: 1.7;
  }}
  main.hp-main th {{ background: var(--surface); font-family: var(--font-ui); font-size: 13.5px; font-weight: 600; }}
  main.hp-main hr {{ margin: 40px 0; border: 0; height: 1px; background: var(--rule); }}
  .warn {{ color: var(--accent); font-weight: 600; }}

  /* ---- 目录（toc 扩展生成的列表） ---- */
  #hp-toc {{
    max-width: var(--hp-measure); margin: 6px auto 0;
    padding: 16px clamp(16px, 4vw, 32px) 0;
  }}
  #hp-toc details {{
    border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
    padding: 12px 16px;
  }}
  #hp-toc summary {{
    font-family: var(--font-ui); font-size: 13px; font-weight: 600;
    letter-spacing: 0.14em; color: var(--accent2); cursor: pointer;
  }}
  #hp-toc ul {{ list-style: none; margin: 12px 0 2px; padding: 0; }}
  #hp-toc li {{ margin: 4px 0; font-size: 14px; line-height: 1.7; }}
  #hp-toc ul ul {{ margin-left: 1.1em; }}
  #hp-toc a {{ color: var(--muted); text-decoration: none; }}
  #hp-toc a:hover {{ color: var(--accent-ink); text-decoration: underline; }}

  footer.hp-foot {{
    max-width: var(--hp-measure); margin: 0 auto;
    padding: 0 clamp(16px, 4vw, 32px) 72px;
    font-family: var(--font-ui); font-size: 13px; color: var(--faint);
  }}
  footer.hp-foot a {{ color: var(--accent); }}

  @media print {{
    #hp-top, #hp-toc, footer.hp-foot {{ display: none !important; }}
    body {{ background: #fff; font-size: 10.5pt; }}
    main.hp-main {{ max-width: none; padding: 0; }}
    main.hp-main h2 {{ page-break-before: always; break-before: page; margin-top: 0; }}
    main.hp-main h2:first-of-type {{ page-break-before: avoid; break-before: avoid; }}
    main.hp-main table {{ font-size: 9.5pt; display: table; }}
    main.hp-main a {{ color: inherit; text-decoration: none; }}
    @page {{ margin: 16mm 14mm; }}
  }}
</style>
</head>
<body>

<nav id="hp-top">
  <span class="hp-brand">讲义 · 家教会的本体论革命</span>
  {nav}
</nav>

<header class="hp-head">
  <div class="hp-kicker">四讲讲座 · 每讲 60 分钟</div>
  <h1>《家教会的本体论革命》四讲讲座大纲</h1>
  <p class="hp-sub">
    逻辑线：诊断（Why）→ 本体（What）→ 机制（How）→ 落地（Where）。
    本页为讲座讲义全文（Opus 5.5 通读全书后的修订版），配有四讲 HTML 幻灯片。
  </p>
  <hr class="hp-rule">
</header>

<section id="hp-toc">
  <details>
    <summary>本页目录</summary>
    {toc}
  </details>
</section>

<main class="hp-main">
{body}
</main>

<footer class="hp-foot">
  <p>讲义全文 · 依据 <code>lectures/家教会的本体论革命_四讲讲座大纲_v2_opus修订.md</code> 生成。
  标 <span class="warn">⚠</span> 处为讲前需核对和合本原文的经文。</p>
  <p>返回 <a href="../../../reader.html?book=oikos_church">在线读书</a> ·
     进入 <a href="slides/index.html">四讲幻灯片</a> ·
     打印本页可导出 PDF 讲义。</p>
</footer>

</body>
</html>
"""

OUT.write_text(
    template.format(nav=nav_html, toc=toc_html, body=body_html), encoding="utf-8"
)
print(f"写入 {OUT}")
print(f"正文 HTML {len(body_html)} 字节 / 源 Markdown {len(md_text)} 字符")
print("h2 数:", body_html.count("<h2"), " / 表格数:", body_html.count("<table"))
