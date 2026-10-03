#!/usr/bin/env python3
"""把 mindmap_data.json 渲染成单文件 mindmap.html（瀑布式思维导图）。

布局：书名（左）→ 各「部」一列；列内自上而下 部 → 章 → 要点；
      每级向右推进 34px，形成瀑布式阶梯。
输出：零外链单文件（SVG/CSS/JS 全内联 + 本机字体栈），可离线双击打开。

用法：
  python3 build_mindmap.py            # 读 mindmap_data.json → 站点 mindmap.html
  python3 build_mindmap.py --stub     # 用合成数据生成 mindmap.stub.html 自测渲染器
"""
import html
import itertools
import json
import math
import pathlib
import sys

D = pathlib.Path('/Users/brianw/projects/brian-site/drafts/oikos_lectures')
OUT = pathlib.Path('/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church/lectures/mindmap.html')

PAD = 56
ROOT_W, ROOT_X = 330, PAD
COL_W, COL_GAP, INDENT = 560, 76, 34
FS_ROOT_T, FS_ROOT_S = 27, 14.5
FS_GRP_T, FS_GRP_S = 19.5, 13.5
FS_CH_T, FS_CH_S = 16.5, 13.5
FS_PT_T, FS_PT_S = 14.5, 13.2
LH = 1.62
ACCENTS = ['#8A3517', '#4A6741', '#A9722B', '#3F6C7A', '#6C5B8E', '#8A5A3C', '#4E6E52', '#8A3B4E']


def _w(ch, fs):
    o = ord(ch)
    if o < 0x2E80:
        return fs * (0.30 if ch in ' .,:;!|()-\'’‘"”“·' else 0.56)
    return fs * 1.0


def text_w(s, fs):
    return sum(_w(c, fs) for c in s)


def wrap(s, fs, maxw):
    lines, cur = [], ''
    for ch in s:
        if ch == '\n':
            lines.append(cur)
            cur = ''
            continue
        if text_w(cur + ch, fs) > maxw and cur:
            if ch in '，。、；：）】》”’！？%':
                lines.append(cur + ch)
                cur = ''
                continue
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines or ['']


def nlines(s, fs, maxw):
    return len(wrap(s, fs, maxw))


def _ch_metrics(ch):
    """一章的框高与其各要点框高（纯几何，与位置无关）。"""
    cw = COL_W - INDENT * 2
    chh = 32 + FS_CH_T * LH + 4 + nlines(ch['summary'], FS_CH_S, cw - 36) * FS_CH_S * LH
    pt = []
    for p in ch['points']:
        pw = COL_W - INDENT * 3
        pt.append(28 + FS_PT_T * LH + 3 + nlines(p['summary'], FS_PT_S, pw - 32) * FS_PT_S * LH)
    return chh, pt


def _block_h(chh, pt):
    """一章连同其要点、间距后的竖直占位。"""
    return chh + 12 + sum(h + 9 for h in pt) + 20


def _split_contiguous(hs, kmax=2, target=2400.0):
    """把有序的章块高切成 K 段连续子列（仅当该部明显超高才拆），最高列尽量矮。"""
    n = len(hs)
    if n == 0:
        return [(0, 0)]
    K = max(1, min(kmax, math.ceil((sum(hs) + 26 * (n - 1)) / target)))
    best = None
    for cuts in itertools.combinations(range(1, n), K - 1):
        edges_ = (0,) + cuts + (n,)
        cols = [sum(hs[a:b]) + 26 * (b - a - 1) for a, b in zip(edges_[:-1], edges_[1:])]
        cost = (max(cols), max(cols) - min(cols), K)
        if best is None or cost < best[0]:
            best = (cost, list(zip(edges_[:-1], edges_[1:])))
    return best[1] if best else [(0, n)]


