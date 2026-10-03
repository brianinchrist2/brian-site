#!/usr/bin/env python3
"""《家教会的本体论革命》全书大纲（可折叠/展开）—— 单文件、零外链。

默认视图 = 大纲树（部 → 章 → 要点，每级可折叠，每点带一句话总结）；
可一键切到瀑布图视图（复用 build_mindmap.build_svg，纯几何而非重绘）。

数据：mindmap_data.json（由 claude CLI 通读书稿生成）。
用法：python3 build_outline.py [--out 路径]
"""
import html
import json
import pathlib
import sys
from urllib.parse import quote

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import build_mindmap as bm  # noqa: E402

D = pathlib.Path(__file__).parent
OUT = pathlib.Path(
    '/Users/brianw/projects/brian-site/brianinchrist/organicchurch'
    '/library/oikos_church/lectures/mindmap.html'
)


def esc(s):
    return html.escape(s or '', quote=True)


def lq(*parts):
    """搜索用的归一化文本。"""
    return esc(' '.join(parts).lower())


READER = '../../reader.html?book=oikos_church'  # 相对本页（library/oikos_church/lectures/）


def load_targets(data):
    """由 anchors.json + anchor_map.json 算出每个节点在正文里的落点链接。

    返回 (chl, ptl)：chl[(gi,ci)] = 章链接；ptl[(gi,ci,pi)] = 要点链接（含目标小节文字）。"""
    A = json.loads((D / 'anchors.json').read_text(encoding='utf-8'))
    Mp = json.loads((D / 'anchor_map.json').read_text(encoding='utf-8'))['mapping']
    by_key = {c['key']: c for c in A['chapters']}
    aid2text = {c['ch_id']: {h['aid']: h['text'] for h in c['headings']} for c in A['chapters']}
    chl, ptl, flat = {}, {}, 0
    for gi, g in enumerate(data['groups']):
        for ci, ch in enumerate(g['chapters']):
            a = by_key.get(ch['title'])
            if a is None:
                raise SystemExit('anchors.json 缺少该章：' + ch['title'])
            chl[(gi, ci)] = {'ch': a['ch_id'], 'title': a['title'], 'href': f'{READER}&ch={a["ch_id"]}'}
            for pi, _p in enumerate(ch['points']):
                m = next((x for x in Mp if x['pid'] == f'{flat}-{pi}'), None)
                aid = (m or {}).get('aid') or 'chapter'
                href = f'{READER}&ch={a["ch_id"]}' + ('' if aid == 'chapter' else '#' + quote(aid, safe=''))
                ptl[(gi, ci, pi)] = {'href': href, 'sec': aid2text[a['ch_id']].get(aid, ''), 'ch': a['ch_id'], 'aid': aid}
            flat += 1
    return chl, ptl


