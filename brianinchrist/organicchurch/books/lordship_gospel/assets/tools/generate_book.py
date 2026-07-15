#!/usr/bin/env python3
"""Generate lordship_gospel book2 HTML files and cover page.

Mirrors the oikos_church structure exactly — same file names, same HTML
template pattern, same sidebar TOC. Content placeholders where actual
chapter text is not yet written.

Usage: python generate_book.py [--base-dir PATH]
"""

import argparse
import os
import shutil

# ── Book metadata ─────────────────────────────────────────────────
BOOK_TITLE_ZH = "主权的福音"
BOOK_TITLE_EN = "The Lordship Gospel"
BOOK_SUBTITLE = "Sola Scriptura · Solus Christus · Sola Fide"
BOOK_LATIN = "Dominus · Evangelium · Regnum"
BOOK_DESC_ZH = (
    "从改教正统出发，重思福音的主权呼召——<br/>"
    "福音不只是一份免费的礼物，更是一位绝对的主。"
)
BOOK_DESC_EN = (
    "Re-examining the sovereign call of the Gospel from the "
    "Reformed confessional tradition—the Gospel is not merely a "
    "free gift, but an absolute Lord."
)

CHAPTERS = [
    # (id, title_zh, kicker_zh, reading_time, prev_id, next_id,
    #  prev_title, next_title)

    # ── Preface / Introduction ──
    ("preface", "前言：福音主权的回归", "前言",
     "约 10 分钟", None, "keywords",
     None, "关键术语简释"),
    ("keywords", "关键术语简释", "前言",
     "约 8 分钟", "preface", "introduction",
     "前言：福音主权的回归", "导言"),
    ("introduction", "导言：从廉价恩典到主权呼召", "导论",
     "约 15 分钟", "keywords", "chapter01",
     "关键术语简释", "第一章 福音的主权"),

    # ── Part I ──
    ("chapter01", "第一章 福音的主权", "第一部 福音的根基",
     "约 18 分钟", "introduction", "chapter02",
     "导言", "第二章 人的全然败坏"),
    ("chapter02", "第二章 人的全然败坏", "第一部 福音的根基",
     "约 18 分钟", "chapter01", "chapter03",
     "第一章 福音的主权", "第三章 上帝的公义与慈爱"),

    # ── Part II ──
    ("chapter03", "第三章 上帝的公义与慈爱", "第二部 神在基督里的作为",
     "约 20 分钟", "chapter02", "chapter04",
     "第二章 人的全然败坏", "第四章 基督的代赎"),
    ("chapter04", "第四章 基督的代赎", "第二部 神在基督里的作为",
     "约 20 分钟", "chapter03", "chapter05",
     "第三章 上帝的公义与慈爱", "第五章 悔改与信心"),
    ("chapter05", "第五章 悔改与信心", "第二部 神在基督里的作为",
     "约 16 分钟", "chapter04", "chapter06",
     "第四章 基督的代赎", "第六章 作门徒的代价"),

    # ── Part III ──
    ("chapter06", "第六章 作门徒的代价", "第三部 门徒的生命",
     "约 18 分钟", "chapter05", "chapter07",
     "第五章 悔改与信心", "第七章 老我的钉死"),
    ("chapter07", "第七章 老我的钉死", "第三部 门徒的生命",
     "约 16 分钟", "chapter06", "chapter08",
     "第六章 作门徒的代价", "第八章 在基督里得自由"),

    # ── Part IV ──
    ("chapter08", "第八章 在基督里得自由", "第四部 称义与成圣",
     "约 18 分钟", "chapter07", "chapter09",
     "第七章 老我的钉死", "第九章 圣灵的更新"),
    ("chapter09", "第九章 圣灵的更新", "第四部 称义与成圣",
     "约 18 分钟", "chapter08", "chapter10",
     "第八章 在基督里得自由", "第十章 恩典中的坚忍"),

    # ── Part V ──
    ("chapter10", "第十章 恩典中的坚忍", "第五部 救恩的保障",
     "约 16 分钟", "chapter09", "chapter11",
     "第九章 圣灵的更新", "第十一章 律法与福音"),
    ("chapter11", "第十一章 律法与福音", "第五部 救恩的保障",
     "约 20 分钟", "chapter10", "chapter12",
     "第十章 恩典中的坚忍", "第十二章 教会的记号"),
    ("chapter12", "第十二章 教会的记号", "第五部 救恩的保障",
     "约 18 分钟", "chapter11", "chapter13",
     "第十一章 律法与福音", "第十三章 圣礼与恩典"),

    # ── Part VI ──
    ("chapter13", "第十三章 圣礼与恩典", "第六部 教会的生活",
     "约 16 分钟", "chapter12", "chapter14",
     "第十二章 教会的记号", "第十四章 福音的使命"),
    ("chapter14", "第十四章 福音的使命", "第六部 教会的生活",
     "约 18 分钟", "chapter13", "chapter15",
     "第十三章 圣礼与恩典", "第十五章 敬拜与全人"),
    ("chapter15", "第十五章 敬拜与全人", "第六部 教会的生活",
     "约 16 分钟", "chapter14", "chapter16",
     "第十四章 福音的使命", "第十六章 主权与日常"),

    # ── Part VII ──
    ("chapter16", "第十六章 主权与日常", "第七部 福音的全然更新",
     "约 18 分钟", "chapter15", "chapter17",
     "第十五章 敬拜与全人", "第十七章 苦难与主权"),
    ("chapter17", "第十七章 苦难与主权", "第七部 福音的全然更新",
     "约 16 分钟", "chapter16", "chapter18",
     "第十六章 主权与日常", "第十八章 盼望的终局"),
    ("chapter18", "第十八章 盼望的终局", "第七部 福音的全然更新",
     "约 20 分钟", "chapter17", "conclusion",
     "第十七章 苦难与主权", "结语"),

    # ── Conclusion / Appendix ──
    ("conclusion", "结语：福音，直到地极", "结语",
     "约 12 分钟", "chapter18", "appendix",
     "第十八章 盼望的终局", "附录"),
    ("appendix", "附录：福音对话实用指南", "附录",
     "约 15 分钟", "conclusion", "guide",
     "结语：福音，直到地极", "学习讨论手册"),
    ("guide", "学习讨论手册", "附录",
     "约 20 分钟", "appendix", None,
     "附录：福音对话实用指南", None),
]

