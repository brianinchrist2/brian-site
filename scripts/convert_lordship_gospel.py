#!/usr/bin/env python3
"""Convert lordship_gospel Markdown source to oikos_church-book2 reader HTML format."""

import os, re, shutil

SRC_DIR = r"D:\projects\brian-site\lordship_gospel"
DST_DIR = r"D:\projects\brian-site\brianinchrist\organicchurch\books\lordship_gospel\book2"
ASSETS_DIR = r"D:\projects\brian-site\brianinchrist\organicchurch\books\lordship_gospel\assets"

BOOK_TITLE = "主权福音与传福音"
BOOK_SUBTITLE = "The Lordship Gospel"
BOOK_SHORT = "主权福音"
BOOK_GREEK = "Basileia · Kerygma · Pistis"
BOOK_TAGLINE = "从圣经神学重新认识福音——福音不是关于你 needs 的故事，而是关于神掌权的宣告。"
BOOK_STATS = "全书十六章  ·  两部分  ·  含传福音实操  ·  约 8 万字"
COVER_DECORATION = "Euangelion · Regnum Dei"

# Color palette: royal / kingship theme
PALETTE = {
    "bg": "#FAF6EC",
    "bg_grain": "#F3ECDB",
    "surface": "#F4EEDF",
    "surface_2": "#EFE7D4",
    "text": "#241B11",
    "muted": "#6A5C49",
    "faint": "#94866F",
    "accent": "#5B3E7A",  # deep purple — royalty
    "accent_ink": "#4A2E66",
    "accent2": "#7A6B3E",  # gold
    "border": "#E2D8C3",
    "rule": "#D9CDB4",
    "quote_bg": "#F1E8D3",
    "mark": "rgba(91,62,122,0.10)",
    "shadow": "rgba(48,33,16,0.13)",
}

PALETTE_SEPIA = {
    "bg": "#F3E7CE",
    "bg_grain": "#ECDCBE",
    "surface": "#EBDDBF",
    "surface_2": "#E4D3B0",
    "text": "#3A2C19",
    "muted": "#6E5B3E",
    "faint": "#917A56",
    "accent": "#7B4D6E",
    "accent_ink": "#633C59",
    "accent2": "#7A6B3E",
    "border": "#DBC8A4",
    "rule": "#D2BD96",
    "quote_bg": "#E9D9B6",
    "mark": "rgba(123,77,110,0.12)",
    "shadow": "rgba(60,40,18,0.16)",
}

PALETTE_DARK = {
    "bg": "#17140F",
    "bg_grain": "#1C1813",
    "surface": "#211C15",
    "surface_2": "#272118",
    "text": "#E4DAC8",
    "muted": "#A89A82",
    "faint": "#7E7361",
    "accent": "#C7A9E0",  # light purple for dark mode
    "accent_ink": "#D4B8EB",
    "accent2": "#B6A86B",
    "border": "#352D22",
    "rule": "#3A3125",
    "quote_bg": "#221D16",
    "mark": "rgba(199,169,224,0.14)",
    "shadow": "rgba(0,0,0,0.5)",
}

def p(name, p=None):
    """Get palette value."""
    d = p or PALETTE
    return d[name]

def css_vars(palette):
    return f"""  --bg:        {p('bg', palette)};
  --bg-grain:  {p('bg_grain', palette)};
  --surface:   {p('surface', palette)};
  --surface-2: {p('surface_2', palette)};
  --text:      {p('text', palette)};
  --muted:     {p('muted', palette)};
  --faint:     {p('faint', palette)};
  --accent:    {p('accent', palette)};
  --accent-ink:{p('accent_ink', palette)};
  --accent2:   {p('accent2', palette)};
  --border:    {p('border', palette)};
  --rule:      {p('rule', palette)};
  --quote-bg:  {p('quote_bg', palette)};
  --mark:      {p('mark', palette)};
  --shadow:    {p('shadow', palette)};"""