def tree(data, chl, ptl):
    """大纲树：部 → 章 → 要点。部/章带 twisty 与计数；要点为叶子（标题 + 一句话）。

    每个节点都能跳正文：要点整行是链接（落到映射出的正文小节），部/章在行尾给「正文 ↗」
    （部指向该部第一章）——部/章行本身仍保有点击折叠，故用独立按钮避免冲突。"""
    out = []
    for gi, g in enumerate(data['groups']):
        acc = bm.ACCENTS[gi % len(bm.ACCENTS)]
        nch = len(g['chapters'])
        npt = sum(len(c['points']) for c in g['chapters'])
        g0 = chl[(gi, 0)]
        out.append(f'<li class="node lv1" data-id="g{gi}" data-q="{lq(g["title"], g["summary"])}" style="--c:{acc}">')
        out.append('<div class="row">'
                   f'<button class="tw" aria-expanded="true" aria-label="折叠或展开：{esc(g["title"])}"></button>'
                   f'<span class="ttl">{esc(g["title"])}</span>'
                   f'<span class="badge">{nch} 章 · {npt} 要点</span>'
                   f'<a class="go" href="{g0["href"]}" target="_blank" rel="noopener"'
                   f' title="打开正文：{esc(g0["title"])}">正文 ↗</a></div>')
        out.append(f'<p class="sum">{esc(g["summary"])}</p>')
        out.append('<ol class="kids">')
        for ci, ch in enumerate(g['chapters']):
            cl = chl[(gi, ci)]
            out.append(f'<li class="node lv2" data-id="g{gi}c{ci}" data-q="{lq(ch["title"], ch["summary"])}">')
            out.append('<div class="row">'
                       f'<button class="tw" aria-expanded="true" aria-label="折叠或展开：{esc(ch["title"])}"></button>'
                       f'<span class="ttl">{esc(ch["title"])}</span>'
                       f'<span class="badge">{len(ch["points"])} 要点</span>'
                       f'<a class="go" href="{cl["href"]}" target="_blank" rel="noopener"'
                       f' title="打开正文：{esc(cl["title"])}">正文 ↗</a></div>')
            out.append(f'<p class="sum">{esc(ch["summary"])}</p>')
            out.append('<ol class="kids">')
            for pi, p in enumerate(ch['points']):
                pl = ptl[(gi, ci, pi)]
                sec = pl['sec'] or '本章开头'
                out.append(f'<li class="node lv3" data-id="g{gi}c{ci}p{pi}" data-q="{lq(p["title"], p["summary"])}">'
                           '<div class="row"><span class="dot" aria-hidden="true"></span>'
                           f'<a class="pt" href="{pl["href"]}" target="_blank" rel="noopener"'
                           f' title="打开正文：{esc(cl["title"])} · {esc(sec)}">'
                           f'<span class="ttl">{esc(p["title"])}</span>'
                           f'<span class="ps">{esc(p["summary"])}</span></a></div></li>')
            out.append('</ol></li>')
        out.append('</ol></li>')
    return '\n'.join(out)


def chips(data):
    return ''.join(
        f'<button class="chip" data-col="{gi + 1}" data-gi="{gi}" style="--c:{bm.ACCENTS[gi % len(bm.ACCENTS)]}">'
        f'{esc(g["title"])}</button>'
        for gi, g in enumerate(data['groups'])
    )


PAGE = r'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__ · 全书大纲</title>
<style>
:root{--bg:#FAF6EC;--surface:#F4EEDF;--text:#241B11;--muted:#6A5C49;--accent:#8A3517;
 --olive:#4A6741;--border:#E2D8C3;--rule:#D9CDB4;--faint:#8A7A63;
 --font-body:'Noto Serif SC','Songti SC','Source Han Serif SC',Georgia,serif;
 --font-ui:'Noto Sans SC','PingFang SC',system-ui,sans-serif;
 --font-latin:'EB Garamond',Georgia,serif;}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);
 background-image:radial-gradient(circle at 18% 12%,rgba(138,53,23,.035),transparent 55%),radial-gradient(circle at 82% 78%,rgba(74,103,65,.035),transparent 55%)}