PART_HEADINGS = {
    "第一部": "福音的根基",
    "第二部": "神在基督里的作为",
    "第三部": "门徒的生命",
    "第四部": "称义与成圣",
    "第五部": "救恩的保障",
    "第六部": "教会的生活",
    "第七部": "福音的全然更新",
}

COVER_TOC = [
    ("前言 / 导论", [
        ("preface.html", "前言：福音主权的回归"),
        ("keywords.html", "关键术语简释"),
        ("introduction.html", "导言：从廉价恩典到主权呼召"),
    ]),
    ("第一部 福音的根基", [
        ("chapter01.html", "第一章 福音的主权"),
        ("chapter02.html", "第二章 人的全然败坏"),
    ]),
    ("第二部 神在基督里的作为", [
        ("chapter03.html", "第三章 上帝的公义与慈爱"),
        ("chapter04.html", "第四章 基督的代赎"),
        ("chapter05.html", "第五章 悔改与信心"),
    ]),
    ("第三部 门徒的生命", [
        ("chapter06.html", "第六章 作门徒的代价"),
        ("chapter07.html", "第七章 老我的钉死"),
    ]),
    ("第四部 称义与成圣", [
        ("chapter08.html", "第八章 在基督里得自由"),
        ("chapter09.html", "第九章 圣灵的更新"),
    ]),
    ("第五部 救恩的保障", [
        ("chapter10.html", "第十章 恩典中的坚忍"),
        ("chapter11.html", "第十一章 律法与福音"),
        ("chapter12.html", "第十二章 教会的记号"),
    ]),
    ("第六部 教会的生活", [
        ("chapter13.html", "第十三章 圣礼与恩典"),
        ("chapter14.html", "第十四章 福音的使命"),
        ("chapter15.html", "第十五章 敬拜与全人"),
    ]),
    ("第七部 福音的全然更新", [
        ("chapter16.html", "第十六章 主权与日常"),
        ("chapter17.html", "第十七章 苦难与主权"),
        ("chapter18.html", "第十八章 盼望的终局"),
    ]),
    ("总结 / 附录", [
        ("conclusion.html", "结语：福音，直到地极"),
        ("appendix.html", "附录：福音对话实用指南"),
        ("guide.html", "学习讨论手册"),
    ]),
]