def make_reader_css():
    """Generate adapted reader.css with lordship_gospel palette."""
    css_path = os.path.join(ASSETS_DIR, "css", "reader.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()
    # Replace palette colors
    # We won't try to replace all - the CSS is complex. Let's instead write the new palette
    return css

# Chapter mapping
CHAPTERS = [
    ("introduction",  "00", "绪论", "速成福音的危机与反思", None, "绪论"),
    ("chapter01",     "01", "第一章", "福音的视角——从人的需要到神的计划", "第一部", "第一部分 认识主权福音"),
    ("chapter02",     "02", "第二章", "福音的锚点——你的神做王了", "第一部", None),
    ("chapter03",     "03", "第三章", "十字架与复活——得胜做王的记号与凭证", "第一部", None),
    ("chapter04",     "04", "第四章", "在主权中的赦罪与悔改", "第一部", None),
    ("chapter05",     "05", "第五章", "信心的实质——效忠于所信的王", "第一部", None),
    ("chapter06",     "06", "第六章", "效忠与婚约——信仰关系的两个类比", "第一部", None),
    ("chapter07",     "07", "第七章", "跟随耶稣——加入使命的共同体", "第一部", None),
    ("bridging",      "08", "承转章", "从认识福音到传扬福音", None, "承转"),
    ("chapter08",     "09", "第八章", "福音宣告与见证——传福音的本质", "第二部", "第二部分 传扬主权福音"),
    ("chapter09",     "10", "第九章", "领人归主的四个阶段", "第二部", None),
    ("chapter10",     "11", "第十章", "传福音的策略——恩典、宣讲与寻找", "第二部", None),
    ("chapter11",     "12", "第十一章", "圣灵的能力与传福音的祷告", "第二部", None),
    ("chapter12",     "13", "第十二章", "个人布道实操——三个故事与两个范例", "第二部", None),
    ("chapter13",     "14", "第十三章", "小组布道与福音小组", "第二部", None),
    ("chapter14",     "15", "第十四章", "常见误区与反思", "第二部", None),
    ("conclusion",    "16", "结语", "重价的福音，真正的门徒", None, "结语"),
    ("appendix",      "",   "附录", "效忠与历史神学的对话", None, "附录"),
]

# Map source filenames to our IDs
SRC_MAP = {
    "introduction": "00_绪论_速成福音的危机与反思.md",
    "chapter01": "01_第一章_福音的视角_从人的需要到神的计划.md",
    "chapter02": "02_第二章_福音的锚点_你的神做王了.md",
    "chapter03": "03_第三章_十字架与复活_得胜做王的记号与凭证.md",
    "chapter04": "04_第四章_在主权中的赦罪与悔改.md",
    "chapter05": "05_第五章_信心的实质_效忠于所信的王.md",
    "chapter06": "06_第六章_效忠与婚约_信仰关系的两个类比.md",
    "chapter07": "07_第七章_跟随耶稣_加入使命的共同体.md",
    "bridging": "08_承转章_从认识福音到传扬福音.md",
    "chapter08": "09_第八章_福音宣告与见证_传福音的本质.md",
    "chapter09": "10_第九章_领人归主的四个阶段.md",
    "chapter10": "11_第十章_传福音的策略_恩典宣讲与寻找.md",
    "chapter11": "12_第十一章_圣灵的能力与传福音的祷告.md",
    "chapter12": "13_第十二章_个人布道_三个故事与两个范例.md",
    "chapter13": "14_第十三章_小组布道与福音小组.md",
    "chapter14": "15_第十四章_常见误区与反思.md",
    "conclusion": "16_结语_重价的福音与真正的门徒.md",
    "appendix": "17_附录_效忠与历史神学的对话.md",
}

def read_markdown(chapter_id):
    fname = SRC_MAP[chapter_id]
    path = os.path.join(SRC_DIR, fname)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def md_to_html(md_text):
    """Convert Markdown to basic HTML suitable for the reader."""
    lines = md_text.split("\n")
    html_parts = []
    i = 0
    n = len(lines)
    
    while i < n:
        line = lines[i]
        
        # Skip empty lines (but keep as paragraph separators)
        if not line.strip():
            i += 1
            continue
        
        # Horizontal rule
        if line.strip() == "---":
            html_parts.append('<hr class="section-divider" />')
            i += 1
            continue
        
        # Headings
        h_match = re.match(r'^(#{1,3})\s+(.+)$', line)
        if h_match:
            level = len(h_match.group(1))
            text = h_match.group(2).strip()
            # Add id for scroll-spy
            slug = re.sub(r'[^\w\u4e00-\u9fff]+', '-', text).strip('-').lower()[:40]
            tag = f"h{level+1}" if level == 1 else f"h{level+1}"  # h1->h2, h2->h3, h3->h4
            # Actually in the reader, the main title is in chapter-header, so body uses h2/h3/h4
            # h1 in source → h2 in body, h2 → h3, h3 → h4
            html_tag = f"h{level+1}"
            html_parts.append(f'<{html_tag} id="{slug}">{escape_html(text)}</{html_tag}>')
            i += 1
            continue
        
        # Blockquotes (multi-line)
        if line.startswith(">"):
            bq_lines = []
            while i < n and lines[i].startswith(">"):
                bq_lines.append(lines[i][1:].strip())
                i += 1
            bq_parts = []
            for bq_l in bq_lines:
                bq_l = escape_html(bq_l)
                bq_l = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', bq_l)
                bq_l = re.sub(r'\*(.+?)\*', r'<em>\1</em>', bq_l)
                bq_parts.append(bq_l)
            bq_html = "<br/>\n".join(bq_parts)
            html_parts.append(f"<blockquote>{bq_html}</blockquote>")
            continue
        
        # Regular paragraphs - collect until empty line or other block
        para_lines = []
        while i < n:
            l = lines[i].strip()
            if not l:
                break
            if l.startswith("---") or l.startswith("#") or l.startswith(">"):
                break
            para_lines.append(l)
            i += 1
        
        if para_lines:
            para = "\n".join(para_lines)
            para = escape_html(para)
            # Process bold/italic within paragraph
            para = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', para)
            para = re.sub(r'\*(.+?)\*', r'<em>\1</em>', para)
            html_parts.append(f"<p>{para}</p>")
    
    return "\n".join(html_parts)

def escape_html(text):
    """Escape basic HTML entities."""
    text = text.replace("&", "&amp;")
    text = text.replace("<", "&lt;")
    text = text.replace(">", "&gt;")
    return text

def get_chapter_index(chapter_id):
    for idx, c in enumerate(CHAPTERS):
        if c[0] == chapter_id:
            return idx
    return -1

def get_prev_next(chapter_id):
    idx = get_chapter_index(chapter_id)
    prev_c = CHAPTERS[idx - 1] if idx > 0 else None
    next_c = CHAPTERS[idx + 1] if idx < len(CHAPTERS) - 1 else None
    return prev_c, next_c

def make_sidebar_toc(current_id):
    """Generate sidebar TOC HTML."""
    parts = [
        ("绪论", ["introduction"]),
        ("第一部分 认识主权福音", ["chapter01","chapter02","chapter03","chapter04","chapter05","chapter06","chapter07"]),
        ("承转", ["bridging"]),
        ("第二部分 传扬主权福音", ["chapter08","chapter09","chapter10","chapter11","chapter12","chapter13","chapter14"]),
        ("结语", ["conclusion"]),
        ("附录", ["appendix"]),
    ]
    
    # Map chapter IDs to their display info
    info = {}
    for c in CHAPTERS:
        info[c[0]] = f"{c[2]} {c[3]}"
    
    html = ""
    for part_name, ch_ids in parts:
        html += f'<div class="toc-part">{part_name}</div>\n'
        for ch_id in ch_ids:
            active = ' active' if ch_id == current_id else ''
            html += f'<a class="toc-item{active}" href="{ch_id}.html">{info[ch_id]}</a>\n'
    
    return html

def make_cover_toc():
    """Generate cover page TOC HTML."""
    html = ""
    
    # Introduction
    html += '<div class="cover-part-title">绪论</div>\n'
    html += '<a class="cover-toc-item" href="introduction.html"><span class="item-title">绪论：速成福音的危机与反思</span><span class="item-arrow">→</span></a>\n'
    
    # Part 1
    html += '<div class="cover-part-title">第一部分 认识主权福音</div>\n'
    html += '<a class="cover-toc-item" href="chapter01.html"><span class="item-title">第一章 福音的视角——从人的需要到神的计划</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter02.html"><span class="item-title">第二章 福音的锚点——你的神做王了</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter03.html"><span class="item-title">第三章 十字架与复活——得胜做王的记号与凭证</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter04.html"><span class="item-title">第四章 在主权中的赦罪与悔改</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter05.html"><span class="item-title">第五章 信心的实质——效忠于所信的王</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter06.html"><span class="item-title">第六章 效忠与婚约——信仰关系的两个类比</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter07.html"><span class="item-title">第七章 跟随耶稣——加入使命的共同体</span><span class="item-arrow">→</span></a>\n'
    
    # Bridging
    html += '<div class="cover-part-title">承转</div>\n'
    html += '<a class="cover-toc-item" href="bridging.html"><span class="item-title">承转章：从认识福音到传扬福音</span><span class="item-arrow">→</span></a>\n'
    
    # Part 2
    html += '<div class="cover-part-title">第二部分 传扬主权福音</div>\n'
    html += '<a class="cover-toc-item" href="chapter08.html"><span class="item-title">第八章 福音宣告与见证——传福音的本质</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter09.html"><span class="item-title">第九章 领人归主的四个阶段</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter10.html"><span class="item-title">第十章 传福音的策略——恩典、宣讲与寻找</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter11.html"><span class="item-title">第十一章 圣灵的能力与传福音的祷告</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter12.html"><span class="item-title">第十二章 个人布道实操——三个故事与两个范例</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter13.html"><span class="item-title">第十三章 小组布道与福音小组</span><span class="item-arrow">→</span></a>\n'
    html += '<a class="cover-toc-item" href="chapter14.html"><span class="item-title">第十四章 常见误区与反思</span><span class="item-arrow">→</span></a>\n'
    
    # Conclusion
    html += '<div class="cover-part-title">结语</div>\n'
    html += '<a class="cover-toc-item" href="conclusion.html"><span class="item-title">结语：重价的福音，真正的门徒</span><span class="item-arrow">→</span></a>\n'
    
    # Appendix
    html += '<div class="cover-part-title">附录</div>\n'
    html += '<a class="cover-toc-item" href="appendix.html"><span class="item-title">附录：效忠与历史神学的对话</span><span class="item-arrow">→</span></a>\n'
    
    # Study guide
    html += '<div class="cover-part-title">学习资源</div>\n'
    html += '<a class="cover-toc-item" href="guide.html"><span class="item-title">小组讨论课件</span><span class="item-arrow">→</span></a>\n'
    
    return html

def generate_inline_css():
    """Generate the inline CSS for index.html with lordship_gospel palette."""
    p = PALETTE
    ps = PALETTE_SEPIA
    pd = PALETTE_DARK
    return f""":root {{
  --bg:{p['bg']};--bg-grain:{p['bg_grain']};--surface:{p['surface']};--surface-2:{p['surface_2']};
  --text:{p['text']};--muted:{p['muted']};--faint:{p['faint']};
  --accent:{p['accent']};--accent-ink:{p['accent_ink']};--accent2:{p['accent2']};
  --border:{p['border']};--rule:{p['rule']};--quote-bg:{p['quote_bg']};
  --mark:{p['mark']};--shadow:{p['shadow']};--shadow-card:{p['shadow']};--shadow-deep:rgba(48,33,16,0.22);
  --font-body:'Noto Serif SC','Songti SC','Source Han Serif SC',Georgia,serif;
  --font-ui:'Noto Sans SC','PingFang SC',system-ui,sans-serif;
  --font-latin:'EB Garamond','Noto Serif SC',Georgia,serif;
  --space-xs:8px;--space-sm:14px;--space-md:22px;--space-lg:36px;
  --space-xl:60px;--space-xxl:96px;
  --measure:720px;--content-max:1180px;--nav-h:64px;
  --sidebar-w:272px;--topbar-h:56px;
  --reading-font:19px;--reading-measure:720px;--reading-lh:1.95;
}}"""

def generate_index_html():
    """Generate the lordship_gospel index.html TOC page."""
    css = generate_inline_css()
    cover_toc = make_cover_toc()
    
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>{BOOK_TITLE} — 目录</title>
<script>
(function(){{try{{var s=localStorage,r=document.documentElement;
var t=s.getItem('reader_theme');if(t)r.setAttribute('data-theme',t);
var f=s.getItem('reader_font');if(f)r.style.setProperty('--reading-font',f+'px');
var m=s.getItem('reader_measure');if(m)r.style.setProperty('--reading-measure',m);
}}catch(e){{}}}})();
</script>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&amp;family=Noto+Sans+SC:wght@400;500;700&amp;family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&amp;display=swap" rel="stylesheet"/>
<style>
*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
html{{scroll-behavior:smooth}}
body{{font-family:var(--font-body);background:var(--bg);color:var(--text);
  line-height:1.85;font-size:17px;-webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  background-image:radial-gradient(circle at 18% 12%,var(--bg-grain) 0,transparent 42%),radial-gradient(circle at 82% 78%,var(--bg-grain) 0,transparent 46%);
  background-attachment:fixed;transition:background-color .4s ease,color .4s ease}}
::selection{{background:var(--mark);color:var(--accent-ink)}}
a{{color:inherit;text-decoration:none}}
ul{{list-style:none}}
:focus-visible{{outline:2px solid var(--accent);outline-offset:3px}}

{css}

/* Progress bar */
#progress-bar{{position:fixed;top:0;left:0;height:2px;width:0%;
  background:linear-gradient(90deg,var(--accent2),var(--accent));z-index:9999;
  transition:width .12s linear}}