def _center_columns(boxes):
    """各列（含书名）在整幅画布内垂直居中：空余上下分摊，形成错落的瀑布层。"""
    cols = {}
    for b in boxes:
        cols.setdefault(b['col'], []).append(b)
    span = {c: (min(b['y'] for b in bs), max(b['y'] + b['h'] for b in bs)) for c, bs in cols.items()}
    ref = min(t for t, _ in span.values())                 # 统一顶部基准
    tallest = max(b - t for t, b in span.values())
    for c, bs in cols.items():
        if c == 0:
            continue                                        # 书名留在顶层（顶部总线从它出发）
        t, b = span[c]
        dy = (tallest - (b - t)) / 2 - (t - ref)
        if dy:
            for x in bs:
                x['y'] += dy


def ortho(pts, r=9.0):
    """正交折线 + 圆角（缩进层级的"脊柱 + 短横"走线）。"""
    pts = [p for i, p in enumerate(pts) if i == 0 or abs(p[0] - pts[i - 1][0]) > 0.4 or abs(p[1] - pts[i - 1][1]) > 0.4]
    if len(pts) < 3:
        return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts)
    out = [f'M{pts[0][0]:.1f} {pts[0][1]:.1f}']
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i - 1]
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        d1 = math.hypot(x1 - x0, y1 - y0) or 1.0
        d2 = math.hypot(x2 - x1, y2 - y1) or 1.0
        rr = min(r, d1 / 2, d2 / 2)
        ax, ay = x1 - (x1 - x0) / d1 * rr, y1 - (y1 - y0) / d1 * rr
        bx, by = x1 + (x2 - x1) / d2 * rr, y1 + (y2 - y1) / d2 * rr
        out.append(f'L{ax:.1f} {ay:.1f} Q{x1:.1f} {y1:.1f} {bx:.1f} {by:.1f}')
    out.append(f'L{pts[-1][0]:.1f} {pts[-1][1]:.1f}')
    return ' '.join(out)


def layout(data):
    """书名 → 各部（章多则拆成相邻子列）→ 章 → 要点；每级右推 INDENT。"""
    boxes, edges = [], []
    root = data['root']
    rh = 40 + FS_ROOT_T * LH + nlines(root['summary'], FS_ROOT_S, ROOT_W - 40) * FS_ROOT_S * LH
    boxes.append(dict(id='root', kind='root', x=ROOT_X, y=PAD, w=ROOT_W, h=rh,
                      title=root['title'], summary=root['summary'], accent=ACCENTS[0], col=0, sub=0))
    gx = ROOT_X + ROOT_W + COL_GAP
    maxy = PAD + rh
    for gi, g in enumerate(data['groups']):
        acc = ACCENTS[gi % len(ACCENTS)]
        mets = [_ch_metrics(ch) for ch in g['chapters']]
        hs = [_block_h(a, b) for a, b in mets]
        parts = _split_contiguous(hs)
        K = len(parts)
        span_w = (K - 1) * (COL_W + COL_GAP) + COL_W          # 该部占的横向净宽
        gh = 36 + FS_GRP_T * LH + 4 + nlines(g['summary'], FS_GRP_S, span_w - INDENT - 40) * FS_GRP_S * LH
        boxes.append(dict(id=f'g{gi}', kind='group', x=gx, y=PAD, w=span_w - INDENT, h=gh,
                          title=g['title'], summary=g['summary'], accent=acc, col=gi + 1, sub=0))
        edges.append((boxes[0], boxes[-1]))
        gb = boxes[-1]
        gy = PAD
        for k, (a, b) in enumerate(parts):
            sub_x = gx + k * (COL_W + COL_GAP)
            y = gy + gh + (46 if K > 1 else 30)
            for ci in range(a, b):
                ch = g['chapters'][ci]
                chh, pt = mets[ci]
                cw = COL_W - INDENT * 2
                boxes.append(dict(id=f'g{gi}c{ci}', kind='chapter', x=sub_x + INDENT, y=y, w=cw, h=chh,
                                  title=ch['title'], summary=ch['summary'], accent=acc, col=gi + 1, sub=k))
                edges.append((gb, boxes[-1]))
                chbox = boxes[-1]
                y += chh + 12
                for pi, p in enumerate(ch['points']):
                    px, pw = sub_x + INDENT * 2, COL_W - INDENT * 3
                    boxes.append(dict(id=f'g{gi}c{ci}p{pi}', kind='point', x=px, y=y, w=pw, h=pt[pi],
                                      title=p['title'], summary=p['summary'], accent=acc, col=gi + 1, sub=k))
                    edges.append((chbox, boxes[-1]))
                    y += pt[pi] + 9
                y += 20
            maxy = max(maxy, y)
        gx += span_w + COL_GAP
    _center_columns(boxes)
    maxy = max(b['y'] + b['h'] for b in boxes)
    return boxes, edges, gx - COL_GAP + PAD, maxy + PAD