CHAPTER_NAV_TOC = [
    ("前言 / 导论", [
        ("preface.html", "前言：福音主权的回归"),
        ("keywords.html", "关键术语简释"),
        ("introduction.html", "导言：从廉价恩典到主权呼召"),
    ]),
    ("第一部 福音的根基", [
        ("chapter01.html", "第一章 福音的主权"),
        ("chapter02.html", "第二章 人的全然败坏"),
    ]),
    ("第二部 神在基督里的作为", [
        ("chapter03.html", "第三章 上帝的公义与慈爱"),
        ("chapter04.html", "第四章 基督的代赎"),
        ("chapter05.html", "第五章 悔改与信心"),
    ]),
    ("第三部 门徒的生命", [
        ("chapter06.html", "第六章 作门徒的代价"),
        ("chapter07.html", "第七章 老我的钉死"),
    ]),
    ("第四部 称义与成圣", [
        ("chapter08.html", "第八章 在基督里得自由"),
        ("chapter09.html", "第九章 圣灵的更新"),
    ]),
    ("第五部 救恩的保障", [
        ("chapter10.html", "第十章 恩典中的坚忍"),
        ("chapter11.html", "第十一章 律法与福音"),
        ("chapter12.html", "第十二章 教会的记号"),
    ]),
    ("第六部 教会的生活", [
        ("chapter13.html", "第十三章 圣礼与恩典"),
        ("chapter14.html", "第十四章 福音的使命"),
        ("chapter15.html", "第十五章 敬拜与全人"),
    ]),
    ("第七部 福音的全然更新", [
        ("chapter16.html", "第十六章 主权与日常"),
        ("chapter17.html", "第十七章 苦难与主权"),
        ("chapter18.html", "第十八章 盼望的终局"),
    ]),
    ("总结 / 附录", [
        ("conclusion.html", "结语：福音，直到地极"),
        ("appendix.html", "附录：福音对话实用指南"),
        ("guide.html", "学习讨论手册"),
    ]),
]


# ── Templates ─────────────────────────────────────────────────────

def make_sidebar_toc(active_id):
    """Build sidebar TOC HTML, marking active_id as active."""
    lines = []
    for part_name, entries in CHAPTER_NAV_TOC:
        lines.append(f'<div class="toc-part">{part_name}</div>')
        for (href, title) in entries:
            cls = ' class="toc-item active"' if href.replace('.html','') == active_id else ' class="toc-item"'
            lines.append(f'<a{cls} href="{href}">{title}</a>')
    return "\n".join(lines)


def make_cover_toc_html():
    lines = []
    for part_name, entries in COVER_TOC:
        lines.append(f'<div class="cover-part-title">{part_name}</div>')
        for (href, title) in entries:
            lines.append(f'<a class="cover-toc-item" href="{href}"><span class="item-title">{title}</span><span class="item-arrow">→</span></a>')
    return "\n".join(lines)


HEAD_COMMON = """<!DOCTYPE html>

<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>{title} — 主权的福音</title>
<script>
(function(){{try{{var s=localStorage,r=document.documentElement;
var t=s.getItem('reader_theme');if(t)r.setAttribute('data-theme',t);
var f=s.getItem('reader_font');if(f)r.style.setProperty('--reading-font',f+'px');
var m=s.getItem('reader_measure');if(m)r.style.setProperty('--reading-measure',m);
}}catch(e){{}})}}();
</script>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link href="../assets/css/reader.css" rel="stylesheet"/><link href="../assets/css/courseware-panel.css" rel="stylesheet"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&amp;family=Noto+Sans+SC:wght@400;500;700&amp;family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&amp;display=swap" rel="stylesheet"/>
</head>"""

SITE_NAV = '<body><nav class="site-nav">\n<a class="nav-link" href="/">主页</a>\n<a class="nav-link" href="/organicchurch/index.html">文章</a>\n<a class="nav-link" href="/organicchurch/books/">著作</a>\n</nav>'