/* Site nav */
.site-nav{{height:48px;
  background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:blur(12px) saturate(1.1);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:center;gap:28px;
  z-index:500;position:relative}}
.site-nav .nav-link{{font-family:'Noto Sans SC','PingFang SC',system-ui,sans-serif;
  font-size:14px;color:var(--muted);text-decoration:none;
  transition:color .2s;position:relative;letter-spacing:.02em}}
.site-nav .nav-link:hover{{color:var(--accent)}}
.site-nav .nav-link::after{{content:"";position:absolute;left:0;bottom:-5px;
  width:0;height:1.5px;background:var(--accent);transition:width .25s ease}}
.site-nav .nav-link:hover::after{{width:100%}}

/* Reader settings */
.cover-controls{{position:fixed;top:60px;right:24px;z-index:300}}
.reader-tools{{position:relative}}
.tool-btn{{font-family:var(--font-latin);font-size:16px;font-weight:600;
  color:var(--text);background:var(--surface);
  border:1px solid var(--border);border-radius:20px;
  width:40px;height:32px;cursor:pointer;
  transition:background .15s,border-color .15s;line-height:1}}
.tool-btn:hover,.tool-btn.open{{background:var(--mark);border-color:var(--accent)}}
.settings-panel{{position:absolute;top:calc(100% + 12px);right:0;width:268px;
  background:var(--surface);border:1px solid var(--border);border-radius:14px;
  box-shadow:0 18px 44px -12px var(--shadow),0 4px 10px -6px var(--shadow);
  padding:18px;z-index:400;
  opacity:0;transform:translateY(-8px) scale(.98);
  transform-origin:top right;pointer-events:none;
  transition:opacity .2s ease,transform .2s ease}}