def esc(s):
    return html.escape(s, quote=True)


def tspans(s, x, fs, maxw, first_dy):
    out = []
    for i, ln in enumerate(wrap(s, fs, maxw)):
        dy = first_dy if i == 0 else fs * LH
        out.append(f'<tspan x="{x:.1f}" dy="{dy:.1f}">{esc(ln)}</tspan>')
    return ''.join(out)


def build_svg(data):
    """渲染瀑布图 SVG 标记（大纲页与思维导图页共用）。"""
    boxes, edges, W, H = layout(data)
    svg = [f'<svg id="mm" viewBox="0 0 {W:.0f} {H:.0f}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="全书瀑布式思维导图">']
    # 列的"瀑布底纸"：贯穿整幅高度，形成并列的竖条（多子列时横跨整块）
    svg.append('<g class="sheets">')
    for gi, g in enumerate(data['groups']):
        col = [b for b in boxes if b['col'] == gi + 1]
        x0 = min(b['x'] for b in col) - 22
        x1 = max(b['x'] + b['w'] for b in col) + 22
        svg.append(f'<rect class="sheet" x="{x0:.1f}" y="44" width="{x1 - x0:.1f}" height="{H - 68:.1f}" rx="18" fill="{ACCENTS[gi % len(ACCENTS)]}" opacity="0.055"/>')
    svg.append('</g>')
    svg.append('<g class="edges" fill="none">')
    root_edges = [(a, b) for a, b in edges if a['kind'] == 'root']
    if root_edges:
        r0 = root_edges[0][0]
        bus_y = max(18.0, r0['y'] - 26)                     # 书名上方的横向总轨
        x0 = r0['x'] + 30
        for a, b in root_edges:
            pts = [(x0, r0['y']), (x0, bus_y), (b['x'] + 14, bus_y), (b['x'] + 14, b['y'])]
            svg.append(f'<path data-a="{a["id"]}" data-b="{b["id"]}" d="{ortho(pts)}" stroke="{b["accent"]}" stroke-width="2.2" opacity="0.42"/>')
    for a, b in [e for e in edges if e[0]['kind'] != 'root']:
        cy = b['y'] + b['h'] / 2
        w_ = 2.0 if b['kind'] == 'chapter' else 1.5
        op = 0.5 if b['kind'] == 'chapter' else 0.36
        if a['kind'] == 'group' and b['sub'] > 0:
            # 部被拆成多子列：部标题底边 → 总线 → 沿子列左侧缺口下落 → 短横接入
            bus_y = a['y'] + a['h'] + 16
            px = b['x'] - 22
            pts = [(a['x'] + 12, a['y'] + a['h'] - 2), (a['x'] + 12, bus_y), (px, bus_y), (px, cy), (b['x'], cy)]
        else:
            # 单列缩进：父左下 → 竖走(脊柱) → 圆角 → 短横接入子左边缘
            pts = [(a['x'] + 14, a['y'] + a['h'] - 2), (a['x'] + 14, cy), (b['x'], cy)]
        svg.append(f'<path data-a="{a["id"]}" data-b="{b["id"]}" d="{ortho(pts)}" stroke="{b["accent"]}" stroke-width="{w_:.1f}" opacity="{op:.2f}"/>')
    svg.append('</g>')
    svg.append('<g class="nodes">')
    for b in boxes:
        k = b['kind']
        did = f' data-id="{b["id"]}"'
        if k == 'root':
            svg.append(f'<rect{did} data-role="box" x="{b["x"]}" y="{b["y"]}" width="{b["w"]}" height="{b["h"]:.1f}" rx="16" fill="{b["accent"]}"/>')
            svg.append(f'<text{did} data-role="title" class="t-root" x="{b["x"] + 20}" y="{b["y"] + 20 + FS_ROOT_T * 0.82:.1f}" fill="#FAF6EC">{esc(b["title"])}</text>')
            svg.append(f'<text{did} data-role="sum" class="t-roots" x="{b["x"] + 20}" y="{b["y"] + 20 + FS_ROOT_T * LH + 6:.1f}" fill="#F0E4CC">{tspans(b["summary"], b["x"] + 20, FS_ROOT_S, b["w"] - 40, 0)}</text>')
            continue
        fill, stroke, bar = {
            'group':   ('#F3E9D6', b['accent'], b['accent']),
            'chapter': ('#F6F0E2', '#D9CDB4', b['accent']),
            'point':   ('#FBF7EE', '#E2D8C3', b['accent'] + 'aa'),
        }[k]
        ty = b['y'] + (18 if k == 'group' else (16 if k == 'chapter' else 14))
        tx = b['x'] + (20 if k == 'group' else (18 if k == 'chapter' else 16))
        fs_t = {'group': FS_GRP_T, 'chapter': FS_CH_T, 'point': FS_PT_T}[k]
        fs_s = {'group': FS_GRP_S, 'chapter': FS_CH_S, 'point': FS_PT_S}[k]
        padl = 20 if k == 'group' else (18 if k == 'chapter' else 16)
        svg.append(f'<rect{did} data-role="box" x="{b["x"]}" y="{b["y"]}" width="{b["w"]}" height="{b["h"]:.1f}" rx="{12 if k == "point" else 14}" fill="{fill}" stroke="{stroke}" stroke-width="{1.6 if k != "point" else 1.1:.1f}"/>')
        svg.append(f'<rect x="{b["x"]}" y="{b["y"] + (8 if k == "point" else 10)}" width="3" height="{b["h"] - (16 if k == "point" else 20):.1f}" rx="1.5" fill="{bar}"/>')
        cls = {'group': 't-grp', 'chapter': 't-ch', 'point': 't-pt'}[k]
        cls2 = {'group': 't-grps', 'chapter': 't-chs', 'point': 't-pts'}[k]
        svg.append(f'<text{did} data-role="title" class="{cls}" x="{tx}" y="{ty + fs_t * 0.82:.1f}">{esc(b["title"])}</text>')
        svg.append(f'<text{did} data-role="sum" class="{cls2}" x="{tx}" y="{ty + fs_t * LH + 5:.1f}">{tspans(b["summary"], tx, fs_s, b["w"] - padl - 16, 0)}</text>')
    svg.append('</g>')
    svg.append('</svg>')
    return ''.join(svg), W, H, boxes