def chapter_html(ch, sid):
    """Generate a full chapter HTML file."""
    title = ch[1]
    kicker = ch[2]
    reading_time = ch[3]
    prev_id = ch[4]
    next_id = ch[5]
    prev_title = ch[6]
    next_title = ch[7]

    # Courseware link
    courseware_url = f'../courseware/chapter.html?c={sid}'
    courseware_btn = f'<a class="nav-btn courseware-btn" href="{courseware_url}" style="background-color: var(--accent2); color: #fff; border-color: var(--accent2);">互动课件</a>'
    courseware_footer_btn = f'<a class="courseware-footer-btn" href="{courseware_url}" style="background-color: var(--accent2); color: #fff; border-color: var(--accent2);">作答思考题 / 互动课件</a>'

    # Nav buttons
    prev_btn = f'<a class="nav-btn prev-btn" href="{prev_id}.html">←<span class="nav-label"> 上一章</span></a>' if prev_id else '<span class="nav-btn disabled">←<span class="nav-label"> 上一章</span></span>'
    next_btn = f'<a class="nav-btn next-btn" href="{next_id}.html"><span class="nav-label">下一章 </span>→</a>' if next_id else '<span class="nav-btn disabled"><span class="nav-label">下一章 </span>→</span>'

    # Footer nav
    prev_footer = f'<a href="{prev_id}.html">← {prev_title}</a>' if prev_id else '<span></span>'
    next_footer = f'<a href="{next_id}.html">{next_title} →</a>' if next_id else '<span></span>'

    topbar_title = BOOK_TITLE_ZH
    book_home = 'index.html'
    sidebar_toc = make_sidebar_toc(sid)

    return f"""{HEAD_COMMON.format(title=title)}
{SITE_NAV}
<!-- Progress bar -->
<div id="progress-bar"></div>
<!-- Overlay -->
<div class="overlay" id="overlay" onclick="closeSidebar()"></div>
<!-- Sidebar -->
<nav aria-label="目录" class="sidebar" id="sidebar">
<div class="sidebar-header">
<a class="book-title-link" href="{book_home}">{BOOK_TITLE_ZH}<small>Dominus · Evangelium</small></a>
<button aria-label="关闭目录" class="close-btn" onclick="closeSidebar()">✕</button>
</div>
<div class="toc-tree">
{sidebar_toc}
</div>
</nav>
<!-- In-chapter outline (scroll-spy) -->
<aside aria-label="本章导航" class="outline" id="outline"></aside>
<!-- Main layout -->
<div class="layout">
<!-- Topbar -->
<header class="topbar">
<button aria-label="打开目录" class="hamburger" onclick="toggleSidebar()">☰</button>
<span class="topbar-title">{topbar_title}</span>
<div class="chapter-nav">
{prev_btn}
{next_btn}
{courseware_btn}
<div class="reader-tools">
<button aria-label="阅读设置" class="tool-btn" id="settingsBtn" onclick="toggleSettings(event)">Aa</button>
<div aria-label="阅读设置" class="settings-panel" id="settingsPanel" role="dialog">
<div class="settings-row">
<div class="settings-label">主题</div>
<div class="seg">
<button class="seg-btn" data-theme-opt="light" onclick="readerSetTheme('light')"><span class="swatch-dot" style="background:#FAF6EC"></span>纸</button>
<button class="seg-btn" data-theme-opt="sepia" onclick="readerSetTheme('sepia')"><span class="swatch-dot" style="background:#E9D4A8"></span>赭</button>
<button class="seg-btn" data-theme-opt="dark" onclick="readerSetTheme('dark')"><span class="swatch-dot" style="background:#2A2218"></span>夜</button>
</div>
</div>
<div class="settings-row">
<div class="settings-label">字号</div>
<div class="font-stepper">
<button aria-label="减小字号" onclick="readerStepFont(-1)">A−</button>
<span class="font-val" id="fontVal">19 px</span>
<button aria-label="增大字号" onclick="readerStepFont(1)">A+</button>
</div>
</div>
<div class="settings-row">
<div class="settings-label">版宽</div>
<div class="seg">
<button class="seg-btn" data-measure-opt="640px" onclick="readerSetMeasure('640px')">窄</button>
<button class="seg-btn" data-measure-opt="720px" onclick="readerSetMeasure('720px')">适中</button>
<button class="seg-btn" data-measure-opt="840px" onclick="readerSetMeasure('840px')">宽</button>
</div>
</div>
</div>
</div>
</div>
</header>
<!-- Content -->
<main class="content" id="main-content">
<div class="chapter-header">
<div class="chapter-kicker">{kicker}</div>
<h1 class="chapter-title">{title}</h1>
<div class="chapter-meta">{reading_time}</div>
</div>
<article class="body-text" lang="zh-CN">

{CONTENT_PLACEHOLDER}

</article>
<footer class="chapter-footer">
<div class="chapter-nav-footer">
{prev_footer}
{courseware_footer_btn}<a class="foot-home" href="{book_home}">≡ 目录</a>
{next_footer}
</div>
</footer>
</main>
</div>
<!-- Back to top -->
<button aria-label="回到顶部" class="back-to-top" id="backToTop" onclick="scrollToTop()">⇧</button>

<script src="../assets/js/reader.js"></script>
<script src="../assets/js/courseware-panel.js"></script>
</body>
</html>"""