.settings-panel.open{{opacity:1;transform:none;pointer-events:auto}}
.settings-row{{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px}}
.settings-row:last-child{{margin-bottom:0}}
.settings-label{{font-family:var(--font-ui);font-size:12px;color:var(--muted);letter-spacing:.04em;flex-shrink:0}}
.seg{{display:flex;gap:6px}}
.seg-btn{{font-family:var(--font-ui);font-size:11px;padding:4px 12px;border-radius:14px;
  border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;
  transition:all .15s;display:flex;align-items:center;gap:5px}}
.seg-btn:hover{{border-color:var(--accent);color:var(--accent)}}
.seg-btn.active{{background:var(--mark);border-color:var(--accent);color:var(--accent);font-weight:600}}
.swatch-dot{{display:inline-block;width:10px;height:10px;border-radius:50%;flex-shrink:0}}
.font-stepper{{display:flex;align-items:center;gap:10px}}
.font-stepper button{{font-family:var(--font-latin);font-size:14px;width:28px;height:28px;
  border-radius:50%;border:1px solid var(--border);background:transparent;
  color:var(--text);cursor:pointer;transition:all .15s}}
.font-stepper button:hover{{border-color:var(--accent);color:var(--accent);background:var(--mark)}}
.font-val{{font-family:var(--font-ui);font-size:13px;color:var(--faint);min-width:40px;text-align:center}}