def render(data):
    root = data['root']
    nch = sum(len(g['chapters']) for g in data['groups'])
    npt = sum(len(c['points']) for g in data['groups'] for c in g['chapters'])
    svg, W, H, boxes = build_svg(data)
    geom = json.dumps([{k: b[k] for k in ('id', 'kind', 'x', 'y', 'w', 'h', 'col', 'title')} for b in boxes], ensure_ascii=False)

    # 组索引 chips
    chips = ''.join(f'<button class="chip" data-col="{gi + 1}" style="--c:{ACCENTS[gi % len(ACCENTS)]}">{esc(g["title"])}</button>'
                    for gi, g in enumerate(data['groups']))
    # 文本版（可读、可搜索、可打印）
    outline = []
    for gi, g in enumerate(data['groups']):
        acc = ACCENTS[gi % len(ACCENTS)]
        outline.append(f'<details class="grp" open><summary style="--c:{acc}"><b>{esc(g["title"])}</b><span>{esc(g["summary"])}</span></summary><div class="cbs">')
        for ch in g['chapters']:
            outline.append(f'<div class="cb"><h4>{esc(ch["title"])}</h4><p class="cs">{esc(ch["summary"])}</p><ul>')
            for p in ch['points']:
                outline.append(f'<li><b>{esc(p["title"])}</b><span>{esc(p["summary"])}</span></li>')
            outline.append('</ul></div>')
        outline.append('</div></details>')
    outline = ''.join(outline)

    page = f'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(root['title'])} · 全书思维导图</title>