.wrap{max-width:1180px;margin:0 auto;padding:0 28px}
header{padding:26px 0 10px}
h1{margin:0 0 6px;font-size:26px;letter-spacing:.02em}
h1 small{font-family:var(--font-ui);font-size:13px;color:var(--muted);font-weight:400;margin-left:10px}
.lede{margin:0;max-width:74ch;font-size:15.5px;line-height:1.75;color:#3A2E20}
.stat{font-family:var(--font-ui);font-size:12.5px;color:var(--faint);margin-top:8px}
.bar{position:sticky;top:0;z-index:6;background:rgba(250,246,236,.96);border-bottom:1px solid var(--border);
 backdrop-filter:blur(6px);padding:9px 0}
.bar .wrap{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.bar .lb{font-family:var(--font-ui);font-size:12.5px;color:var(--muted);margin-right:2px}
button.btn,.chip,.seg button{font-family:var(--font-ui);font-size:12.5px;color:var(--text);background:#FBF7EE;
 border:1px solid var(--border);border-radius:8px;padding:5px 10px;cursor:pointer}
button.btn:hover,.chip:hover,.seg button:hover{background:#F3E9D6}
.seg{display:flex;gap:0}
.seg button{border-radius:0;margin-left:-1px}
.seg button:first-child{border-radius:8px 0 0 8px;margin-left:0}
.seg button:last-child{border-radius:0 8px 8px 0}
.seg button[aria-pressed="true"]{background:#EFE3CE;font-weight:700;box-shadow:inset 0 0 0 1px var(--rule)}
.chip{border-left:3px solid var(--c)}
.chips{display:flex;flex-wrap:wrap;gap:7px;padding:7px 0 10px;border-bottom:1px solid var(--border);background:rgba(250,246,236,.96)}
.search{margin-left:auto;display:flex;align-items:center;gap:7px;font-family:var(--font-ui);font-size:12.5px;color:var(--muted)}
.search input{font-family:var(--font-ui);font-size:13px;color:var(--text);background:#FBF7EE;border:1px solid var(--border);
 border-radius:8px;padding:5px 9px;width:190px}
#hit{min-width:64px}
/* ── 大纲树 ───────────────────────────── */
section#v-tree{padding:6px 0 40px}
#ol,#ol ol{list-style:none;margin:0;padding:0}
#ol .kids{padding-left:34px;border-left:1px solid var(--rule);margin-left:9px}
li.node>.row{display:flex;gap:9px;align-items:baseline;padding:5px 9px;border-radius:8px}
li.node>.row:hover{background:rgba(138,53,23,.05)}
li.lv1>.row,li.lv2>.row{cursor:pointer}
li.node>.row .ttl{flex:none}
li.node>.row .badge,li.node>.row .ps{margin-left:auto}
.tw{flex:none;width:18px;height:18px;align-self:center;border:1px solid var(--rule);background:#FBF7EE;
 border-radius:5px;cursor:pointer;position:relative;padding:0}
.tw::before{content:'';position:absolute;left:5.5px;top:6px;width:0;height:0;
 border-top:6px solid #6A5C49;border-left:5px solid transparent;border-right:5px solid transparent;
 transform-origin:5px 3px;transition:transform .16s}
li.node.off>.row .tw::before{transform:rotate(-90deg)}
.dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--rule);align-self:center;margin-top:2px}
li.lv1>.row{border-left:3px solid var(--c);border-radius:0 8px 8px 0;padding-left:11px}
li.lv1>.row .ttl{font-size:19.5px;font-weight:700}
li.lv2>.row .ttl{font-size:17px;font-weight:600}
li.lv3>.row .ttl{font-size:15.5px;font-weight:700}
.badge{font-family:var(--font-ui);font-size:12.5px;color:var(--faint);flex:none}
li.lv3>.row{display:grid;grid-template-columns:14px minmax(0,1fr);gap:9px;padding:4px 9px 4px 2px}
li.lv3>.row>a.pt{grid-column:2;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.55fr);gap:10px;align-items:baseline;color:inherit;text-decoration:none;border-radius:7px;padding:2px 7px;margin:0 -7px}
li.lv3>.row>a.pt:hover{background:rgba(138,53,23,.06)}
li.lv3>.row>a.pt:hover .ttl{text-decoration:underline}
li.lv3>.row>a.pt .ttl::after{content:'↗';font-family:var(--font-ui);font-size:10.5px;font-weight:400;color:var(--faint);
 opacity:.45;margin-left:5px;vertical-align:2px}
li.lv3>.row>a.pt:hover .ttl::after{color:var(--accent);opacity:1}
li.lv3>.row .ps{grid-column:2;margin:0;padding:0;text-align:left}
li.lv3>.row .ttl{grid-column:1}
li.node>.row .badge{margin-left:auto}
.go{font-family:var(--font-ui);font-size:11.5px;color:var(--accent);background:#FBF7EE;border:1px solid var(--border);
 border-radius:7px;padding:2px 7px;text-decoration:none;white-space:nowrap;flex:none;margin-left:8px}
.go:hover{background:#F3E9D6;border-color:var(--accent)}
.ps{font-family:var(--font-body);font-size:14.5px;color:#5A4C38;padding-left:14px}
li.node>.sum{margin:1px 0 7px 30px;font-size:14.5px;color:#5A4C38}
li.lv1>.sum{margin-left:33px}
li.lv1+li.lv1{margin-top:20px;border-top:1px solid var(--border);padding-top:14px}
li.node.off>.kids{display:none}
li.node.off>.sum{opacity:.72}
li.node.off>.row .badge{color:var(--muted)}
/* 搜索态：强制展开、隐藏无关 */
#ol.searching .kids{display:block !important}
#ol.searching li.hide{display:none}
li.hit>.row .ttl,li.hit>.row .ps{background:linear-gradient(transparent 56%,rgba(214,178,74,.55) 56%)}
/* ── 瀑布图视图 ───────────────────────── */
section#v-mm{display:none}
section#v-mm.on{display:block}
#stage{height:calc(100vh - 250px);min-height:520px;cursor:grab;padding:6px 0 0}
#stage.drag{cursor:grabbing}
#mm{width:100%;height:100%;display:block;touch-action:none;user-select:none}
#mm .sheet{stroke:none}
.t-root{font-family:var(--font-body);font-size:__F_SRT__px;font-weight:700}
.t-roots{font-family:var(--font-body);font-size:__F_SRS__px}
.t-grp{font-family:var(--font-body);font-size:__F_SGT__px;font-weight:700}
.t-grps{font-family:var(--font-body);font-size:__F_SGS__px;fill:#4A3E2E}
.t-ch{font-family:var(--font-body);font-size:__F_SCT__px;font-weight:700}
.t-chs{font-family:var(--font-body);font-size:__F_SCS__px;fill:#5A4C38}
.t-pt{font-family:var(--font-body);font-size:__F_SPT__px;font-weight:700}
.t-pts{font-family:var(--font-body);font-size:__F_SPS__px;fill:#5F5240}
footer{padding:22px 0 40px;font-family:var(--font-ui);font-size:12.5px;color:var(--faint);border-top:1px solid var(--border);margin-top:8px}
.kbd{font-family:var(--font-ui);font-size:12px;color:var(--faint)}
@media print{
 .bar,.chips,#stage,.kbd,#v-mm{display:none !important}
 #v-tree{display:block !important}
 header{padding:0 0 6px}
 body{background:#fff}
 li.node.off>.kids{display:block !important}
 li.node.off>.sum{opacity:1}
 li.lv1{break-inside:avoid}
 li.lv2{break-inside:avoid}
 section#v-tree{padding:0}
 li.node>.row:hover{background:none}
 a{color:inherit;text-decoration:none}
}
</style></head>
<body>
<header><div class="wrap">
  <h1>__TITLE__<small>全书大纲 · 可折叠</small></h1>
  <p class="lede">__LEDE__</p>
  <div class="stat">__STAT__</div>
</div></header>

<div class="bar"><div class="wrap">
  <span class="lb">视图</span>
  <span class="seg">
    <button id="t-tree" aria-pressed="true">大纲</button>
    <button id="t-mm" aria-pressed="false">瀑布图</button>
  </span>
  <span id="tree-tools">
    <span class="lb" style="margin-left:8px">展开到</span>
    <button class="btn" data-lv="1">部</button>
    <button class="btn" data-lv="2">章</button>
    <button class="btn" data-lv="3">要点</button>
  </span>
  <span id="mm-tools" style="display:none">
    <span class="lb" style="margin-left:8px">缩放</span>
    <button class="btn" id="z-out">−</button><span class="lb" id="z-lv">100%</span><button class="btn" id="z-in">＋</button>
    <button class="btn" id="z-fit">适应全图</button><button class="btn" id="z-100">100%</button>
  </span>
  <button class="btn" id="print">打印</button>
  <span class="search"><input id="q" type="search" placeholder="搜索标题或要点…" autocomplete="off"><span id="hit"></span></span>
</div></div>

<div id="chipsbar"><div class="wrap"><div class="chips" id="chips">__CHIPS__</div></div></div>

<section id="v-tree"><div class="wrap">
  <ol id="ol">__TREE__</ol>
  <p class="kbd">点任意要点 → 打开正文对应小节（新标签页，命中处会短暂高亮）；每个部/章行尾的「正文 ↗」可直接进该部/章。点标题或左侧方框折叠/展开，方框可 Tab 聚焦、← → 收放；「展开到」按层级收放；搜索会自动展开命中层级；打印时全部展开。</p>
</div></section>

<section id="v-mm"><div class="wrap"><div id="stage">__SVG__</div></div></section>

<footer><div class="wrap">《__TITLE__》· 全书大纲（含瀑布图视图）· 由书稿逐章提炼，本地生成，无外部依赖。</div></footer>
<script type="application/json" id="mm-geom">__GEOM__</script>
<script>
(function(){
  var $=function(s){return document.querySelector(s)}, $$=function(s){return [].slice.call(document.querySelectorAll(s))};
  var ol=$('#ol'), hit=$('#hit'), q=$('#q');
  /* ── 折叠 / 展开 ── */
  function setOff(li, off){
    li.classList.toggle('off', off);
    var tw=li.querySelector(':scope>.row .tw'); if(tw) tw.setAttribute('aria-expanded', off?'false':'true');
  }
  function toggle(li){ setOff(li, !li.classList.contains('off')); }
  $$('#ol li.node').forEach(function(li){
    var row=li.querySelector(':scope>.row'), tw=li.querySelector(':scope>.row .tw');
    if(!li.querySelector(':scope>.kids')) return;
    if(tw) tw.addEventListener('click', function(e){ e.stopPropagation(); toggle(li); });
    row.addEventListener('click', function(e){
      if(e.target.closest('button') || e.target.closest('a')) return;   // 链接/按钮各自处理
      var sel=window.getSelection(); if(sel && !sel.isCollapsed) return;   // 允许选字复制
      toggle(li);
    });
  });
  /* 键盘：聚焦方框时 ← 折起（或到父级）、→ 展开（或到首个子级） */
  ol.addEventListener('keydown', function(e){
    var tw=e.target.closest && e.target.closest('.tw'); if(!tw) return;
    var li=tw.closest('li.node');
    if(e.key==='ArrowLeft'){
      e.preventDefault();
      if(!li.classList.contains('off')) setOff(li,true);
      else{ var p=li.parentNode.closest('li.node'); if(p){ var pt=p.querySelector(':scope>.row .tw'); if(pt) pt.focus(); } }
    } else if(e.key==='ArrowRight'){
      e.preventDefault();
      if(li.classList.contains('off')) setOff(li,false);
      else{ var k=li.querySelector(':scope>.kids>li.node'); if(k){ var kt=k.querySelector(':scope>.row .tw'); if(kt) kt.focus(); } }
    }
  });
  /* 按层级展开：1=只到部，2=到章，3=到要点 */
  var lvBtns=$$('#tree-tools .btn');
  function setLevel(n){
    $$('#ol li.node').forEach(function(li){
      var lv=+li.className.match(/lv(\d)/)[1];
      if(!li.querySelector(':scope>.kids')) return;
      setOff(li, lv>=n);                      // 到第 n 层展开，深于 n 的折起
    });
    lvBtns.forEach(function(b){ b.setAttribute('aria-pressed', String(+b.dataset.lv===n)); });
  }
  lvBtns.forEach(function(b){ b.addEventListener('click', function(){ setLevel(+b.dataset.lv); }); });
  /* ── 搜索（自动展开命中层级） ── */
  var t0=null;
  function search(){
    var s=(q.value||'').trim().toLowerCase();
    var nodes=$$('#ol li.node');
    if(!s){
      ol.classList.remove('searching'); hit.textContent='';
      nodes.forEach(function(n){ n.classList.remove('hide','hit'); });
      return;
    }
    var keep={}, hits=0;
    nodes.forEach(function(n){ if((n.dataset.q||'').indexOf(s)>=0){ keep[n.dataset.id]=true; n.classList.add('hit'); hits++;
      n.querySelectorAll('li.node').forEach(function(d){ keep[d.dataset.id]=true; }); } });
    nodes.forEach(function(n){ if(!keep[n.dataset.id]) n.classList.remove('hit'); });
    /* 命中项的祖先全部保留（否则命中的要点被折叠的父级挡住看不见） */
    nodes.forEach(function(n){
      if(!n.classList.contains('hit')) return;
      var p=n.parentNode.closest('li.node');
      while(p){ keep[p.dataset.id]=true; p=p.parentNode.closest('li.node'); }
    });
    nodes.forEach(function(n){ n.classList.toggle('hide', !keep[n.dataset.id]); });
    ol.classList.add('searching');
    hit.textContent = hits? ('命中 '+hits+' 条') : '无命中';
  }
  q.addEventListener('input', function(){ clearTimeout(t0); t0=setTimeout(search,150); });
  /* ── 跳到某部 ── */
  function jump(gi){
    if(secM.classList.contains('on')) return;             // 瀑布图视图下由缩放逻辑处理
    var li=ol.querySelector('li.node[data-id="g'+gi+'"]'); if(!li) return;
    setOff(li,false);
    var y=li.getBoundingClientRect().top + window.scrollY - 128;
    window.scrollTo({top:y, behavior:'smooth'});
    li.querySelector(':scope>.row').animate([{background:'rgba(214,178,74,.42)'},{background:'transparent'}],{duration:1200});
  }
  $$('#chips .chip').forEach(function(b){ b.addEventListener('click', function(){ jump(+b.dataset.gi); }); });
  /* ── 视图切换 ── */
  var vt=$('#t-tree'), vm=$('#t-mm'), secT=$('#v-tree'), secM=$('#v-mm');
  var mmReady=false;
  function view(v){
    var isMM = v==='mm';
    secT.style.display = isMM? 'none':'block';
    secM.classList.toggle('on', isMM);
    vt.setAttribute('aria-pressed', String(!isMM));
    vm.setAttribute('aria-pressed', String(isMM));
    $('#tree-tools').style.display = isMM? 'none':'inline';
    $('#mm-tools').style.display  = isMM? 'inline':'none';
    $('#chips').style.display = 'flex';
    if(isMM && !mmReady){ mmReady=true; if(window.__mmInit) window.__mmInit(); }
    else if(isMM && window.__mmReapply){ window.__mmReapply(); }
  }
  vt.addEventListener('click', function(){ view('tree'); });
  vm.addEventListener('click', function(){ view('mm'); });
  $('#print').addEventListener('click', function(){ window.print(); });
  /* ── 瀑布图（几何平移缩放，复用同一份 SVG 几何数据） ── */
  var W=__W__, H=__H__, svg=$('#mm'), stage=$('#stage');
  var geom=JSON.parse(document.getElementById('mm-geom').textContent);
  var k=1, vx=0, vy=0, minK=0.12, maxK=2.6;
  function size(){ return { w: stage.clientWidth, h: stage.clientHeight }; }
  function apply(){
    var s=size(); if(!s.w||!s.h) return;
    var vw=s.w/k, vh=s.h/k;
    if(vw>=W){ vx=(W-vw)/2; } else { vx=Math.max(0,Math.min(W-vw,vx)); }
    if(vh>=H){ vy=(H-vh)/2; } else { vy=Math.max(0,Math.min(H-vh,vy)); }
    svg.setAttribute('viewBox', vx.toFixed(1)+' '+vy.toFixed(1)+' '+vw.toFixed(1)+' '+vh.toFixed(1));
    $('#z-lv').textContent=Math.round(k*100)+'%';
  }
  function fitAll(){ var s=size(); if(!s.w||!s.h) return; k=Math.min(s.w/W,s.h/H)*0.96; vx=(W-s.w/k)/2; vy=(H-s.h/k)/2; apply(); }
  function zoomAt(f, cx, cy){
    var s=size(), mx=(cx===undefined?s.w/2:cx), my=(cy===undefined?s.h/2:cy);
    var wx=vx+mx/k, wy=vy+my/k, nk=Math.max(minK,Math.min(maxK,k*f));
    vx=wx-mx/nk; vy=wy-my/nk; k=nk; apply();
  }
  $('#z-in').addEventListener('click', function(){ zoomAt(1.25); });
  $('#z-out').addEventListener('click', function(){ zoomAt(1/1.25); });
  $('#z-fit').addEventListener('click', fitAll);
  $('#z-100').addEventListener('click', function(){ k=1; apply(); });
  stage.addEventListener('wheel', function(e){
    if(!e.ctrlKey && Math.abs(e.deltaY)<1) return;
    e.preventDefault();
    var r=stage.getBoundingClientRect();
    zoomAt(e.deltaY<0?1.12:1/1.12, e.clientX-r.left, e.clientY-r.top);
  }, {passive:false});
  var dragging=false, px=0, py=0;
  stage.addEventListener('pointerdown', function(e){ dragging=true; px=e.clientX; py=e.clientY; stage.classList.add('drag'); stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', function(e){ if(!dragging) return; vx-=(e.clientX-px)/k; vy-=(e.clientY-py)/k; px=e.clientX; py=e.clientY; apply(); });
  stage.addEventListener('pointerup', function(){ dragging=false; stage.classList.remove('drag'); });
  $$('#chips .chip').forEach(function(b){
    b.addEventListener('click', function(){
      if(!secM.classList.contains('on')) return;            // 大纲视图下由 jump 处理
      var col=+b.dataset.col, b0=geom.filter(function(g){ return g.col===col; });
      if(!b0.length) return;
      if(k<0.55) k=0.8;
      vx=Math.min.apply(null,b0.map(function(g){ return g.x; }))-24;
      vy=Math.min.apply(null,b0.map(function(g){ return g.y; }))-24;
      apply();
    });
  });
  window.addEventListener('resize', function(){ if(secM.classList.contains('on')) apply(); });
  window.__mmInit=function(){ var s=size(), fk=Math.min(s.w/W,s.h/H); k=Math.max(0.5, Math.min(1, fk)); vx=0; vy=0; apply(); };
  window.__mmReapply=function(){ apply(); };
  /* ── 初始状态 ── */
  setLevel(2);                       // 默认展开到「章」，要点折起
  if(location.hash==='#mm') view('mm');
  else if(/^#g\d+$/.test(location.hash)){ setTimeout(function(){ jump(+location.hash.slice(2)); }, 60); }
})();
</script>
</body></html>'''


def build(data, targets=None):
    root = data['root']
    nch = sum(len(g['chapters']) for g in data['groups'])
    npt = sum(len(c['points']) for g in data['groups'] for c in g['chapters'])
    chl, ptl = targets if targets else load_targets(data)
    svg, W, H, _ = bm.build_svg(data)
    geom = json.dumps(
        [{'id': b['id'], 'kind': b['kind'], 'x': b['x'], 'y': b['y'], 'w': b['w'],
          'h': b['h'], 'col': b['col']} for b in bm.layout(data)[0]],
        ensure_ascii=False,
    )
    stat = (f'{len(data["groups"])} 部（含序跋） · {nch} 章 · {npt} 个要点，每点一句话，'
            f'点任一点可跳到正文对应小节。默认展开到「章」；可折叠到「部」只看骨架，或全开逐点读。')
    page = (PAGE
            .replace('__TITLE__', esc(root['title']))
            .replace('__LEDE__', esc(root['summary']))
            .replace('__STAT__', stat)
            .replace('__CHIPS__', chips(data))
            .replace('__TREE__', tree(data, chl, ptl))
            .replace('__SVG__', svg)
            .replace('__GEOM__', geom)
            .replace('__W__', f'{W:.0f}').replace('__H__', f'{H:.0f}')
            .replace('__F_SRT__', str(bm.FS_ROOT_T)).replace('__F_SRS__', str(bm.FS_ROOT_S))
            .replace('__F_SGT__', str(bm.FS_GRP_T)).replace('__F_SGS__', str(bm.FS_GRP_S))
            .replace('__F_SCT__', str(bm.FS_CH_T)).replace('__F_SCS__', str(bm.FS_CH_S))
            .replace('__F_SPT__', str(bm.FS_PT_T)).replace('__F_SPS__', str(bm.FS_PT_S)))
    return page, (W, H, npt, nch)


if __name__ == '__main__':
    src = json.loads((D / 'mindmap_data.json').read_text(encoding='utf-8'))
    out = pathlib.Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else OUT
    tg = load_targets(src)
    page, (W, H, npt, nch) = build(src, tg)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding='utf-8')
    npt_link = sum(1 for k, v in tg[1].items() if v['aid'] != 'chapter')
    print(f'写出 {out}')
    print(f'大纲 {len(src["groups"])} 部 / {nch} 章 / {npt} 要点 · 瀑布画布 {W:.0f}×{H:.0f} · 字节 {len(page.encode("utf-8")):,}')
    print(f'正文链接：要点 {npt}（落到具体小节 {npt_link} / 章首 {npt - npt_link}）+ 部 {len(src["groups"])} + 章 {nch} = {npt + len(src["groups"]) + nch}')