/* Cover hero */
.cover-hero{{max-width:740px;margin:0 auto;padding:72px 24px 20px;text-align:center}}
.cover-decoration{{font-family:var(--font-latin);font-size:12px;font-style:italic;
  color:var(--accent);letter-spacing:.28em;text-transform:uppercase;margin-bottom:22px}}
.cover-main-title{{font-family:var(--font-body);font-size:clamp(32px,5vw,52px);
  font-weight:700;line-height:1.2;color:var(--text);margin-bottom:14px}}
.cover-greek{{font-family:var(--font-latin);font-size:18px;font-style:italic;
  color:var(--accent2);letter-spacing:.22em;margin-bottom:22px}}
.cover-tagline{{font-size:1.05rem;color:var(--muted);line-height:1.85;
  max-width:30em;margin:0 auto 28px;padding:20px 0;
  border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}}
.cover-stat{{font-family:var(--font-ui);font-size:12.5px;color:var(--faint);
  letter-spacing:.04em;margin-bottom:32px}}
.cover-cta{{display:inline-flex;align-items:center;gap:10px;
  padding:14px 34px;background:var(--accent);color:#fff;
  font-family:var(--font-ui);font-size:15px;text-decoration:none;border-radius:30px;
  letter-spacing:.05em;box-shadow:0 12px 30px -10px var(--shadow);
  transition:transform .2s,background .2s}}