<style>
:root{{--bg:#FAF6EC;--surface:#F4EEDF;--text:#241B11;--muted:#6A5C49;--accent:#8A3517;
 --olive:#4A6741;--border:#E2D8C3;--rule:#D9CDB4;
 --font-body:'Noto Serif SC','Songti SC','Source Han Serif SC',Georgia,serif;
 --font-ui:'Noto Sans SC','PingFang SC',system-ui,sans-serif;
 --font-latin:'EB Garamond',Georgia,serif;}}
*{{box-sizing:border-box}}
html,body{{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);
 background-image:radial-gradient(circle at 18% 12%,rgba(138,53,23,.035),transparent 55%),radial-gradient(circle at 82% 78%,rgba(74,103,65,.035),transparent 55%)}}
header{{padding:26px 28px 14px}}
h1{{margin:0 0 6px;font-size:26px;letter-spacing:.02em}}
h1 small{{font-family:var(--font-ui);font-size:13px;color:var(--muted);font-weight:400;margin-left:10px}}
.lede{{margin:0;max-width:70ch;font-size:15.5px;line-height:1.75;color:#3A2E20}}
.stat{{font-family:var(--font-ui);font-size:12.5px;color:var(--faint);margin-top:8px}}
.bar{{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
 padding:10px 28px;background:rgba(250,246,236,.94);border-bottom:1px solid var(--border);backdrop-filter:blur(6px)}}
.chip{{font-family:var(--font-ui);font-size:12.5px;color:var(--text);background:#FBF7EE;border:1px solid var(--border);
 border-left:3px solid var(--c);border-radius:8px;padding:5px 9px;cursor:pointer}}
.chip:hover{{background:#F3E9D6}}
.zoom{{margin-left:auto;display:flex;gap:6px;align-items:center;font-family:var(--font-ui);font-size:12.5px;color:var(--muted)}}
.zoom button{{font-family:var(--font-ui);font-size:12.5px;background:#FBF7EE;border:1px solid var(--border);
 border-radius:8px;padding:5px 10px;cursor:pointer;color:var(--text)}}
.zoom button:hover{{background:#F3E9D6}}
#stage{{height:calc(100vh - 210px);min-height:560px;padding:0 28px;cursor:grab}}
#stage.drag{{cursor:grabbing}}
#mm{{width:100%;height:100%;display:block;touch-action:none;user-select:none}}
.t-root{{font-family:var(--font-body);font-size:{FS_ROOT_T}px;font-weight:700}}
.t-roots{{font-family:var(--font-body);font-size:{FS_ROOT_S}px}}
.t-grp{{font-family:var(--font-body);font-size:{FS_GRP_T}px;font-weight:700}}
.t-grps{{font-family:var(--font-body);font-size:{FS_GRP_S}px;fill:#4A3E2E}}
.t-ch{{font-family:var(--font-body);font-size:{FS_CH_T}px;font-weight:700}}
.t-chs{{font-family:var(--font-body);font-size:{FS_CH_S}px;fill:#5A4C38}}
.t-pt{{font-family:var(--font-body);font-size:{FS_PT_T}px;font-weight:700}}
.t-pts{{font-family:var(--font-body);font-size:{FS_PT_S}px;fill:#5F5240}}
.sheet{{stroke:none}}
section.txt{{padding:6px 28px 60px;max-width:1200px}}
section.txt h2{{font-size:19px;border-top:1px solid var(--rule);padding-top:18px;margin-top:26px}}
details.grp{{border-left:3px solid var(--c);padding:10px 0 4px 14px;margin:14px 0}}
details.grp>summary{{cursor:pointer;font-family:var(--font-body);font-size:16.5px;list-style:none}}
details.grp>summary b{{font-weight:700}}
details.grp>summary span{{display:block;font-size:14px;color:#5A4C38;margin-top:3px}}
.cb{{margin:12px 0 0 6px}}
.cb h4{{margin:0;font-size:15px}}
.cb .cs{{margin:2px 0 6px;font-size:13.5px;color:#5A4C38}}
.cb ul{{margin:0;padding-left:18px}}
.cb li{{margin:3px 0;font-size:14px;line-height:1.7}}
.cb li b{{font-weight:700}}
.cb li span{{color:#4A3E2E}}
footer{{padding:24px 28px 40px;font-family:var(--font-ui);font-size:12.5px;color:var(--faint);border-top:1px solid var(--border)}}
@media print{{
 .bar,#stage{{display:none}}
 header{{padding:0 0 8px}} section.txt{{padding:0;max-width:none}}
 details.grp{{break-inside:avoid}}
}}
</style></head>
<body>
<header>
  <h1>{esc(root['title'])}<small>全书瀑布式思维导图</small></h1>
  <p class="lede">{esc(root['summary'])}</p>
  <div class="stat">{len(data['groups'])} 部（含序跋） · {nch} 章 · {npt} 个要点，每点一句话。拖动平移，滚轮缩放，点上方标签跳到该部。</div>
</header>
<div class="bar">
  {chips}
  <div class="zoom">
    <button id="z-out">−</button><span id="z-lv">100%</span><button id="z-in">＋</button>
    <button id="z-fit">适应全图</button><button id="z-100">100%</button>
    <button id="z-print">打印</button>
  </div>
</div>
<div id="stage">{svg}</div>
<section class="txt">
  <h2>文本版大纲（同内容，可搜索可打印）</h2>
  {outline}
</section>
<footer>《{esc(root['title'])}》· 思维导图 · 由书稿 23 个章节文件逐章提炼（本地生成，无外部依赖）</footer>
<script type="application/json" id="mm-geom">{geom}</script>
<script>
(function(){{
  var W={W:.0f}, H={H:.0f}, svg=document.getElementById('mm'), stage=document.getElementById('stage');
  var geom=JSON.parse(document.getElementById('mm-geom').textContent);
  var k=1, vx=0, vy=0, minK=0.12, maxK=2.6;
  function size(){{ return {{ w: stage.clientWidth, h: stage.clientHeight }}; }}
  function apply(){{
    var s=size(), vw=s.w/k, vh=s.h/k;
    if(vw>=W){{ vx=(W-vw)/2; }} else {{ vx=Math.max(0,Math.min(W-vw,vx)); }}
    if(vh>=H){{ vy=(H-vh)/2; }} else {{ vy=Math.max(0,Math.min(H-vh,vy)); }}
    svg.setAttribute('viewBox', vx.toFixed(1)+' '+vy.toFixed(1)+' '+vw.toFixed(1)+' '+vh.toFixed(1));
    document.getElementById('z-lv').textContent=Math.round(k*100)+'%';
  }}
  function fitAll(){{ var s=size(); k=Math.min(s.w/W,s.h/H)*0.96; vx=(W-s.w/k)/2; vy=(H-s.h/k)/2; apply(); }}
  document.getElementById('z-in').onclick=function(){{ zoomAt(1.25); }};
  document.getElementById('z-out').onclick=function(){{ zoomAt(1/1.25); }};
  document.getElementById('z-fit').onclick=fitAll;
  document.getElementById('z-100').onclick=function(){{ k=1; apply(); }};
  document.getElementById('z-print').onclick=function(){{ window.print(); }};
  function zoomAt(f, cx, cy){{
    var s=size(), mx=(cx===undefined?s.w/2:cx), my=(cy===undefined?s.h/2:cy);
    var wx=vx+mx/k, wy=vy+my/k, nk=Math.max(minK,Math.min(maxK,k*f));
    vx=wx-mx/nk; vy=wy-my/nk; k=nk; apply();
  }}
  stage.addEventListener('wheel', function(e){{
    if(!e.ctrlKey && Math.abs(e.deltaY)<1) return;
    e.preventDefault();
    var r=stage.getBoundingClientRect();
    zoomAt(e.deltaY<0?1.12:1/1.12, e.clientX-r.left, e.clientY-r.top);
  }}, {{passive:false}});
  var dragging=false, px=0, py=0;
  stage.addEventListener('pointerdown', function(e){{ dragging=true; px=e.clientX; py=e.clientY; stage.classList.add('drag'); stage.setPointerCapture(e.pointerId); }});
  stage.addEventListener('pointermove', function(e){{ if(!dragging) return; vx-=(e.clientX-px)/k; vy-=(e.clientY-py)/k; px=e.clientX; py=e.clientY; apply(); }});
  stage.addEventListener('pointerup', function(e){{ dragging=false; stage.classList.remove('drag'); }});
  document.querySelectorAll('.chip').forEach(function(b){{
    b.onclick=function(){{
      var col=+b.dataset.col, b0=geom.filter(function(g){{return g.col===col;}});
      if(!b0.length) return;
      if(k<0.55) k=0.8;
      vx=Math.min.apply(null,b0.map(function(g){{return g.x;}}))-24;
      vy=Math.min.apply(null,b0.map(function(g){{return g.y;}}))-24;
      apply();
    }};
  }});
  window.addEventListener('resize', apply);
  var s0=size(), fk=Math.min(s0.w/W, s0.h/H); k=Math.max(0.5, Math.min(1, fk)); vx=0; vy=0; apply();
}})();
</script>
</body></html>'''
    return page


STUB = {
    "root": {"title": "家教会的本体论革命", "summary": "（合成自测数据）教会不是建筑或活动，而是上帝家中之家的有机生命；本书从本体论上重建教会论，并以家教会为落地原型。"},
    "groups": [
        {"title": "第一部 诊断：身份的迷失", "summary": "指出当代教会论错把空间、权宜与成熟当成教会本质。",
         "chapters": [{"title": "第一章 身份的迷失", "summary": "教会是关系而非地点，退化常被误认为成熟。",
                       "points": [{"title": "空间迷思", "summary": "把教会从关系堕落为地点，带来的是一整套建筑的自我辩护。"},
                                  {"title": "权宜论陷阱", "summary": "把权宜之计当作上帝的设计，久了便无人再问蓝图。"},
                                  {"title": "进化论的傲慢", "summary": "把退化误读为成熟，使偏离获得正当性。"}]}]},
        {"title": "第二部 蓝图：神圣三角", "summary": "回到圣经原型，看见教会作为家、社群与经纶的三重结构。",
         "chapters": [{"title": "第四章 神圣的原型：Oikos", "summary": "Oikos 先在于一切宗教建制，是门训的原始单元。",
                       "points": [{"title": "原始单元的先在性", "summary": "Oikos 在一切宗教建制之前存在，是上帝设计的最小单元。"},
                                  {"title": "家庭的祭司职分", "summary": "父母是第一任拉比，教育的主权在家不在机构。"}]}]},
    ],
}

if __name__ == '__main__':
    stub = '--stub' in sys.argv
    src = STUB if stub else json.load(open(D / 'mindmap_data.json', encoding='utf-8'))
    out = (D / 'mindmap.stub.html') if stub else OUT
    page = render(src)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding='utf-8')
    boxes, edges, W, H = layout(src)
    print(f'{"[stub] " if stub else ""}写出 {out}')
    print(f'画布 {W:.0f}×{H:.0f} · 节点 {len(boxes)} · 连线 {len(edges)} · 字节 {len(page.encode("utf-8")):,}')
