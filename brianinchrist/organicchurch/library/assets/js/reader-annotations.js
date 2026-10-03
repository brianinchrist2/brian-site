/**
 * reader-annotations.js — 阅读器正文高亮（P2：高亮核心）。
 * 经典脚本，暴露全局 ReaderAnnotations（与 reader-auth.js 同模式）。
 * 设计：docs/superpowers/specs/2026-10-03-reader-highlight-annotations-design.md
 *
 * 本期（§7-P2）范围：文本模型 / 块坐标锚点 / L1 解析（失败一律孤儿：不渲染、不删除）/
 *   幂等渲染 / 选区工具条 / 换色与删除 / 登录态读写 API / 访客草稿 + 登录引导。
 * 不在本期：笔记浮层与"我的笔记"面板、#hl- 深链定位、离线队列（→ §7-P3）；
 *   L2–L5 漂移恢复、自愈、模糊确认（→ §7-P4）。留有 TODO 注释。
 * 所有用户内容（quote/note）只用 textContent 渲染，不拼 innerHTML。
 */
(function () {
  'use strict';

  var BLOCK_SEL = 'p,li,h1,h2,h3,h4,h5,h6,pre,td,th,dt,dd,figcaption';   // 叶子块候选（§3.2）
  var HEAD_RE = /^h[1-6]$/;
  var COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];
  var COLOR_LABEL = { yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色', purple: '紫色' };
  var COLOR_OK = { yellow: 1, green: 1, blue: 1, pink: 1, purple: 1, none: 1 };
  var ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var API = '/api/reader/annotations';
  var GUEST_KEY = 'rdr_ann_guest';
  var CTX_LEN = 32;            // prefix / suffix 长度
  var MAX_QUOTE = 5000;        // 与后端一致
  var MIN_QUOTE = 2;           // §3.4：建议至少 2 个字
  var HEADING_TEXT_MAX = 200;  // anchor 总长 ≤ 4096 字节
  var SELECT_DEBOUNCE = 150;   // selectionchange 防抖（移动端拖选择柄）

  var S = {
    bookId: null, chapter: null, manifest: null, body: null, onRendered: null,
    server: [],        // 登录态下本章注解（GET 结果 + 本地新建/未同步）
    placed: [],        // 最近一次渲染的解析结果 [{ a, status, s, e }]
    model: null,       // 懒缓存的 TextModel；任何 DOM 变更（applyMarks）后置空
    seq: 0,            // refresh 序号：只让最后一次生效
    rendered: false,
    pending: null,     // 工具条当前选区 { r, existing }
    pointerDown: false, pointerType: 'mouse',
    wired: false, authBound: false, loginBusy: false,
    toolbar: null, toastEl: null, toastTimer: 0, selTimer: 0
  };

  function warn(e) { try { console.warn('[ReaderAnnotations]', e); } catch (_) { /* ignore */ } }
  function nowISO() { return new Date().toISOString(); }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 0; }
  function auth() { return window.ReaderAuth || null; }
  function loggedIn() { var A = auth(); return !!(A && A.isLoggedIn()); }

  function uuid() {
    var c = window.crypto;
    if (c && typeof c.randomUUID === 'function') { try { return c.randomUUID(); } catch (e) { /* 非安全上下文 */ } }
    var b = new Uint8Array(16), i;
    if (c && c.getRandomValues) c.getRandomValues(b);
    else for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = '';
    for (i = 0; i < 16; i++) h += (b[i] + 256).toString(16).slice(1);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /* ── 1. TextModel（§3.2）──────────────────────────────────────────────── */

  // 空白判定：与 /[\s 　]/ 等价，但对逐字符循环更快
  function isWs(c) {
    if (c === 32 || (c >= 9 && c <= 13)) return true;
    if (c < 128) return false;
    return c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 ||
      c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
  }

  // 同步 53 位字符串哈希（cyrb53）；不用 crypto.subtle（非安全上下文不可用）
  function cyrb53(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  /* 只作用于 body（.rdr-chapter-body）。<mark> 不改变文本与块归属，所以页面上有无高亮，模型都一样。
     block = { el, tag, text, len, start, mapN, mapO, infos }
       mapN[i] / mapO[i]：规范化第 i 个字符 → 所在文本节点 / 节点内原始偏移
       infos[k]：{ node, idx, lo, hi, bi }，idx[rawOffset] = 该边界之前已输出的规范化字符数 */
  function buildModel(body) {
    var recs = [], byEl = new Map(), docNodes = [];
    var w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (var n = w.nextNode(); n; n = w.nextNode()) {
      var el = n.parentElement && n.parentElement.closest(BLOCK_SEL);
      if (!el || !body.contains(el)) continue;           // 块外文本（块间 "\n" 等）忽略
      var r = byEl.get(el);
      if (!r) { r = { el: el, nodes: [] }; byEl.set(el, r); recs.push(r); }
      r.nodes.push(n);
      docNodes.push(n);
    }
    var blocks = [], nodeInfo = new Map(), total = 0;
    recs.forEach(function (rec) {
      var out = [], mapN = [], mapO = [], infos = [], count = 0, lastSp = true;   // lastSp 初值 true：丢弃块首空白
      rec.nodes.forEach(function (node) {
        var d = node.data, idx = new Int32Array(d.length + 1), lo = count;
        for (var k = 0; k < d.length; k++) {
          idx[k] = count;
          var sp = isWs(d.charCodeAt(k));
          if (sp && lastSp) continue;                    // 连续空白折叠为单个空格
          out.push(sp ? ' ' : d.charAt(k)); mapN.push(node); mapO.push(k); count++;
          lastSp = sp;
        }
        idx[d.length] = count;
        infos.push({ node: node, idx: idx, lo: lo, hi: count, bi: 0 });
      });
      if (!count) return;                                // 全空白块丢弃
      if (lastSp) { out.pop(); mapN.pop(); mapO.pop(); count--; }   // 去掉块尾空格
      var bi = blocks.length;
      infos.forEach(function (inf) {
        if (inf.lo > count) inf.lo = count;
        if (inf.hi > count) inf.hi = count;
        inf.bi = bi;
        nodeInfo.set(inf.node, inf);
      });
      blocks.push({ el: rec.el, tag: rec.el.tagName.toLowerCase(), text: out.join(''), len: count,
        start: total, mapN: mapN, mapO: mapO, infos: infos });
      total += count + 1;                                // +1：块间 "\n"
    });
    var text = blocks.map(function (b) { return b.text; }).join('\n');
    docNodes = docNodes.filter(function (nd) { return nodeInfo.has(nd); });     // 文档序，仅含模型内文本
    return { blocks: blocks, text: text, len: text.length, rev: cyrb53(text).toString(16),
      nodeInfo: nodeInfo, docNodes: docNodes };
  }

  // 二分：最后一个 start <= pos 的块序号
  function blockAt(M, pos) {
    var lo = 0, hi = M.blocks.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (M.blocks[mid].start <= pos) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  /* ── 2. Anchor：选区 → 锚点（§3.4）、锚点 → 区间（§3.5 的 L1）────────────── */

  // DOM 边界点 → 全章规范化偏移。起点向后、终点向前取最近的模型文本；找不到返回 -1
  function boundaryPos(M, container, offset, isStart) {
    var info = container.nodeType === 3 ? M.nodeInfo.get(container) : null, b;
    if (info) { b = M.blocks[info.bi]; return b.start + Math.min(info.idx[offset], b.len); }
    var probe = document.createRange();
    try { probe.setStart(container, offset); } catch (e) { return -1; }   // 同时折叠到该点
    var nodes = M.docNodes, lo = 0, hi = nodes.length - 1, ans = -1, mid;
    if (isStart) {                                       // 第一个起点位于边界之后（含）的模型文本
      while (lo <= hi) {
        mid = (lo + hi) >> 1;
        if (probe.comparePoint(nodes[mid], 0) >= 0) { ans = mid; hi = mid - 1; } else lo = mid + 1;
      }
      if (ans < 0) return -1;
      info = M.nodeInfo.get(nodes[ans]); b = M.blocks[info.bi];
      return b.start + Math.min(info.idx[0], b.len);
    }
    while (lo <= hi) {                                   // 最后一个终点位于边界之前（含）的模型文本
      mid = (lo + hi) >> 1;
      if (probe.comparePoint(nodes[mid], nodes[mid].data.length) <= 0) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (ans < 0) return -1;
    info = M.nodeInfo.get(nodes[ans]); b = M.blocks[info.bi];
    return b.start + Math.min(info.idx[nodes[ans].data.length], b.len);
  }

  // 返回 null（选区在 body 之外/为空）、{ error: 'short'|'long' } 或 { anchor, quote, s, e }
  function anchorFromRange(M, range) {
    var s = boundaryPos(M, range.startContainer, range.startOffset, true);
    var e = boundaryPos(M, range.endContainer, range.endOffset, false);
    if (s < 0 || e < 0) return null;
    var T = M.text;
    while (s < e && (T.charCodeAt(s) === 32 || T.charCodeAt(s) === 10)) s++;           // 收紧首尾空白
    while (e > s && (T.charCodeAt(e - 1) === 32 || T.charCodeAt(e - 1) === 10)) e--;
    if (e <= s) return null;
    if (e - s > MAX_QUOTE) return { error: 'long' };
    if (e - s < MIN_QUOTE) return { error: 'short' };
    var bs = blockAt(M, s), be = blockAt(M, e - 1), sb = M.blocks[bs], eb = M.blocks[be];
    var head = { id: '', text: '', tag: '' };
    for (var i = bs; i >= 0; i--) {                      // 起点所在块或其之前最近的 heading（P4 的 L2 以 tag+text 比对）
      if (HEAD_RE.test(M.blocks[i].tag)) {
        head = { id: M.blocks[i].el.id || '', text: M.blocks[i].text.slice(0, HEADING_TEXT_MAX), tag: M.blocks[i].tag };
        break;
      }
    }
    return {
      s: s, e: e, quote: T.slice(s, e),
      anchor: {
        v: 1, rev: M.rev, len: M.len,
        start: { block: bs, offset: s - sb.start }, end: { block: be, offset: e - eb.start },
        pos: { start: s, end: e },
        prefix: T.slice(Math.max(0, s - CTX_LEN), s), suffix: T.slice(e, e + CTX_LEN),
        heading: head
      }
    };
  }

  // §3.5 的 ctx：前后文匹配度 ∈ [0, 2]
  function ctxScore(T, s, e, prefix, suffix) {
    var a, b, n;
    if (!prefix) a = s === 0 ? 1 : 0;
    else {
      n = 0;
      while (n < prefix.length && s - 1 - n >= 0 && T.charCodeAt(s - 1 - n) === prefix.charCodeAt(prefix.length - 1 - n)) n++;
      a = n / prefix.length;
    }
    if (!suffix) b = e === T.length ? 1 : 0;
    else {
      n = 0;
      while (n < suffix.length && e + n < T.length && T.charCodeAt(e + n) === suffix.charCodeAt(n)) n++;
      b = n / suffix.length;
    }
    return a + b;
  }

  /* L1 精确：rev 相同用 pos，否则用块坐标（并要求 ctx ≥ 1.0）；两者都要求原文与 quote 完全一致。
     任何失败一律 orphan：不渲染、不删除，宁缺勿错。
     TODO(§7-P4)：L2 小节内 / L3 全章 / L4 首尾模糊 / 自愈回写；此处是它们的接入点。 */
  function resolveAnchor(anchor, quote, M) {
    var orphan = { status: 'orphan', s: -1, e: -1 }, T = M.text;
    if (!anchor || anchor.v !== 1 || typeof quote !== 'string' || !quote) return orphan;
    var s, e;
    if (anchor.rev === M.rev && anchor.pos && isInt(anchor.pos.start) && isInt(anchor.pos.end)) {
      s = anchor.pos.start; e = anchor.pos.end;
      if (e - s === quote.length && e <= T.length && T.substr(s, quote.length) === quote) return { status: 'exact', s: s, e: e };
    }
    var st = anchor.start, en = anchor.end;
    if (st && en && isInt(st.block) && isInt(st.offset) && isInt(en.block) && isInt(en.offset)) {
      var sb = M.blocks[st.block], eb = M.blocks[en.block];
      if (sb && eb && st.offset <= sb.len && en.offset <= eb.len) {
        s = sb.start + st.offset; e = eb.start + en.offset;
        if (e > s && T.slice(s, e) === quote &&
            ctxScore(T, s, e, String(anchor.prefix || ''), String(anchor.suffix || '')) >= 1.0) {
          return { status: 'exact', s: s, e: e };
        }
      }
    }
    return orphan;
  }

  /* ── 3. Marks：幂等渲染（§6.5）────────────────────────────────────────────
     不依赖活动 Range：先把所有注解解析成全章区间，再按文本节点汇总切点，一次性 splitText，
     最后对每个片段按"外层先、内层后"嵌套包 <mark>。每个文本节点单独包，从不包块级元素。 */

  function clearMarks(body) {
    var marks = body.querySelectorAll('mark.rdr-hl'), parents = new Set();
    for (var i = marks.length - 1; i >= 0; i--) {        // 文档序反向：内层先拆
      var m = marks[i], p = m.parentNode;
      if (!p) continue;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      parents.add(p);
    }
    parents.forEach(function (p) { p.normalize(); });    // marked 产出无相邻文本节点，normalize 即精确还原
  }

  function colorOf(a) { return COLOR_OK[a.color] ? a.color : 'yellow'; }

  function makeMark(a) {
    var m = document.createElement('mark');
    m.className = 'rdr-hl rdr-hl-' + colorOf(a) + ((a.draft || a.unsynced) ? ' rdr-hl-draft' : '');
    m.setAttribute('data-hl-id', a.id);
    return m;
  }

  // 把区间 [rec.s, rec.e) 拆成"文本节点 + 原始偏移区间"，登记到 cuts（Map: 文本节点 → [{from,to,rec}]）
  function collectCuts(M, rec, cuts) {
    var bs = blockAt(M, rec.s), be = blockAt(M, rec.e - 1);
    for (var bi = bs; bi <= be; bi++) {
      var b = M.blocks[bi];
      var ls = Math.max(rec.s, b.start) - b.start, le = Math.min(rec.e, b.start + b.len) - b.start;
      if (le <= ls) continue;
      var nS = b.mapN[ls], oS = b.mapO[ls], nE = b.mapN[le - 1], oE = b.mapO[le - 1] + 1, started = false;
      for (var k = 0; k < b.infos.length; k++) {
        var inf = b.infos[k], node = inf.node;
        if (node === nS) started = true;
        if (started && (node === nS || inf.hi > inf.lo)) {        // 折叠掉的纯空白节点不包
          var from = node === nS ? oS : 0, to = node === nE ? oE : node.data.length;
          if (to > from) {
            var list = cuts.get(node);
            if (!list) { list = []; cuts.set(node, list); }
            list.push({ from: from, to: to, rec: rec });
          }
        }
        if (node === nE) break;
      }
    }
  }

  function wrapNode(node, list, firstMark, lastMark) {
    var pts = [0, node.data.length], i;
    list.forEach(function (c) { pts.push(c.from, c.to); });
    pts.sort(function (x, y) { return x - y; });
    var uniq = [pts[0]];
    for (i = 1; i < pts.length; i++) if (pts[i] !== uniq[uniq.length - 1]) uniq.push(pts[i]);
    var cur = node;
    for (i = 0; i < uniq.length - 1; i++) {
      var from = uniq[i], to = uniq[i + 1], piece = cur;
      if (i < uniq.length - 2) cur = piece.splitText(to - from);
      var cover = list.filter(function (c) { return c.from <= from && c.to >= to; });   // list 已按外→内排序
      var inner = piece;
      for (var j = cover.length - 1; j >= 0; j--) {      // 最内层先包
        var a = cover[j].rec.a, m = makeMark(a);
        inner.parentNode.insertBefore(m, inner);
        m.appendChild(inner);
        inner = m;
        if (!firstMark[a.id]) firstMark[a.id] = m;
        lastMark[a.id] = m;
      }
    }
  }

  // 清旧 → 建模 → 解析 → 渲染。返回 [{ a, status, s, e }]（含 orphan，供 P3 面板使用）
  function applyMarks(body, items) {
    clearMarks(body);
    if (!items.length) return [];                        // 无高亮：不必建模，页面与未登录基线完全一致
    var M = buildModel(body), placed = [], active = [];
    items.forEach(function (a) {
      if (!a || !ID_RE.test(a.id)) return;
      var r = resolveAnchor(a.anchor, a.quote, M), rec = { a: a, status: r.status, s: r.s, e: r.e };
      placed.push(rec);
      if (r.status === 'exact') active.push(rec);
    });
    active.sort(function (x, y) {                        // 外层先包：start 升序、end 降序；同区间后建的在内层
      return (x.s - y.s) || (y.e - x.e) ||
        (x.a.created_at < y.a.created_at ? -1 : x.a.created_at > y.a.created_at ? 1 : (x.a.id < y.a.id ? -1 : 1));
    });
    var cuts = new Map(), firstMark = {}, lastMark = {};
    active.forEach(function (rec) { collectCuts(M, rec, cuts); });
    M.blocks.forEach(function (b) {
      b.infos.forEach(function (inf) {
        var list = cuts.get(inf.node);
        if (list) wrapNode(inf.node, list, firstMark, lastMark);
      });
    });
    active.forEach(function (rec) {
      var id = rec.a.id, f = firstMark[id], l = lastMark[id];
      if (f) f.id = 'hl-' + id;                          // §3.8：深链 id（P3 使用）；与 aid 形态 ^h\d+ 不冲突
      if (l) {
        l.classList.add('rdr-hl-tail');
        if (rec.a.note && /\S/.test(rec.a.note)) l.classList.add('rdr-hl-has-note');
      }
    });
    return placed;
  }

  function getModel() {
    if (!S.model) S.model = buildModel(S.body);
    return S.model;
  }

  function marksOf(id) { return S.body ? S.body.querySelectorAll('mark.rdr-hl[data-hl-id="' + id + '"]') : []; }

  function setMarkColor(id, color) {                      // 换色只改 class，不重建 DOM
    var ms = marksOf(id), cls = 'rdr-hl-' + (COLOR_OK[color] ? color : 'yellow');
    for (var i = 0; i < ms.length; i++) {
      for (var k = 0; k < COLORS.length; k++) ms[i].classList.remove('rdr-hl-' + COLORS[k]);
      ms[i].classList.remove('rdr-hl-none');
      ms[i].classList.add(cls);
    }
  }
  function setMarkDraft(id, draft) {
    var ms = marksOf(id);
    for (var i = 0; i < ms.length; i++) ms[i].classList.toggle('rdr-hl-draft', !!draft);
  }

  /* ── 4. Store：访客草稿（localStorage.rdr_ann_guest）+ 服务端 API（§5、§6.8）───── */

  function readGuest() {
    try {
      var v = JSON.parse(localStorage.getItem(GUEST_KEY) || '[]');
      return Array.isArray(v) ? v.filter(function (d) {
        return d && ID_RE.test(d.id) && typeof d.book === 'string' && typeof d.chapter === 'string' &&
          typeof d.quote === 'string' && d.anchor && typeof d.anchor === 'object';
      }) : [];
    } catch (e) { return []; }
  }
  function writeGuest(list) {
    try {
      if (list.length) localStorage.setItem(GUEST_KEY, JSON.stringify(list));
      else localStorage.removeItem(GUEST_KEY);
    } catch (e) { /* localStorage 不可用：草稿仅存在于本页内存之外，无法保留 */ }
  }
  function draftToItem(d) {
    var iso = new Date(d.ts || Date.now()).toISOString();
    return { id: d.id, book: d.book, chapter: d.chapter, color: d.color, quote: d.quote, note: d.note || '',
      anchor: d.anchor, created_at: iso, updated_at: iso, draft: true };
  }
  function saveGuestItem(a) {                             // upsert
    var list = readGuest(), d = { id: a.id, book: a.book, chapter: a.chapter, color: a.color, quote: a.quote,
      note: a.note || '', anchor: a.anchor, ts: Date.parse(a.created_at) || Date.now() }, found = false;
    for (var i = 0; i < list.length; i++) if (list[i].id === a.id) { list[i] = d; found = true; break; }
    if (!found) list.push(d);
    writeGuest(list);
  }
  function removeGuest(id) {
    writeGuest(readGuest().filter(function (d) { return d.id !== id; }));
  }
  function isCurrent(d) { return !!S.chapter && d.book === S.bookId && d.chapter === S.chapter.id; }

  function fromServer(x) {
    if (!x || !ID_RE.test(x.id)) return null;
    var anchor = x.anchor;
    if (typeof anchor === 'string') { try { anchor = JSON.parse(anchor); } catch (e) { anchor = null; } }
    return { id: x.id, book: x.book_id, chapter: x.chapter_id, color: x.color, quote: x.quote, note: x.note || '',
      anchor: anchor, created_at: x.created_at || '', updated_at: x.updated_at || '' };
  }

  // 拉本章注解；任何异常（未部署的 HTML、非 2xx、网络）一律返回 null
  function fetchChapter() {
    var A = auth();
    if (!A || !A.isLoggedIn()) return Promise.resolve(null);
    var url = API + '?book=' + encodeURIComponent(S.bookId) + '&chapter=' + encodeURIComponent(S.chapter.id);
    return fetch(url, { headers: { Authorization: 'Bearer ' + A.getToken() } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (d) {
        if (!d || !d.success || !Array.isArray(d.annotations)) return null;
        return d.annotations.map(fromServer).filter(Boolean);
      })
      .catch(function () { return null; });
  }

  function requestPut(a) {
    return fetch(API + '/' + a.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth().getToken() },
      body: JSON.stringify({ book: a.book, chapter: a.chapter, color: a.color, quote: a.quote, note: a.note || '', anchor: a.anchor })
    }).then(function (res) {
      return res.json().then(function (data) { return { status: res.status, data: data }; },
        function () { return { status: res.status, data: null }; });
    }, function () { return { status: 0, data: null }; });
  }

  // §5.5 的客户端处理。TODO(§7-P3)：失败时入 rdr_ann_pending_<uid> 队列并重试，此处仅内存保留 + 提示。
  // 返回 Promise<'ok'|'auth'|'drop'|'unavailable'>
  function syncPut(a, retried) {
    return requestPut(a).then(function (r) {
      if (r.status === 409 && !retried) return syncPut(a, true);
      if ((r.status === 200 || r.status === 201) && r.data && r.data.success) {
        if (a.unsynced) { a.unsynced = false; setMarkDraft(a.id, false); }
        if (r.data.annotation && r.data.annotation.updated_at) a.updated_at = r.data.annotation.updated_at;
        return 'ok';
      }
      if (r.status === 401) {
        stashToGuest(a);
        toast('登录已过期，标注已存为本地草稿；请重新登录后同步');
        if (!S.loginBusy) openLogin();
        return 'auth';
      }
      if (r.status === 403) { dropLocal(a); toast('标注数量已达上限，未保存'); return 'drop'; }
      if (r.status === 404 || r.status === 410) { dropLocal(a); return 'drop'; }
      if (r.status === 400) { warn('PUT 400: ' + (r.data && r.data.error)); dropLocal(a); toast('标注格式有误，未能保存'); return 'drop'; }
      a.unsynced = true; setMarkDraft(a.id, true);          // 429 / 5xx / 非 JSON（路由未部署）/ 网络错误
      toast('服务暂不可用，标注尚未保存到服务器');
      return 'unavailable';
    });
  }

  function syncDelete(a) {
    var A = auth();
    if (!A || !A.isLoggedIn()) return;
    fetch(API + '/' + a.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + A.getToken() } })
      .then(function (res) {
        if (res.ok || res.status === 404) return;           // 404 视为已完成（§5.5）
        if (res.status === 401) { toast('登录已过期，删除未同步；请重新登录'); openLogin(); return; }
        toast('服务暂不可用，删除未同步到服务器');
      }, function () { toast('服务暂不可用，删除未同步到服务器'); });
  }

  function dropLocal(a) {
    S.server = S.server.filter(function (x) { return x.id !== a.id; });
    removeGuest(a.id);
    render();
  }
  function stashToGuest(a) {                              // 登录态写入遇 401：转入访客草稿，不丢
    S.server = S.server.filter(function (x) { return x.id !== a.id; });
    a.draft = true; a.unsynced = false;
    saveGuestItem(a);
    render();
  }

  /* ── 5. 渲染编排与 refresh ───────────────────────────────────────────── */

  function allItems() {
    var seen = {}, out = [];
    S.server.forEach(function (a) { seen[a.id] = 1; out.push(a); });
    readGuest().forEach(function (d) { if (isCurrent(d) && !seen[d.id]) out.push(draftToItem(d)); });
    return out;
  }

  function render() {
    if (!S.body || !document.contains(S.body)) return;
    S.placed = applyMarks(S.body, allItems());
    S.model = null;
    hideToolbar();
  }

  /* 登录/登出后：重拉 → 合并访客草稿 → 重渲染。幂等：每次都从 clearMarks 开始，连调 N 次 innerHTML 不变。
     TODO(§7-P3)：合并本章离线队列项；TODO(§7-P4)：orphan/fuzzy 的面板分组与自愈。 */
  function refresh() {
    if (!S.body || !S.chapter) return Promise.resolve();
    var seq = ++S.seq;
    return fetchChapter().then(function (list) {
      if (seq !== S.seq || !S.body || !document.contains(S.body)) return;
      if (list) {                                          // 拉取失败（null）则保留现有内存状态
        var carry = S.server.filter(function (x) {
          return x.unsynced && !list.some(function (l) { return l.id === x.id; });
        });
        S.server = list.concat(carry);
      } else if (!loggedIn()) {
        S.server = [];
      }
      render();
      if (!S.rendered) {
        S.rendered = true;
        // TODO(§7-P3)：#hl-<id> 深链。高亮渲染晚于 reader.js 的 0/160/420ms 定位，此处补一次（§3.8）
        if (S.onRendered && /^#hl-/.test(window.location.hash || '')) S.onRendered();
      }
    }).catch(warn);
  }

  /* ── 6. 登录联动（§6.8）──────────────────────────────────────────────── */

  function openLogin() {
    var A = auth();
    if (!A || typeof A.openLoginModal !== 'function') return;
    // 有 onLogin 事件时一律走事件；否则退回回调，保证老版本 reader-auth.js 也能工作
    A.openLoginModal(typeof A.onLogin === 'function' ? undefined : handleLogin);
  }

  // 顺序上传草稿：成功则从访客存储移除；遇到非 ok 立即停止（避免重复提示/无谓请求）
  function uploadDrafts(drafts) {
    var chain = Promise.resolve('ok');
    drafts.forEach(function (d) {
      chain = chain.then(function (prev) {
        if (prev !== 'ok') return prev;
        return syncPut(draftToItem(d)).then(function (res) {
          if (res === 'ok') removeGuest(d.id);
          return res;
        });
      });
    });
    return chain;
  }

  function handleLogin() {
    if (S.loginBusy) return;
    S.loginBusy = true;
    var drafts = readGuest();
    var cur = drafts.filter(isCurrent), others = drafts.filter(function (d) { return !isCurrent(d); });
    uploadDrafts(cur).then(function () {
      S.loginBusy = false;
      refresh();
      if (others.length) {                                // 公用电脑防串号：其它章的草稿需用户确认
        toast('将 ' + others.length + ' 条未登录时的标注保存到当前账号？', [
          { label: '保存', run: function () { uploadDrafts(others).then(function () { refresh(); }); } },
          { label: '忽略', run: function () {} }
        ]);
      }
    }).catch(function (e) { S.loginBusy = false; warn(e); });
  }

  function handleLogout() {
    S.server = [];
    refresh();
  }

  function bindAuth() {
    var A = auth();
    if (S.authBound || !A) return;
    S.authBound = true;
    if (typeof A.onLogin === 'function') A.onLogin(handleLogin);
    if (typeof A.onLogout === 'function') A.onLogout(handleLogout);
  }

  /* ── 7. UI：toast、选区工具条（§6.4）──────────────────────────────────── */

  function hideToast() {
    if (S.toastEl) S.toastEl.hidden = true;
    clearTimeout(S.toastTimer);
  }
  function toast(msg, actions) {
    var t = S.toastEl;
    if (!t) {
      t = S.toastEl = document.createElement('div');
      t.id = 'rdr-ann-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = '';
    var span = document.createElement('span');
    span.textContent = msg;
    t.appendChild(span);
    (actions || []).forEach(function (act) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = act.label;
      b.addEventListener('click', function () { hideToast(); act.run(); });
      t.appendChild(b);
    });
    t.hidden = false;
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(hideToast, actions && actions.length ? 15000 : 4500);
  }

  function ensureToolbar() {
    if (S.toolbar) return S.toolbar;
    var t = document.createElement('div');
    t.id = 'rdr-ann-toolbar';
    t.setAttribute('role', 'toolbar');
    t.setAttribute('aria-label', '高亮');
    t.hidden = true;
    COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rdr-ann-dot rdr-ann-dot-' + c;
      b.setAttribute('data-color', c);
      b.setAttribute('aria-label', COLOR_LABEL[c] + '高亮');
      b.title = COLOR_LABEL[c];
      t.appendChild(b);
    });
    // TODO(§7-P3)：此处加 "✎ 笔记"（以 color:'none' 创建并打开笔记浮层）
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'rdr-ann-del';
    del.setAttribute('data-act', 'delete');
    del.textContent = '删除';
    del.hidden = true;
    t.appendChild(del);
    // 不吞选区：按下时阻止默认行为（否则点击会先清掉选区），动作在 click 里执行
    t.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    t.addEventListener('mousedown', function (e) { e.preventDefault(); });
    t.addEventListener('click', onToolbarClick);
    document.body.appendChild(t);
    S.toolbar = t;
    return t;
  }

  function hideToolbar() {
    S.pending = null;
    if (S.toolbar) S.toolbar.hidden = true;
  }

  function placeToolbar(range) {
    var t = S.toolbar, rects = [], all = range.getClientRects(), i;
    for (i = 0; i < all.length; i++) if (all[i].width > 0 || all[i].height > 0) rects.push(all[i]);
    if (!rects.length) { hideToolbar(); return; }
    t.style.visibility = 'hidden';
    t.hidden = false;
    var first = rects[0], last = rects[rects.length - 1], tw = t.offsetWidth, th = t.offsetHeight;
    var bar = document.getElementById('rdr-topbar'), topLimit = (bar ? bar.offsetHeight : 54) + 4;
    var touch = S.pointerType === 'touch', top, ref;
    if (touch) { top = last.bottom + 14; ref = last; }     // 触屏：末行下方，避开原生选区菜单
    else { top = first.top - th - 8; ref = first; }        // 鼠标：首行上方
    if (!touch && top < topLimit) { top = last.bottom + 8; ref = last; }   // 会被顶栏挡住：翻到下方
    if (top + th > window.innerHeight - 8) top = Math.max(topLimit, window.innerHeight - th - 8);
    var left = Math.max(8, Math.min(window.innerWidth - tw - 8, ref.left + ref.width / 2 - tw / 2));
    t.style.left = Math.round(left) + 'px';
    t.style.top = Math.round(top) + 'px';
    t.style.visibility = '';
  }

  function showToolbar(range, existing) {
    var t = ensureToolbar();
    var dots = t.querySelectorAll('.rdr-ann-dot');
    for (var i = 0; i < dots.length; i++) {
      var cur = !!existing && dots[i].getAttribute('data-color') === existing.a.color;
      dots[i].classList.toggle('is-current', cur);
      dots[i].setAttribute('aria-pressed', cur ? 'true' : 'false');
    }
    t.querySelector('.rdr-ann-del').hidden = !existing;
    placeToolbar(range);
  }

  function clearSelection() {
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }

  function evalSelection(fromPointer) {
    if (!S.body || !document.contains(S.body)) return;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) { hideToolbar(); return; }
    var range = sel.getRangeAt(0);
    if (!range.intersectsNode(S.body)) { hideToolbar(); return; }   // 与正文无交集：不出工具条
    var r = anchorFromRange(getModel(), range);
    if (!r || r.error) {
      hideToolbar();
      if (r && r.error === 'long' && fromPointer) toast('选区过长（最多 ' + MAX_QUOTE + ' 字）');
      return;
    }
    var existing = null;                                   // 区间与已有高亮完全相同：改为换色/删除（§4.4）
    for (var i = 0; i < S.placed.length; i++) {
      var p = S.placed[i];
      if (p.status === 'exact' && p.s === r.s && p.e === r.e) { existing = p; break; }
    }
    S.pending = { r: r, existing: existing };
    showToolbar(range, existing);
  }

  function onSelectionChange() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) { hideToolbar(); return; }
    if (S.pointerDown && S.pointerType === 'mouse') return;   // 鼠标拖选中：等 pointerup
    clearTimeout(S.selTimer);
    S.selTimer = setTimeout(function () { evalSelection(false); }, SELECT_DEBOUNCE);
  }

  function onKeyUp(e) {
    if (!S.body) return;
    if (e.key === 'Escape') { hideToolbar(); return; }
    if (e.shiftKey || /^(Arrow|Home$|End$|Page)/.test(e.key || '')) {     // Shift+方向键扩选
      clearTimeout(S.selTimer);
      S.selTimer = setTimeout(function () { evalSelection(false); }, SELECT_DEBOUNCE);
    }
  }

  /* 点高亮：P2 里选中整条高亮，工具条随即出现（换色/删除）。
     TODO(§7-P3)：改为打开笔记浮层 #rdr-hl-pop（§6.6），本函数届时让位。 */
  function onContentClick(e) {
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    var t = e.target;
    if (!t || !t.closest || t.closest('a[href]')) return;       // 链接照常跳转
    var mark = t.closest('mark.rdr-hl');
    if (!mark) return;
    var ms = marksOf(mark.getAttribute('data-hl-id'));
    if (!ms.length) return;
    var range = document.createRange();
    range.setStartBefore(ms[0]);
    range.setEndAfter(ms[ms.length - 1]);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function wireSelection() {
    if (S.wired) return;
    S.wired = true;
    var content = document.getElementById('rdr-content'), main = document.getElementById('rdr-main');
    if (content) {
      content.addEventListener('pointerdown', function (e) {
        S.pointerDown = true; S.pointerType = e.pointerType || 'mouse';
        hideToolbar();
      });
      content.addEventListener('click', onContentClick);
    }
    document.addEventListener('pointerup', function (e) {
      if (!S.pointerDown) return;
      S.pointerDown = false;
      S.pointerType = e.pointerType || S.pointerType;
      setTimeout(function () { evalSelection(true); }, 0);   // 等浏览器定稿选区
    });
    document.addEventListener('pointercancel', function () { S.pointerDown = false; });
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keyup', onKeyUp);
    if (main) main.addEventListener('scroll', hideToolbar);    // 滚动或缩放时隐藏（§6.4）
    window.addEventListener('resize', hideToolbar);
  }

  /* ── 8. 工具条动作：创建 / 换色 / 删除 ─────────────────────────────────── */

  function onToolbarClick(e) {
    var btn = e.target.closest ? e.target.closest('button') : null;
    if (!btn || !S.pending) return;
    var color = btn.getAttribute('data-color');
    if (color) commitColor(color);
    else if (btn.getAttribute('data-act') === 'delete') removeExisting();
  }

  function commitColor(color) {
    var p = S.pending;
    S.pending = null;
    clearSelection();
    hideToolbar();
    if (!p) return;
    if (p.existing) { recolor(p.existing.a, color); return; }
    var iso = nowISO();
    var a = { id: uuid(), book: S.bookId, chapter: S.chapter.id, color: color, quote: p.r.quote, note: '',
      anchor: p.r.anchor, created_at: iso, updated_at: iso };
    if (loggedIn()) {                                      // 乐观渲染，随后 PUT
      S.server.push(a);
      render();
      syncPut(a).catch(warn);
    } else {                                               // 访客：存草稿 → 虚线渲染 → 登录引导（§6.8）
      a.draft = true;
      saveGuestItem(a);
      render();
      openLogin();
    }
  }

  function recolor(a, color) {
    if (a.color === color) return;
    a.color = color;
    a.updated_at = nowISO();
    setMarkColor(a.id, color);
    if (a.draft) saveGuestItem(a);                         // 保留 note，只改色
    else syncPut(a).catch(warn);
  }

  // TODO(§7-P3)：本地先移除并弹出"已删除 · 撤销"5s，到期后才真正 DELETE
  function removeExisting() {
    var p = S.pending;
    S.pending = null;
    clearSelection();
    hideToolbar();
    if (!p || !p.existing) return;
    var a = p.existing.a;
    if (a.draft) { removeGuest(a.id); render(); return; }
    S.server = S.server.filter(function (x) { return x.id !== a.id; });
    render();
    syncDelete(a);
  }

  /* ── 9. 入口 ───────────────────────────────────────────────────────── */

  // "我的笔记"入口占位：按钮在 reader.html 中默认 hidden。TODO(§7-P3)：实现面板后取消 hidden
  function bindNotesBtn() {
    var btn = document.getElementById('rdr-notes-btn');
    if (!btn || btn.getAttribute('data-bound')) return;
    btn.setAttribute('data-bound', '1');
    btn.addEventListener('click', function () { api.openPanel(); });
  }

  var api = window.ReaderAnnotations = {
    // opts: { bookId, chapter|null, manifest, body|null, onRendered }；封面传 chapter:null, body:null
    mount: function (opts) {
      try {
        opts = opts || {};
        S.bookId = opts.bookId || null;
        S.chapter = opts.chapter || null;
        S.manifest = opts.manifest || null;               // TODO(§7-P3)：全书面板按 manifest 顺序分章
        S.body = opts.body || null;
        S.onRendered = typeof opts.onRendered === 'function' ? opts.onRendered : null;
        S.server = []; S.model = null; S.placed = []; S.rendered = false;
        bindAuth();
        bindNotesBtn();
        if (!S.body || !S.chapter) return Promise.resolve();   // 封面：只留全书面板入口（P3）
        wireSelection();
        return refresh();
      } catch (e) { warn(e); return Promise.resolve(); }   // 故障隔离：绝不让阅读器的 renderChapter 因此进入错误页
    },
    refresh: refresh,
    openPanel: function () { /* TODO(§7-P3)：笔记面板（本章 / 全书 / 草稿） */ },
    closePanel: function () { /* TODO(§7-P3) */ },
    _internal: { buildModel: buildModel, anchorFromRange: anchorFromRange, resolveAnchor: resolveAnchor,
      applyMarks: applyMarks, clearMarks: clearMarks, cyrb53: cyrb53 }    // 仅测试用（同 ReaderAuth._emitLogout 先例）
  };
})();