CONTENT_PLACEHOLDER = """<!-- ============================================================
     本章正文 — 待写入
     Template: 使用 h2/h3 做章节标题, h3.chapter-epigraph 做章首引语
     ============================================================ -->
<h3 class="chapter-epigraph">本章主题句</h3>

<p>本章正在撰写中。请使用以下格式填充正文内容：</p>

<h3>一、第一大部分</h3>

<p>正文内容…</p>

<h4>1. 小节标题</h4>

<p>小节正文…</p>

<blockquote>引用经文或文献</blockquote>

<h3>二、第二大部分</h3>

<p>正文内容…</p>

<hr/>

<p style="font-size:0.92em;color:var(--muted)"><strong>参考文献与注释：</strong></p>

<ol style="font-size:0.9em;color:var(--muted)">
  <li>注释内容…</li>
  <li>注释内容…</li>
</ol>"""


def generate_cover_page(out_dir):
    """Generate index.html cover page."""
    toc_html = make_cover_toc_html()

    cover = f"""<!DOCTYPE html>

<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>{BOOK_TITLE_ZH} — 目录</title>
<script>
(function(){{try{{var s=localStorage,r=document.documentElement;
var t=s.getItem('reader_theme');if(t)r.setAttribute('data-theme',t);
var f=s.getItem('reader_font');if(f)r.style.setProperty('--reading-font',f+'px');
var m=s.getItem('reader_measure');if(m)r.style.setProperty('--reading-measure',m);
}}catch(e){{}})}}();
</script>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&amp;family=Noto+Sans+SC:wght@400;500;700&amp;family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&amp;display=swap" rel="stylesheet"/>
<style>
/* ============================================================
   {BOOK_TITLE_ZH} — Digital Scriptorium reading theme
   Three themes (paper / sepia / night) via [data-theme].
   Reader-adjustable type size & column width via custom props.
   ============================================================ */
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

:root {{
  /* ----- palette: paper (default) ----- */
  --bg:        #FAF6EC;
  --bg-grain:  #F3ECDB;
  --surface:   #F4EEDF;
  --surface-2: #EFE7D4;
  --text:      #241B11;
  --muted:     #6A5C49;
  --faint:     #94866F;
  --accent:    #8A3517;   /* oxblood / sienna */
  --accent-ink:#732A11;
  --accent2:   #4A6741;   /* olive */
  --border:    #E2D8C3;
  --rule:      #D9CDB4;
  --quote-bg:  #F1E8D3;
  --mark:      rgba(138,53,23,0.10);
  --shadow:    rgba(48,33,16,0.13);

  /* ----- geometry ----- */
  --sidebar-w: 272px;
  --topbar-h:  56px;
  --reading-font:    19px;
  --reading-measure: 720px;
  --reading-lh:      1.95;

  --font-body: 'Noto Serif SC', 'Songti SC', 'Source Han Serif SC', Georgia, serif;
  --font-ui:   'Noto Sans SC', 'PingFang SC', system-ui, sans-serif;
  --font-latin:'EB Garamond', 'Noto Serif SC', Georgia, serif;
}}

/* ----- sepia ----- */
:root[data-theme="sepia"] {{
  --bg:#F3E7CE; --bg-grain:#ECDCBE; --surface:#EBDDBF; --surface-2:#E4D3B0;
  --text:#3A2C19; --muted:#6E5B3E; --faint:#917A56;
  --accent:#9A4318; --accent-ink:#7E3413; --accent2:#566B36;
  --border:#DBC8A4; --rule:#D2BD96; --quote-bg:#E9D9B6; --mark:rgba(154,67,24,0.12);
  --shadow:rgba(60,40,18,0.16);
}}

/* ----- night ----- */
:root[data-theme="dark"] {{
  --bg:#17140F; --bg-grain:#1C1813; --surface:#211C15; --surface-2:#272118;
  --text:#E4DAC8; --muted:#A89A82; --faint:#7E7361;
  --accent:#D98A4E; --accent-ink:#E59A5E; --accent2:#9DB87E;
  --border:#352D22; --rule:#3A3125; --quote-bg:#221D16; --mark:rgba(217,138,78,0.14);
  --shadow:rgba(0,0,0,0.5);
}}

html {{ scroll-behavior: smooth; }}

body {{
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--reading-font);
  line-height: var(--reading-lh);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  background-image:
    radial-gradient(circle at 18% 12%, var(--bg-grain) 0, transparent 42%),
    radial-gradient(circle at 82% 78%, var(--bg-grain) 0, transparent 46%);
  background-attachment: fixed;
  transition: background-color 0.4s ease, color 0.4s ease;
}}

::selection {{ background: var(--mark); }}

/* ===== Progress bar ===== */
#progress-bar {{
  position: fixed;
  top: 0; left: 0;
  height: 2px;
  width: 0%;
  background: linear-gradient(90deg, var(--accent2), var(--accent));
  z-index: 9999;
  transition: width 0.12s linear;
}}

/* ===== Overlay (mobile sidebar) ===== */
.overlay {{
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(24, 16, 8, 0.5);
  backdrop-filter: blur(2px);
  z-index: 200;
}}
.overlay.active {{ display: block; }}

/* ===== Content area ===== */
.content {{
  flex: 1;
  max-width: calc(var(--reading-measure) + 64px);
  margin: 0 auto;
  padding: 64px 32px 96px;
  width: 100%;
}}

/* ===== Site Navigation Bar ===== */
.site-nav {{
  height: 48px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px) saturate(1.1);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  z-index: 500;
  position: relative;
}}
.site-nav .nav-link {{
  font-family: 'Noto Sans SC', 'PingFang SC', system-ui, sans-serif;
  font-size: 14px;
  color: var(--muted);
  text-decoration: none;
  transition: color 0.2s;
  position: relative;
  letter-spacing: 0.02em;
}}
.site-nav .nav-link:hover {{ color: var(--accent); }}
.site-nav .nav-link::after {{
  content: "";
  position: absolute;
  left: 0; bottom: -5px;
  width: 0; height: 1.5px;
  background: var(--accent);
  transition: width 0.25s ease;
}}
.site-nav .nav-link:hover::after {{ width: 100%; }}

/* ===== Index / cover page ===== */
.cover-page {{ padding: 0; }}
.cover-controls {{
  position: fixed; top: 18px; right: 20px; z-index: 100;
}}
.cover-hero {{
  max-width: 760px;
  margin: clamp(48px, 11vh, 120px) auto 0;
  padding: 0 32px;
  text-align: center;
}}
.cover-decoration {{
  font-family: var(--font-latin);
  font-size: 13px; letter-spacing: 0.4em;
  color: var(--faint);
  margin-bottom: 30px;
  text-transform: uppercase;
}}
.cover-main-title {{
  font-family: var(--font-body);
  font-size: clamp(2.4rem, 1rem + 6vw, 4.4rem);
  font-weight: 700;
  color: var(--text);
  line-height: 1.12;
  letter-spacing: -0.01em;
  margin-bottom: 22px;
}}
.cover-greek {{
  font-family: var(--font-latin);
  font-size: clamp(0.95rem, 0.6rem + 1vw, 1.2rem);
  font-weight: 500;
  font-style: italic;
  color: var(--accent);
  letter-spacing: 0.16em;
  margin-bottom: 34px;
}}
.cover-tagline {{
  font-size: 1.05rem;
  color: var(--muted);
  line-height: 1.85;
  max-width: 30em;
  margin: 0 auto 28px;
  padding: 20px 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}}
.cover-stat {{
  font-family: var(--font-ui);
  font-size: 12.5px; color: var(--faint);
  letter-spacing: 0.04em;
  margin-bottom: 40px;
}}
.cover-cta {{
  display: inline-flex; align-items: center; gap: 10px;
  padding: 14px 34px;
  background: var(--accent); color: #fff;
  font-family: var(--font-ui); font-size: 15px;
  text-decoration: none; border-radius: 30px;
  letter-spacing: 0.05em;
  box-shadow: 0 12px 30px -10px var(--shadow);
  transition: transform 0.2s, background 0.2s;
}}
.cover-cta:hover {{ background: var(--accent-ink); transform: translateY(-2px); }}
:root[data-theme="dark"] .cover-cta {{ color: #1a1610; }}
.cover-resume {{
  display: block;
  margin-top: 18px;
  font-family: var(--font-ui); font-size: 13px;
  color: var(--accent2); text-decoration: none;
}}
.cover-resume:hover {{ text-decoration: underline; }}

.cover-toc {{ max-width: 760px; margin: 84px auto 100px; padding: 0 32px; }}
.cover-toc h2 {{
  font-family: var(--font-body);
  font-size: 1.1rem; font-weight: 700;
  color: var(--faint);
  letter-spacing: 0.18em;
  text-align: center;
  margin-bottom: 36px;
}}
.cover-part-title {{
  font-family: var(--font-ui);
  font-size: 12px; font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.1em;
  margin: 30px 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--rule);
}}
.cover-toc-item {{
  display: flex; align-items: baseline; gap: 12px;
  padding: 9px 6px;
  text-decoration: none;
  color: var(--text);
  font-family: var(--font-body); font-size: 15.5px;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s, padding-left 0.15s;
}}
.cover-toc-item:hover {{ background: var(--surface-2); color: var(--accent); padding-left: 12px; }}
.cover-toc-item .item-title {{ flex: 1; }}
.cover-toc-item .item-arrow {{ color: var(--faint); font-family: var(--font-latin); opacity: 0; transition: opacity 0.15s; }}
.cover-toc-item:hover .item-arrow {{ opacity: 1; }}
</style>
</head>
<body class="cover-page"><nav class="site-nav">
  <a href="/" class="nav-link">主页</a>
  <a href="/organicchurch/index.html" class="nav-link">文章</a>
  <a href="/organicchurch/books/" class="nav-link">著作</a>
</nav>
<!-- Progress bar (kept for consistent chrome) -->
<div id="progress-bar"></div>
<!-- Reader settings -->
<div class="cover-controls">
<div class="reader-tools">
<button aria-label="阅读设置" class="tool-btn" id="settingsBtn" onclick="toggleSettings(event)">Aa</button>
<div aria-label="阅读设置" class="settings-panel" id="settingsPanel" role="dialog">
<div class="settings-row">
<div class="settings-label">主题</div>
<div class="seg">
<button class="seg-btn" data-theme-opt="light" onclick="readerSetTheme('light')"><span class="swatch-dot" style="background:#FAF6EC"></span>纸</button>
<button class="seg-btn" data-theme-opt="sepia" onclick="readerSetTheme('sepia')"><span class="swatch-dot" style="background:#E9D4A8"></span>赭</button>
<button class="seg-btn" data-theme-opt="dark" onclick="readerSetTheme('dark')"><span class="swatch-dot" style="background:#2A2218"></span>夜</button>
</div>
</div>
<div class="settings-row">
<div class="settings-label">字号</div>
<div class="font-stepper">
<button aria-label="减小字号" onclick="readerStepFont(-1)">A−</button>
<span class="font-val" id="fontVal">19 px</span>
<button aria-label="增大字号" onclick="readerStepFont(1)">A+</button>
</div>
</div>
<div class="settings-row">
<div class="settings-label">版宽</div>
<div class="seg">
<button class="seg-btn" data-measure-opt="640px" onclick="readerSetMeasure('640px')">窄</button>
<button class="seg-btn" data-measure-opt="720px" onclick="readerSetMeasure('720px')">适中</button>
<button class="seg-btn" data-measure-opt="840px" onclick="readerSetMeasure('840px')">宽</button>
</div>
</div>
</div>
</div>
</div>
<!-- Cover hero -->
<div class="cover-hero">
<div class="cover-decoration">Dominus · Evangelium</div>
<h1 class="cover-main-title">{BOOK_TITLE_ZH}<br/><span style="font-family:var(--font-latin);font-size:0.45em;font-weight:400;display:block;margin-top:8px;color:var(--muted)">{BOOK_TITLE_EN}</span></h1>
<div class="cover-greek">{BOOK_LATIN}</div>
<p class="cover-tagline">
{BOOK_DESC_ZH}
</p>
<div class="cover-stat">全书十八章  ·  七部  ·  含学习讨论手册  ·  撰写中</div>
<a class="cover-cta" href="preface.html">开始阅读 →</a>
<a class="cover-resume" data-label="继续上次阅读" href="#" id="resumeLink" style="display:none">继续上次阅读</a>
</div>
<!-- Cover TOC -->
<div class="cover-toc">
<h2>目 录</h2>
{toc_html}
</div>
<script>

(function () {{
  var root = document.documentElement;
  var page = window.location.pathname.split('/').pop() || 'index.html';
  var store = (function () {{
    try {{ var t = '__t'; localStorage.setItem(t, t); localStorage.removeItem(t); return localStorage; }}
    catch (e) {{ return null; }}
  }})();
  var get = function (k, d) {{ try {{ var v = store && store.getItem(k); return v === null || v === undefined ? d : v; }} catch (e) {{ return d; }} }};
  var set = function (k, v) {{ try {{ store && store.setItem(k, v); }} catch (e) {{}} }};

  /* ---------- Reading preferences ---------- */
  var FONT_MIN = 16, FONT_MAX = 24;
  function applyFont(px) {{ root.style.setProperty('--reading-font', px + 'px'); }}
  function applyMeasure(px) {{ root.style.setProperty('--reading-measure', px); }}
  function applyTheme(t) {{
    root.setAttribute('data-theme', t);
    document.querySelectorAll('[data-theme-opt]').forEach(function (b) {{
      b.classList.toggle('active', b.getAttribute('data-theme-opt') === t);
    }});
  }}

  var curFont = parseInt(get('reader_font', '19'), 10);
  var curMeasure = get('reader_measure', '720px');
  var curTheme = get('reader_theme', 'light');
  applyFont(curFont); applyMeasure(curMeasure); applyTheme(curTheme);

  function syncControls() {{
    var fv = document.getElementById('fontVal');
    if (fv) fv.textContent = curFont + ' px';
    document.querySelectorAll('[data-measure-opt]').forEach(function (b) {{
      b.classList.toggle('active', b.getAttribute('data-measure-opt') === curMeasure);
    }});
  }}

  window.readerSetTheme = function (t) {{ curTheme = t; applyTheme(t); set('reader_theme', t); }};
  window.readerStepFont = function (d) {{
    curFont = Math.max(FONT_MIN, Math.min(FONT_MAX, curFont + d));
    applyFont(curFont); set('reader_font', String(curFont)); syncControls();
  }};
  window.readerSetMeasure = function (m) {{ curMeasure = m; applyMeasure(m); set('reader_measure', m); syncControls(); }};

  /* settings popover */
  window.toggleSettings = function (ev) {{
    if (ev) ev.stopPropagation();
    var p = document.getElementById('settingsPanel');
    var b = document.getElementById('settingsBtn');
    if (!p) return;
    var open = p.classList.toggle('open');
    if (b) b.classList.toggle('open', open);
    syncControls();
  }};
  document.addEventListener('click', function (e) {{
    var p = document.getElementById('settingsPanel');
    if (!p || !p.classList.contains('open')) return;
    if (!p.contains(e.target) && e.target.id !== 'settingsBtn') {{
      p.classList.remove('open');
      var b = document.getElementById('settingsBtn'); if (b) b.classList.remove('open');
    }}
  }});

  /* ---------- Progress + back-to-top ---------- */
  var bar = document.getElementById('progress-bar');
  function onScroll() {{
    var st = window.scrollY || document.documentElement.scrollTop;
    var dh = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (dh > 0 ? (st / dh) * 100 : 0) + '%';
    set('book_pos_' + page, st);
    if (page && page !== 'index.html') {{ set('reader_last_page', page); }}
  }}

  /* ---------- Resume (cover page) ---------- */
  function setupResume() {{
    var el = document.getElementById('resumeLink');
    if (!el) return;
    var last = get('reader_last_page', '');
    if (last && last !== 'index.html') {{
      var label = el.getAttribute('data-label') || '继续阅读';
      el.href = last;
      el.textContent = '↻ ' + label;
      el.style.display = 'block';
    }}
  }}

  window.addEventListener('scroll', onScroll, {{ passive: true }});
  window.addEventListener('DOMContentLoaded', function () {{ setupResume(); syncControls(); }});
  window.addEventListener('load', function () {{ onScroll(); }});
}})();

</script>
</body>
</html>"""
    out_path = os.path.join(out_dir, "index.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(cover)
    print(f"  [OK] {out_path}")


def generate_chapters(out_dir):
    """Generate all chapter HTML files."""
    for ch in CHAPTERS:
        sid = ch[0]
        html = chapter_html(ch, sid)
        out_path = os.path.join(out_dir, f"{sid}.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  [OK] {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate lordship_gospel book files")
    parser.add_argument("--base-dir", default=None,
                        help="Base directory (default: script location + ../../lordship_gospel)")
    args = parser.parse_args()

    if args.base_dir:
        base = args.base_dir
    else:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    book2_dir = os.path.join(base, "book2")
    os.makedirs(book2_dir, exist_ok=True)

    print("Generating cover page...")
    generate_cover_page(book2_dir)

    print("Generating chapter files...")
    generate_chapters(book2_dir)

    print("\nDone! Generated 1 cover + %d chapter files in %s" % (len(CHAPTERS), book2_dir))


if __name__ == "__main__":
    main()