.cover-cta:hover{{background:var(--accent-ink);transform:translateY(-2px)}}
:root[data-theme="dark"] .cover-cta{{color:#1a1610}}
.cover-resume{{display:block;margin-top:18px;font-family:var(--font-ui);font-size:13px;
  color:var(--accent2);text-decoration:none}}
.cover-resume:hover{{text-decoration:underline}}

/* Cover TOC */
.cover-toc{{max-width:760px;margin:60px auto 100px;padding:0 32px}}
.cover-toc h2{{font-family:var(--font-body);font-size:1.1rem;font-weight:700;
  color:var(--faint);letter-spacing:.18em;text-align:center;margin-bottom:36px}}
.cover-part-title{{font-family:var(--font-ui);font-size:12px;font-weight:700;
  color:var(--accent);letter-spacing:.1em;margin:30px 0 10px;
  padding-bottom:8px;border-bottom:1px solid var(--rule)}}
.cover-toc-item{{display:flex;align-items:baseline;gap:12px;
  padding:9px 6px;text-decoration:none;color:var(--text);
  font-family:var(--font-body);font-size:15.5px;border-radius:6px;
  transition:background .15s,color .15s,padding-left .15s}}
.cover-toc-item:hover{{background:var(--surface-2);color:var(--accent);padding-left:12px}}
.cover-toc-item .item-title{{flex:1}}
.cover-toc-item .item-arrow{{color:var(--faint);font-family:var(--font-latin);opacity:0;transition:opacity .15s}}
.cover-toc-item:hover .item-arrow{{opacity:1}}

@media (max-width:768px){{
  .cover-hero{{padding-top:48px}}
  .cover-controls{{right:12px;top:56px}}
}}
</style>
</head>
<body>
<nav class="site-nav">
  <a href="/" class="nav-link">主页</a>
  <a href="/organicchurch/index.html" class="nav-link">文章</a>
  <a href="/organicchurch/books/" class="nav-link">著作</a>
</nav>
<div id="progress-bar"></div>
<div class="cover-controls">
<div class="reader-tools">
<button aria-label="阅读设置" class="tool-btn" id="settingsBtn" onclick="toggleSettings(event)">Aa</button>
<div aria-label="阅读设置" class="settings-panel" id="settingsPanel" role="dialog">
<div class="settings-row"><div class="settings-label">主题</div>
<div class="seg">
<button class="seg-btn" data-theme-opt="light" onclick="readerSetTheme('light')"><span class="swatch-dot" style="background:#FAF6EC"></span>纸</button>
<button class="seg-btn" data-theme-opt="sepia" onclick="readerSetTheme('sepia')"><span class="swatch-dot" style="background:#E9D4A8"></span>赭</button>
<button class="seg-btn" data-theme-opt="dark" onclick="readerSetTheme('dark')"><span class="swatch-dot" style="background:#2A2218"></span>夜</button>
</div></div>
<div class="settings-row"><div class="settings-label">字号</div>
<div class="font-stepper">
<button aria-label="减小字号" onclick="readerStepFont(-1)">A−</button>
<span class="font-val" id="fontVal">19 px</span>
<button aria-label="增大字号" onclick="readerStepFont(1)">A+</button>
</div></div>
<div class="settings-row"><div class="settings-label">版宽</div>
<div class="seg">
<button class="seg-btn" data-measure-opt="640px" onclick="readerSetMeasure('640px')">窄</button>
<button class="seg-btn" data-measure-opt="720px" onclick="readerSetMeasure('720px')">适中</button>
<button class="seg-btn" data-measure-opt="840px" onclick="readerSetMeasure('840px')">宽</button>
</div></div>
</div></div></div>
<div class="cover-hero">
<div class="cover-decoration">{COVER_DECORATION}</div>
<h1 class="cover-main-title">{BOOK_TITLE}</h1>
<div class="cover-greek">{BOOK_GREEK}</div>
<p class="cover-tagline">{BOOK_TAGLINE}</p>
<div class="cover-stat">{BOOK_STATS}</div>
<a class="cover-cta" href="introduction.html">开始阅读 →</a>
</div>
<div class="cover-toc">
<h2>目 录</h2>
{cover_toc}
</div>
<script>
(function () {{
  var root = document.documentElement;
  var store = (function () {{ try {{ var t = '__t'; localStorage.setItem(t, t); localStorage.removeItem(t); return localStorage; }} catch (e) {{ return null; }} }})();
  var get = function (k, d) {{ try {{ var v = store && store.getItem(k); return v === null || v === undefined ? d : v; }} catch (e) {{ return d; }} }};
  var set = function (k, v) {{ try {{ store && store.setItem(k, v); }} catch (e) {{}} }};
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
  // Resume
  var last = get('reader_last_page', '');
  var resumeLink = document.querySelector('.cover-resume');
  if (last && last !== 'index.html' && resumeLink) {{
    resumeLink.href = last;
    resumeLink.textContent = '↻ 继续上次阅读';
    resumeLink.style.display = 'block';
  }}
  // Progress
  var bar = document.getElementById('progress-bar');
  window.addEventListener('scroll', function() {{
    var st = window.scrollY || document.documentElement.scrollTop;
    var dh = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (dh > 0 ? (st / dh) * 100 : 0) + '%';
  }}, {{ passive: true }});
}})();
</script>
</body>
</html>'''


def generate_chapter_html(chapter_id, md_text):
    """Generate a chapter HTML file with sidebar, topbar, and body content."""
    idx = get_chapter_index(chapter_id)
    c = CHAPTERS[idx]
    ch_num = c[2]
    ch_title = c[3]
    part = c[4]
    section = c[5]
    
    # Get part name for chapter header
    part_names = {
        "第一部": "第一部分 认识主权福音",
        "第二部": "第二部分 传扬主权福音",
        None: section or "",
    }
    part_kicker = part_names.get(part, "")
    
    prev_c, next_c = get_prev_next(chapter_id)
    prev_html = ""
    next_html = ""
    
    if prev_c:
        prev_html = f'<a class="nav-btn prev-btn" href="{prev_c[0]}.html">←<span class="nav-label"> {prev_c[2]} {prev_c[3].split("—")[0].strip()}</span></a>'
    else:
        prev_html = '<span class="nav-btn disabled">←<span class="nav-label"> 上一章</span></span>'
    
    if next_c:
        next_html = f'<a class="nav-btn next-btn" href="{next_c[0]}"><span class="nav-label">{next_c[2]} {next_c[3].split("—")[0].strip()} </span>→</a>'
    else:
        next_html = '<span class="nav-btn disabled"><span class="nav-label">下一章 </span>→</span>'
    
    sidebar_toc = make_sidebar_toc(chapter_id)
    body_html = md_to_html(md_text)
    
    page_title = f"{ch_num} {ch_title} — {BOOK_TITLE}"
    full_title = f"{ch_num} {ch_title}"
    
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>{page_title}</title>
<script>
(function(){{try{{var s=localStorage,r=document.documentElement;
var t=s.getItem('reader_theme');if(t)r.setAttribute('data-theme',t);
var f=s.getItem('reader_font');if(f)r.style.setProperty('--reading-font',f+'px');
var m=s.getItem('reader_measure');if(m)r.style.setProperty('--reading-measure',m);
}}catch(e){{}}}})();
</script>
<link href="https://fonts.googleapis.com" rel="preconnect"/><link href="../assets/css/reader.css" rel="stylesheet"/><link href="../assets/css/courseware-panel.css" rel="stylesheet"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&amp;family=Noto+Sans+SC:wght@400;500;700&amp;family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&amp;display=swap" rel="stylesheet"/>
</head>
<body><nav class="site-nav">
<a class="nav-link" href="/">主页</a>
<a class="nav-link" href="/organicchurch/index.html">文章</a>
<a class="nav-link" href="/organicchurch/books/">著作</a>
</nav>
<!-- Progress bar -->
<div id="progress-bar"></div>
<!-- Overlay -->
<div class="overlay" id="overlay" onclick="closeSidebar()"></div>
<!-- Sidebar -->
<nav aria-label="目录" class="sidebar" id="sidebar">
<div class="sidebar-header">
<a class="book-title-link" href="index.html">{BOOK_SHORT}<small>Euangelion · Basileia</small></a>
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
<span class="topbar-title">{BOOK_SHORT}</span>
<div class="chapter-nav">
{prev_html}
{next_html}
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
<div class="chapter-kicker">{part_kicker}</div>
<h1 class="chapter-title">{full_title}</h1>
</div>
<article class="body-text" lang="zh-CN">
{body_html}
</article>
<footer class="chapter-footer">
<div class="chapter-nav-footer">
<a href="{prev_c[0] + '.html' if prev_c else '#'}">{'← ' + prev_c[2] if prev_c else ''}</a>
<a class="foot-home" href="index.html">≡ 目录</a>
<a href="{next_c[0] + '.html' if next_c else '#'}">{next_c[2] + ' →' if next_c else ''}</a>
</div>
</footer>
</main>
</div>
<!-- Back to top -->
<button aria-label="回到顶部" class="back-to-top" id="backToTop" onclick="scrollToTop()">⇧</button>
<script src="../assets/js/reader.js"></script>
<script src="../assets/js/courseware-panel.js"></script>
</body>
</html>'''


def update_reader_css():
    """Update reader.css with lordship_gospel palette colors."""
    css_path = os.path.join(ASSETS_DIR, "css", "reader.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()
    
    # Replace :root palette
    old_root = """:root {
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
  --shadow:    rgba(48,33,16,0.13);"""
    
    new_root = """:root {
  /* ----- palette: paper (default) — purple/gold theme ----- */
  --bg:        #FAF6EC;
  --bg-grain:  #F3ECDB;
  --surface:   #F4EEDF;
  --surface-2: #EFE7D4;
  --text:      #241B11;
  --muted:     #6A5C49;
  --faint:     #94866F;
  --accent:    #5B3E7A;   /* deep purple — royalty */
  --accent-ink:#4A2E66;
  --accent2:   #7A6B3E;   /* gold */
  --border:    #E2D8C3;
  --rule:      #D9CDB4;
  --quote-bg:  #F1E8D3;
  --mark:      rgba(91,62,122,0.10);
  --shadow:    rgba(48,33,16,0.13);"""
    
    css = css.replace(old_root, new_root)
    
    # Replace sepia palette
    old_sepia = """:root[data-theme="sepia"] {
  --bg:#F3E7CE; --bg-grain:#ECDCBE; --surface:#EBDDBF; --surface-2:#E4D3B0;
  --text:#3A2C19; --muted:#6E5B3E; --faint:#917A56;
  --accent:#9A4318; --accent-ink:#7E3413; --accent2:#566B36;
  --border:#DBC8A4; --rule:#D2BD96; --quote-bg:#E9D9B6; --mark:rgba(154,67,24,0.12);
  --shadow:rgba(60,40,18,0.16);}"""
    
    new_sepia = """:root[data-theme="sepia"] {
  --bg:#F3E7CE; --bg-grain:#ECDCBE; --surface:#EBDDBF; --surface-2:#E4D3B0;
  --text:#3A2C19; --muted:#6E5B3E; --faint:#917A56;
  --accent:#7B4D6E; --accent-ink:#633C59; --accent2:#7A6B3E;
  --border:#DBC8A4; --rule:#D2BD96; --quote-bg:#E9D9B6; --mark:rgba(123,77,110,0.12);
  --shadow:rgba(60,40,18,0.16);}"""
    
    css = css.replace(old_sepia, new_sepia)
    
    # Replace dark palette
    old_dark = """:root[data-theme="dark"] {
  --bg:#17140F; --bg-grain:#1C1813; --surface:#211C15; --surface-2:#272118;
  --text:#E4DAC8; --muted:#A89A82; --faint:#7E7361;
  --accent:#D98A4E; --accent-ink:#E59A5E; --accent2:#9DB87E;
  --border:#352D22; --rule:#3A3125; --quote-bg:#221D16; --mark:rgba(217,138,78,0.14);
  --shadow:rgba(0,0,0,0.5);}"""
    
    new_dark = """:root[data-theme="dark"] {
  --bg:#17140F; --bg-grain:#1C1813; --surface:#211C15; --surface-2:#272118;
  --text:#E4DAC8; --muted:#A89A82; --faint:#7E7361;
  --accent:#C7A9E0; --accent-ink:#D4B8EB; --accent2:#B6A86B;
  --border:#352D22; --rule:#3A3125; --quote-bg:#221D16; --mark:rgba(199,169,224,0.14);
  --shadow:rgba(0,0,0,0.5);}"""
    
    css = css.replace(old_dark, new_dark)
    
    with open(css_path, "w", encoding="utf-8") as f:
        f.write(css)
    print("Updated reader.css with lordship_gospel palette")


def generate_guide_html():
    """Generate discussion guide HTML."""
    guide_path = os.path.join(SRC_DIR, "讨论课件.md")
    with open(guide_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    body = md_to_html(content)
    page_title = f"讨论课件 — {BOOK_TITLE}"
    
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>{page_title}</title>
<script>
(function(){{try{{var s=localStorage,r=document.documentElement;
var t=s.getItem('reader_theme');if(t)r.setAttribute('data-theme',t);
var f=s.getItem('reader_font');if(f)r.style.setProperty('--reading-font',f+'px');
var m=s.getItem('reader_measure');if(m)r.style.setProperty('--reading-measure',m);
}}catch(e){{}}}})();
</script>
<link href="https://fonts.googleapis.com" rel="preconnect"/><link href="../assets/css/reader.css" rel="stylesheet"/><link href="../assets/css/courseware-panel.css" rel="stylesheet"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&amp;family=Noto+Sans+SC:wght@400;500;700&amp;family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&amp;display=swap" rel="stylesheet"/>
</head>
<body><nav class="site-nav">
<a class="nav-link" href="/">主页</a>
<a class="nav-link" href="/organicchurch/index.html">文章</a>
<a class="nav-link" href="/organicchurch/books/">著作</a>
</nav>
<div id="progress-bar"></div>
<div class="overlay" id="overlay" onclick="closeSidebar()"></div>
<nav aria-label="目录" class="sidebar" id="sidebar">
<div class="sidebar-header">
<a class="book-title-link" href="index.html">{BOOK_SHORT}<small>Euangelion · Basileia</small></a>
<button aria-label="关闭目录" class="close-btn" onclick="closeSidebar()">✕</button>
</div>
<div class="toc-tree">
{make_sidebar_toc("guide")}
</div>
</nav>
<aside aria-label="本章导航" class="outline" id="outline"></aside>
<div class="layout">
<header class="topbar">
<button aria-label="打开目录" class="hamburger" onclick="toggleSidebar()">☰</button>
<span class="topbar-title">{BOOK_SHORT}</span>
<div class="chapter-nav">
<a class="nav-btn prev-btn" href="conclusion.html">←<span class="nav-label"> 结语</span></a>
<span class="nav-btn disabled"><span class="nav-label">下一章 </span>→</span>
<div class="reader-tools">
<button aria-label="阅读设置" class="tool-btn" id="settingsBtn" onclick="toggleSettings(event)">Aa</button>
<div aria-label="阅读设置" class="settings-panel" id="settingsPanel" role="dialog">
<div class="settings-row"><div class="settings-label">主题</div>
<div class="seg">
<button class="seg-btn" data-theme-opt="light" onclick="readerSetTheme('light')"><span class="swatch-dot" style="background:#FAF6EC"></span>纸</button>
<button class="seg-btn" data-theme-opt="sepia" onclick="readerSetTheme('sepia')"><span class="swatch-dot" style="background:#E9D4A8"></span>赭</button>
<button class="seg-btn" data-theme-opt="dark" onclick="readerSetTheme('dark')"><span class="swatch-dot" style="background:#2A2218"></span>夜</button>
</div></div>
<div class="settings-row"><div class="settings-label">字号</div>
<div class="font-stepper">
<button aria-label="减小字号" onclick="readerStepFont(-1)">A−</button>
<span class="font-val" id="fontVal">19 px</span>
<button aria-label="增大字号" onclick="readerStepFont(1)">A+</button>
</div></div>
<div class="settings-row"><div class="settings-label">版宽</div>
<div class="seg">
<button class="seg-btn" data-measure-opt="640px" onclick="readerSetMeasure('640px')">窄</button>
<button class="seg-btn" data-measure-opt="720px" onclick="readerSetMeasure('720px')">适中</button>
<button class="seg-btn" data-measure-opt="840px" onclick="readerSetMeasure('840px')">宽</button>
</div></div>
</div></div>
</div>
</header>
<main class="content" id="main-content">
<div class="chapter-header">
<div class="chapter-kicker">附录</div>
<h1 class="chapter-title">小组讨论课件</h1>
</div>
<article class="body-text" lang="zh-CN">
{body}
</article>
<footer class="chapter-footer">
<div class="chapter-nav-footer">
<a href="conclusion.html">← 结语</a>
<a class="foot-home" href="index.html">≡ 目录</a>
<span></span>
</div>
</footer>
</main>
</div>
<button aria-label="回到顶部" class="back-to-top" id="backToTop" onclick="scrollToTop()">⇧</button>
<script src="../assets/js/reader.js"></script>
<script src="../assets/js/courseware-panel.js"></script>
</body>
</html>'''


def main():
    os.makedirs(DST_DIR, exist_ok=True)
    
    # Update reader.css with new palette
    update_reader_css()
    
    # Generate chapter files
    for c in CHAPTERS:
        ch_id = c[0]
        print(f"Generating {ch_id}.html...")
        md = read_markdown(ch_id)
        html = generate_chapter_html(ch_id, md)
        out_path = os.path.join(DST_DIR, f"{ch_id}.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(html)
    
    # Generate index.html
    print("Generating index.html...")
    index_html = generate_index_html()
    with open(os.path.join(DST_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_html)
    
    # Generate guide.html
    print("Generating guide.html...")
    guide_html = generate_guide_html()
    with open(os.path.join(DST_DIR, "guide.html"), "w", encoding="utf-8") as f:
        f.write(guide_html)
    
    print(f"\nDone! Generated {len(CHAPTERS)} chapter files + index.html + guide.html")
    print(f"Output: {DST_DIR}")

if __name__ == "__main__":
    main()
