/**
 * reader-annotations.js — 阅读器正文高亮 + 笔记（P2 高亮核心 + P3 笔记/面板/深链/离线队列）。
 * 经典脚本，暴露全局 ReaderAnnotations（与 reader-auth.js 同模式）。
 * 设计：docs/superpowers/specs/2026-10-03-reader-highlight-annotations-design.md
 *
 * P2：文本模型 / 块坐标锚点 / L1 解析（失败一律孤儿：不渲染、不删除）/ 幂等渲染 / 选区工具条 /
 *   换色与删除 / 访客草稿 + 登录引导。
 * P3（§7-P3）：点高亮弹出笔记浮层（编辑笔记/改色/删除/定位信息，自动保存）/ "我的笔记"面板
 *   （本章·全书·草稿，孤儿展示与清理，点击定位）/ #hl-<id> 深链 / 离线队列 rdr_ann_pending_<uid>
 *   （失败重试，401 与网络失败都不丢内容）/ 删除 5s 撤销。
 * P4（§3.5–3.7、§7-P4）：漂移恢复 L2 小节内 / L3 全章 / L4 首尾模糊 / L5 孤儿，四态判定
 *   exact（命中）· moved（位移，自动重锚）· fuzzy（虚线 + 面板"待确认"，不自动保存）· orphan（面板"无法定位"）；
 *   moved / rev 变化的 exact 在候选唯一或 ctx ≥ 1.5 时后台自愈（更新 anchor 并 PUT，走离线队列）；
 *   面板"待确认"可"确认新位置"，"无法定位"可"重新定位"（在正文选一段新文字挂上去，PUT 同一 id）。
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
  var PENDING_PREFIX = 'rdr_ann_pending_';   // + userId：离线队列（§6.9）
  var CTX_LEN = 32;            // prefix / suffix 长度
  var MAX_QUOTE = 5000;        // 与后端一致
  var MIN_QUOTE = 2;           // §3.4：建议至少 2 个字
  var HEADING_TEXT_MAX = 200;  // anchor 总长 ≤ 4096 字节
  var FUZZY_MIN = 16;          // §3.5 L4：quote 至少 16 字才做首尾模糊
  var FUZZY_K = 12;            // L4 首尾锚长度上限：k = min(12, ⌊|q|/3⌋)
  var SPAN_LO = 0.6, SPAN_HI = 1.5;   // L4 配对跨度相对 |q| 的范围
  var HEAL_CTX = 1.5;          // §3.7：候选不唯一时，ctx ≥ 1.5 才敢自愈回写
  var SELECT_DEBOUNCE = 150;   // selectionchange 防抖（移动端拖选择柄）
  var SAVE_DEBOUNCE = 800;     // 笔记输入防抖（§6.6）
  var UNDO_MS = 5000;          // 删除撤销窗口（§6.6）
  var BACKOFF = [5000, 15000, 45000, 120000];   // 5xx / 网络失败后的重试间隔

  var S = {
    bookId: null, chapter: null, manifest: null, body: null, onRendered: null,
    server: [],        // 登录态下本章注解（GET 结果 + 本地新建/未同步）
    placed: [],        // 最近一次渲染的解析结果 [{ a, status, s, e }]
    model: null,       // 懒缓存的 TextModel；任何 DOM 变更（applyMarks）后置空
    seq: 0,            // refresh 序号：只让最后一次生效
    rendered: false,
    pending: null,     // 工具条当前选区 { r, existing }
    pointerDown: false, pointerType: 'mouse',
    wired: false, authBound: false, globalWired: false, loginBusy: false,
    toolbar: null, toastEl: null, toastTimer: 0, selTimer: 0,
    // 同步（§6.9）
    uid: null, uidTok: null,            // 当前用户 id 及其对应的 token（换号时重算）
    flushing: null, flushAgain: false, flushTimer: 0, retryTimer: 0, retryN: 0,
    failed: false, failToast: false, authPrompted: false,
    undo: [],          // 撤销窗口内的删除批次 [{ items, uid, timer }]
    // 笔记浮层（§6.6）
    pop: null, popId: null, popSeg: 0, popLine: 0, placeRaf: 0, afterLoginOpen: null,
    // "我的笔记"面板（§6.7）
    panel: null, scrim: null, panelOpen: false, panelTab: 'chapter',
    bookList: null, bookState: 'idle',  // 全书列表；idle | loading | ready | error
    // 孤儿"重新定位"（§3.7）：{ id } 表示正等用户在正文里选一段新文字
    reloc: null, relocBar: null
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
    return anchorAt(M, s, e);
  }

  // 全章区间 [s, e) → { s, e, quote, anchor }（选区建锚与 P4 自愈/确认新位置共用；调用方保证 0 ≤ s < e ≤ M.len）
  function anchorAt(M, s, e) {
    var T = M.text;
    var bs = blockAt(M, s), be = blockAt(M, e - 1), sb = M.blocks[bs], eb = M.blocks[be];
    var head = { id: '', text: '', tag: '' };
    for (var i = bs; i >= 0; i--) {                      // 起点所在块或其之前最近的 heading（L2 以 tag+text 比对）
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

  // T 中 q 的全部出现位置（升序，可重叠）；限定 [from, to) 内整段落入；cap > 0 时最多取 cap 个（只想知道"是否唯一"时传 2）
  function findAll(T, q, from, to, cap) {
    var out = [], lim = to == null ? T.length : to, i = T.indexOf(q, from || 0);
    while (i >= 0 && i + q.length <= lim) {
      out.push(i);
      if (cap && out.length >= cap) break;
      i = T.indexOf(q, i + 1);
    }
    return out;
  }
  function lowerBound(arr, x) {                          // 升序数组里第一个 ≥ x 的下标
    var lo = 0, hi = arr.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function headLevel(tag) { return parseInt(tag.charAt(1), 10) || 0; }

  // L2 候选：所有与 anchor.heading 同 tag、同文本的小节里 q 的全部出现位置。
  // 小节 = 该 heading 块到下一个同级或更高级 heading 之前；不按 aid 比（aid 含序号，前面插入标题会整体平移）。
  // 必须汇总全部同名小节再统一打分——"命中第一个同名小节就返回"在讨论课件（模板标题大量重复）上会错位（§3.5 仿真）。
  function sectionCands(M, hd, q) {
    var T = M.text, bl = M.blocks, lvl = headLevel(hd.tag), out = [];
    for (var i = 0; i < bl.length; i++) {
      var b = bl[i];
      if (b.tag !== hd.tag || b.text.slice(0, HEADING_TEXT_MAX) !== hd.text) continue;
      var j = i + 1;
      while (j < bl.length && !(HEAD_RE.test(bl[j].tag) && headLevel(bl[j].tag) <= lvl)) j++;
      var end = j < bl.length ? bl[j].start - 1 : T.length;      // -1：不含下一标题前的块间 "\n"
      out = out.concat(findAll(T, q, b.start, end));
    }
    return out;
  }

  /* 逐级恢复（§3.5，命中即停）。返回 { status, lv, s, e, n, ctx, heal }：
       exact   L1 精确（rev+pos 或块坐标，行为与 P2 完全一致）
       moved   L2 同名小节内 / L3 全章：原文逐字还在，只是位置变了——正常渲染并自动重锚
       fuzzy   L4 首尾模糊：原文被改写——虚线渲染，须用户在面板确认，绝不自动保存
       orphan  L5 找不到：不渲染、不删除，宁缺勿错
     n = 该级候选数；heal = 是否应后台回写新 anchor（§3.7：存的 rev/pos 已失效，且候选唯一或 ctx ≥ 1.5）。 */
  function resolveAnchor(anchor, quote, M) {
    var T = M.text, orphan = { status: 'orphan', lv: 5, s: -1, e: -1, n: 0, ctx: 0, heal: false };
    if (!anchor || anchor.v !== 1 || typeof quote !== 'string' || !quote) return orphan;
    var q = quote, L = q.length, prefix = String(anchor.prefix || ''), suffix = String(anchor.suffix || '');
    var s, e, c, l1 = null;

    // L1：rev 相同用 pos；否则用块坐标（并要求 ctx ≥ 1.0）；两者都要求原文与 quote 完全一致
    if (anchor.rev === M.rev && anchor.pos && isInt(anchor.pos.start) && isInt(anchor.pos.end)) {
      s = anchor.pos.start; e = anchor.pos.end;
      if (e - s === L && e <= T.length && T.substr(s, L) === q) l1 = { s: s, e: e, fresh: true };
    }
    var st = anchor.start, en = anchor.end;
    if (!l1 && st && en && isInt(st.block) && isInt(st.offset) && isInt(en.block) && isInt(en.offset)) {
      var sb = M.blocks[st.block], eb = M.blocks[en.block];
      if (sb && eb && st.offset <= sb.len && en.offset <= eb.len) {
        s = sb.start + st.offset; e = eb.start + en.offset;
        if (e > s && T.slice(s, e) === q && ctxScore(T, s, e, prefix, suffix) >= 1.0) l1 = { s: s, e: e, fresh: false };
      }
    }
    if (l1) {
      c = ctxScore(T, l1.s, l1.e, prefix, suffix);
      var n1 = l1.fresh ? 1 : findAll(T, q, 0, null, 2).length;   // 存的 rev/pos 已失效才需要数候选
      return { status: 'exact', lv: 1, s: l1.s, e: l1.e, n: n1, ctx: c, heal: !l1.fresh && (n1 === 1 || c >= HEAL_CTX) };
    }

    // 期望位置 E = pos.start × 新长度 / 旧长度；score(s) = ctx − 0.5 × |s − E| / |T|
    var E = null;
    if (anchor.pos && isInt(anchor.pos.start)) E = anchor.pos.start * (isInt(anchor.len) && anchor.len > 0 ? M.len / anchor.len : 1);
    function scoreAt(from, len) {
      return ctxScore(T, from, from + len, prefix, suffix) - (E == null ? 0 : 0.5 * Math.abs(from - E) / Math.max(1, T.length));
    }
    function moved(lv, cands) {
      var bs = cands[0], bsc = scoreAt(bs, L);
      for (var i = 1; i < cands.length; i++) {
        var sc = scoreAt(cands[i], L);
        if (sc > bsc) { bs = cands[i]; bsc = sc; }
      }
      var cx = ctxScore(T, bs, bs + L, prefix, suffix);
      return { status: 'moved', lv: lv, s: bs, e: bs + L, n: cands.length, ctx: cx, heal: cands.length === 1 || cx >= HEAL_CTX };
    }

    // L2：同名小节内
    var hd = anchor.heading, cands = [];
    if (hd && typeof hd.tag === 'string' && HEAD_RE.test(hd.tag) && typeof hd.text === 'string' && hd.text) {
      cands = sectionCands(M, hd, q);
      if (cands.length) return moved(2, cands);
    }
    // L3：全章
    cands = findAll(T, q);
    if (cands.length) return moved(3, cands);

    // L4：首尾模糊——取 q 的头 k 字与尾 k 字分别找出现位置，尾在头之后且跨度在 [0.6, 1.5] × |q| 内才配对，
    // 按 ctx − |跨度 − |q|| / |q| 取最高者
    if (L >= FUZZY_MIN) {
      var k = Math.min(FUZZY_K, Math.floor(L / 3));
      var H = findAll(T, q.slice(0, k)), Z = H.length ? findAll(T, q.slice(L - k)) : [], best = null, pairs = 0;
      H.forEach(function (h) {
        for (var i = lowerBound(Z, h + Math.floor(SPAN_LO * L) - k); i < Z.length; i++) {   // Z 升序：跨度越过上限即可停
          var end = Z[i] + k, span = end - h;
          if (span > SPAN_HI * L) break;
          if (span < SPAN_LO * L) continue;
          pairs++;
          var cx = ctxScore(T, h, end, prefix, suffix), sc = cx - Math.abs(span - L) / L;
          if (!best || sc > best.sc) best = { s: h, e: end, sc: sc, ctx: cx };
        }
      });
      if (best) return { status: 'fuzzy', lv: 4, s: best.s, e: best.e, n: pairs, ctx: best.ctx, heal: false };
    }
    return orphan;                                         // L5
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

  function makeMark(a, status) {
    var m = document.createElement('mark');
    m.className = 'rdr-hl rdr-hl-' + colorOf(a) + ((a.draft || a.unsynced) ? ' rdr-hl-draft' : '') +
      (status === 'fuzzy' ? ' rdr-hl-fuzzy' : '');         // fuzzy：虚线下划线（原文已修订，待确认）
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
        var a = cover[j].rec.a, m = makeMark(a, cover[j].rec.status);
        inner.parentNode.insertBefore(m, inner);
        m.appendChild(inner);
        inner = m;
        if (!firstMark[a.id]) firstMark[a.id] = m;
        lastMark[a.id] = m;
      }
    }
  }

  // 清旧 → 建模 → 解析 → 渲染。返回 [{ a, status, s, e, lv, n, ctx, heal, newQuote? }]（含 orphan，供面板使用）
  // exact / moved 正常渲染；fuzzy 渲染为虚线（newQuote = 正文里现在的对应文字）；orphan 不渲染
  function applyMarks(body, items) {
    clearMarks(body);
    if (!items.length) return [];                        // 无高亮：不必建模，页面与未登录基线完全一致
    var M = buildModel(body), placed = [], active = [];
    items.forEach(function (a) {
      if (!a || !ID_RE.test(a.id)) return;
      var r = resolveAnchor(a.anchor, a.quote, M);
      var rec = { a: a, status: r.status, s: r.s, e: r.e, lv: r.lv, n: r.n, ctx: r.ctx, heal: r.heal };
      if (r.status === 'fuzzy') rec.newQuote = M.text.slice(r.s, r.e);
      placed.push(rec);
      if (r.status !== 'orphan') active.push(rec);
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
      if (f) f.id = 'hl-' + id;                          // §3.8：#hl-<id> 深链 id；与 aid 形态 ^h\d+ 不冲突
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

  /* ── 4. Store：访客草稿（rdr_ann_guest）+ 服务端 API + 离线队列（§5、§6.8、§6.9）──── */

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
  function bookDrafts() {                                 // 当前书的访客草稿（面板"草稿"页签）
    return readGuest().filter(function (d) { return d.book === S.bookId; });
  }

  function fromServer(x) {
    if (!x || !ID_RE.test(x.id)) return null;
    var anchor = x.anchor;
    if (typeof anchor === 'string') { try { anchor = JSON.parse(anchor); } catch (e) { anchor = null; } }
    return { id: x.id, book: x.book_id, chapter: x.chapter_id, color: x.color, quote: x.quote, note: x.note || '',
      anchor: anchor, created_at: x.created_at || '', updated_at: x.updated_at || '' };
  }

  /* 用户 id：JWT payload.sub（signin.js 签发）。同步解码，所以离线时也能给队列分区；
     非 JWT（本地 mock 等）退回 ReaderAuth.getProfile().user.id（注意是 .user.id，见 §6.9）。 */
  function jwtSub(token) {
    try {
      var p = String(token).split('.')[1];
      if (!p) return null;
      p = p.replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      var payload = JSON.parse(atob(p));
      return payload && typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
    } catch (e) { return null; }
  }
  function uidNow() {
    var A = auth();
    if (!A || !A.isLoggedIn()) return null;
    var tok = A.getToken();
    if (S.uid && S.uidTok === tok) return S.uid;
    var sub = jwtSub(tok);
    if (sub) { S.uid = sub; S.uidTok = tok; }
    return sub;
  }
  function resolveUid() {
    var u = uidNow();
    if (u || !loggedIn()) return Promise.resolve(u);
    var A = auth(), tok = A.getToken();
    return A.getProfile().then(function (p) {
      var id = p && p.user && p.user.id ? String(p.user.id) : null;
      if (id && A.getToken() === tok) { S.uid = id; S.uidTok = tok; }
      return id;
    }, function () { return null; });
  }

  /* 离线队列：localStorage.rdr_ann_pending_<uid> = { [id]: { op:'put'|'delete', book, chapter, ts, created?, body? } }
     按 id 折叠：同一 id 多次编辑只留最新，delete 覆盖 put。ts 单调递增，用来判断"发送期间是否又有新编辑"。 */
  function qKey(uid) { return PENDING_PREFIX + uid; }
  function qRead(uid) {
    var out = {};
    try {
      var v = JSON.parse(localStorage.getItem(qKey(uid)) || '{}');
      if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
      Object.keys(v).forEach(function (id) {
        var e = v[id];
        if (ID_RE.test(id) && e && (e.op === 'put' || e.op === 'delete') && typeof e.book === 'string' &&
            typeof e.chapter === 'string' && (e.op === 'delete' || (e.body && typeof e.body === 'object'))) out[id] = e;
      });
    } catch (e) { /* 损坏的队列当空处理 */ }
    return out;
  }
  function qWrite(uid, q) {
    try {
      if (Object.keys(q).length) localStorage.setItem(qKey(uid), JSON.stringify(q));
      else localStorage.removeItem(qKey(uid));
      return true;
    } catch (e) { return false; }
  }
  var lastTs = 0;
  function tick() { lastTs = Math.max(Date.now(), lastTs + 1); return lastTs; }
  function qSet(uid, id, entry) {
    var q = qRead(uid);
    q[id] = entry;
    return qWrite(uid, q);
  }
  function qDone(uid, id, sent) {                         // 仅当发送期间没有更新的本地编辑才出队；否则留给下一轮
    var q = qRead(uid), cur = q[id];
    if (cur && cur.ts === sent.ts) { delete q[id]; qWrite(uid, q); }
    else if (cur) S.flushAgain = true;
  }

  function enqueuePut(a) {
    var uid = uidNow();
    if (!uid) return false;
    return qSet(uid, a.id, { op: 'put', book: a.book, chapter: a.chapter, ts: tick(), created: a.created_at,
      body: { book: a.book, chapter: a.chapter, color: a.color, quote: a.quote, note: a.note || '', anchor: a.anchor } });
  }

  // 渲染合并（§6.9）：服务端列表 + 范围内的队列项（put 覆盖或插入，delete 移除）；撤销窗口内已删除的不再放回
  function mergeQueue(list, inScope) {
    var uid = uidNow(), q = uid ? qRead(uid) : {}, byId = {}, out = [];
    list.forEach(function (a) {
      if (isPendingDelete(a.id) || byId[a.id]) return;
      byId[a.id] = a; out.push(a);
    });
    Object.keys(q).forEach(function (id) {
      var e = q[id];
      if (!inScope(e) || isPendingDelete(id)) return;
      if (e.op === 'delete') {
        if (byId[id]) { out.splice(out.indexOf(byId[id]), 1); delete byId[id]; }
        return;
      }
      var b = e.body, cur = byId[id], iso = new Date(e.ts).toISOString();
      if (!cur) { cur = byId[id] = { id: id, book: e.book, chapter: e.chapter, created_at: e.created || iso }; out.push(cur); }
      cur.color = b.color; cur.quote = b.quote; cur.note = b.note || ''; cur.anchor = b.anchor;
      cur.updated_at = iso; cur.unsynced = true;
    });
    return out;
  }
  function inChapterScope(e) { return !!S.chapter && e.book === S.bookId && e.chapter === S.chapter.id; }
  function inBookScope(e) { return e.book === S.bookId; }

  var NET_TIMEOUT = 15000;
  function fetchT(url, opts) {                            // 带超时的 fetch：挂死的请求不能卡住队列
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = 0;
    if (ctl) { opts.signal = ctl.signal; timer = setTimeout(function () { ctl.abort(); }, NET_TIMEOUT); }
    return fetch(url, opts).then(function (res) { clearTimeout(timer); return res; },
      function (err) { clearTimeout(timer); throw err; });
  }

  // 拉注解：带 chapterId 为本章，否则全书；任何异常（未部署的 HTML、非 2xx、网络）一律返回 null
  function fetchList(chapterId) {
    var A = auth();
    if (!A || !A.isLoggedIn() || !S.bookId) return Promise.resolve(null);
    var url = API + '?book=' + encodeURIComponent(S.bookId) + (chapterId ? '&chapter=' + encodeURIComponent(chapterId) : '');
    return fetchT(url, { headers: { Authorization: 'Bearer ' + A.getToken() } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (d) {
        if (!d || !d.success || !Array.isArray(d.annotations)) return null;
        return d.annotations.map(fromServer).filter(Boolean);
      })
      .catch(function () { return null; });
  }

  // 返回 { status, data, retryAfter }；网络错误 status=0，非 JSON 体 data=null
  function send(method, id, body) {
    var A = auth(), headers = { Authorization: 'Bearer ' + (A ? A.getToken() : '') };
    if (body) headers['Content-Type'] = 'application/json';
    return fetchT(API + '/' + id, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (res) {
        var ra = parseInt(res.headers.get('Retry-After') || '', 10) || 0;
        return res.json().then(function (data) { return { status: res.status, data: data, retryAfter: ra }; },
          function () { return { status: res.status, data: null, retryAfter: ra }; });
      }, function () { return { status: 0, data: null, retryAfter: 0 }; });
  }

  function eachItem(id, fn) {
    S.server.forEach(function (a) { if (a.id === id) fn(a); });
    if (S.bookList) S.bookList.forEach(function (a) { if (a.id === id) fn(a); });
  }
  function markSynced(id, ann) {
    S.failed = false; S.failToast = false; S.retryN = 0;
    eachItem(id, function (a) {
      a.unsynced = false;
      if (ann && ann.updated_at) a.updated_at = ann.updated_at;
    });
    setMarkDraft(id, false);
  }
  function flagQueued() {                                  // 同步失败：队列里的 put 都标成"未同步"（虚线）
    var uid = uidNow(), q = uid ? qRead(uid) : {};
    S.server.forEach(function (a) {
      if (q[a.id] && q[a.id].op === 'put' && !a.unsynced) { a.unsynced = true; setMarkDraft(a.id, true); }
    });
  }
  function dropLocal(id) {                                 // 服务端判定该条无效/已删：从本地彻底移除
    S.server = S.server.filter(function (x) { return x.id !== id; });
    if (S.bookList) S.bookList = S.bookList.filter(function (x) { return x.id !== id; });
    removeGuest(id);
    if (S.popId === id) closePop(true);
    render();
  }

  // §5.5 失败分流：401 保留队列并引导登录；429 / 5xx / 非 JSON / 网络错误保留队列并退避重试
  function failAuth() {
    S.failed = true;
    clearTimeout(S.retryTimer);
    flagQueued();
    if (!S.authPrompted) {                                 // 每次会话只弹一次，避免重试期间反复弹窗
      S.authPrompted = true;
      toast('登录已过期，标注已存本地；请重新登录后同步');
      if (!S.loginBusy) openLogin();
    }
    return 'stop';
  }
  function failBusy(retryAfter) {
    S.failed = true;
    flagQueued();
    scheduleRetry(Math.max(1, retryAfter || 60) * 1000);
    if (!S.failToast) { S.failToast = true; toast('操作过于频繁，已存本地，稍后自动同步'); }
    return 'stop';
  }
  function failDown() {
    S.failed = true;
    flagQueued();
    scheduleRetry(BACKOFF[Math.min(S.retryN++, BACKOFF.length - 1)]);
    if (!S.failToast) {
      S.failToast = true;
      toast(navigator.onLine === false ? '当前离线，标注已存本地，联网后自动同步' : '服务暂不可用，标注已存本地，稍后自动重试');
    }
    return 'stop';
  }
  function scheduleRetry(ms) {
    clearTimeout(S.retryTimer);
    S.retryTimer = setTimeout(function () { S.retryTimer = 0; flush(); }, ms);
  }

  // 处理队列里的一项。返回 'ok'（继续下一项）或 'stop'（本轮中止，已安排重试/等待登录）
  function flushOne(uid, id, retried) {
    var e = qRead(uid)[id];
    if (!e) return Promise.resolve('ok');
    var put = e.op === 'put';
    return (put ? send('PUT', id, e.body) : send('DELETE', id)).then(function (r) {
      var json = r.data && typeof r.data === 'object';     // 非 JSON：路由未部署 / 代理异常，一律当"服务暂不可用"，绝不当未登录
      if (!json) return failDown();
      if (put && r.status === 409 && !retried) return flushOne(uid, id, true);
      if (r.status === 401) return failAuth();
      if (r.status === 429) return failBusy(r.retryAfter);
      if (put && (r.status === 200 || r.status === 201) && r.data.success) {
        qDone(uid, id, e); markSynced(id, r.data.annotation); return 'ok';
      }
      if (!put && (r.status === 200 || r.status === 404)) {   // 404 视为已完成（§5.5）
        qDone(uid, id, e); markSynced(id); return 'ok';
      }
      if (r.status >= 500 || r.status === 409) return failDown();
      // 其余 4xx：客户端侧无法靠重试恢复，出队并按 §5.5 处理本地
      qDone(uid, id, e);
      if (!put) return 'ok';
      if (r.status === 403) toast('标注数量已达上限，未保存');
      else if (r.status === 404) toast('这条标注已无法同步，已移除');
      else if (r.status === 400) { warn('PUT 400: ' + r.data.error); toast('标注格式有误，未能保存'); }
      dropLocal(id);                                       // 404 / 410（已在别处删除）/ 400 / 403
      return 'ok';
    });
  }

  // 顺序发送队列（最近修改的先发）；同一时刻只跑一轮，期间的新请求折叠为"再跑一轮"
  function flush() {
    if (S.flushing) { S.flushAgain = true; return S.flushing; }
    clearTimeout(S.flushTimer); S.flushTimer = 0;
    if (!loggedIn()) return Promise.resolve();
    var p = resolveUid().then(function (uid) {
      if (!uid) return null;
      var q = qRead(uid), chain = Promise.resolve('ok');
      Object.keys(q).sort(function (x, y) { return q[y].ts - q[x].ts; }).forEach(function (id) {
        chain = chain.then(function (prev) { return prev === 'ok' ? flushOne(uid, id) : prev; });
      });
      return chain;
    }).catch(warn).then(function () {
      S.flushing = null;
      updatePopStatus();
      renderPanel();
      if (S.flushAgain) { S.flushAgain = false; if (!S.failed) return flush(); }
    });
    S.flushing = p;
    return p;
  }
  function scheduleFlush(ms) {
    clearTimeout(S.flushTimer);
    if (!ms) { S.flushTimer = 0; flush(); return; }
    S.flushTimer = setTimeout(function () { S.flushTimer = 0; flush(); }, ms);
  }
  function flushNow() { if (S.flushTimer) scheduleFlush(0); }

  // 本地变更的统一落点：登录态先写队列（刷新也不丢）再按 delay 发出；访客写草稿。
  // 账号 id 暂未确认（非 JWT 令牌且资料接口当时不可用）时先去解析，仍不行才退化为"仅存本页"
  function persist(a, delay) {
    if (a.draft) { saveGuestItem(a); return; }
    if (uidNow()) { enqueueAndFlush(a, delay); return; }
    resolveUid().then(function (uid) {
      if (uid) { enqueueAndFlush(a, delay); return; }
      a.unsynced = true; setMarkDraft(a.id, true);
      toast('服务暂不可用，这条标注暂时只保存在本页');
    });
  }
  function enqueueAndFlush(a, delay) {
    if (!enqueuePut(a)) {                                  // localStorage 写不进去（配额/隐私模式）
      a.unsynced = true; setMarkDraft(a.id, true);
      toast('无法写入本地存储，这条标注暂时只保存在本页');
      return;
    }
    scheduleFlush(delay || 0);
    updatePopStatus();
  }

  // 访客草稿 → 当前账号队列（§6.8.3）；返回转入条数。写入队列成功才从访客存储移除
  function adoptDrafts(drafts) {
    var n = 0;
    drafts.forEach(function (d) {
      if (enqueuePut(draftToItem(d))) { removeGuest(d.id); n++; }
    });
    return n;
  }

  /* ── 删除与撤销（§6.6）：本地立即移除并提示 5s，到期才入队 DELETE ──────────────── */

  function isPendingDelete(id) {
    for (var i = 0; i < S.undo.length; i++) {
      for (var k = 0; k < S.undo[i].items.length; k++) if (S.undo[i].items[k].id === id) return true;
    }
    return false;
  }

  function removeItems(list) {
    if (!list.length) return;
    var batch = { items: list, uid: uidNow(), timer: 0 };
    list.forEach(function (a) {
      if (a.draft) removeGuest(a.id);
      S.server = S.server.filter(function (x) { return x.id !== a.id; });
      if (S.bookList) S.bookList = S.bookList.filter(function (x) { return x.id !== a.id; });
      if (S.popId === a.id) closePop(true);
    });
    S.undo.push(batch);
    batch.timer = setTimeout(function () { commitUndo(batch); }, UNDO_MS);
    render();
    toast(list.length > 1 ? '已删除 ' + list.length + ' 条' : '已删除', [
      { label: '撤销', run: function () { undoBatch(batch); } }
    ], UNDO_MS);
  }

  function commitUndo(batch) {
    var i = S.undo.indexOf(batch);
    if (i < 0) return;
    S.undo.splice(i, 1);
    clearTimeout(batch.timer);
    var queued = false;
    batch.items.forEach(function (a) {
      if (a.draft || !batch.uid) return;                   // 访客草稿从未上传，无需 DELETE
      if (qSet(batch.uid, a.id, { op: 'delete', book: a.book, chapter: a.chapter, ts: tick() })) queued = true;
    });
    if (queued) scheduleFlush(0);
  }
  function commitAllUndo() { S.undo.slice().forEach(commitUndo); }

  function undoBatch(batch) {
    var i = S.undo.indexOf(batch);
    if (i < 0) return;                                     // 已过期入队
    S.undo.splice(i, 1);
    clearTimeout(batch.timer);
    batch.items.forEach(function (a) {
      if (a.draft) { saveGuestItem(a); return; }
      if (isCurrentChapter(a)) S.server.push(a);
      if (S.bookList) S.bookList.push(a);
    });
    render();
  }

  function isCurrentChapter(a) { return !!S.chapter && a.book === S.bookId && a.chapter === S.chapter.id; }

  /* ── 5. 渲染编排与 refresh ───────────────────────────────────────────── */

  function allItems() {
    var seen = {}, out = [];
    S.server.forEach(function (a) { seen[a.id] = 1; out.push(a); });
    readGuest().forEach(function (d) { if (isCurrent(d) && !seen[d.id]) out.push(draftToItem(d)); });
    return out;
  }

  function render() {
    if (S.body && document.contains(S.body)) {
      S.placed = applyMarks(S.body, allItems());
      S.model = null;
      hideToolbar();
      syncPop();
    }
    renderPanel();
  }

  /* 自愈（§3.7）：resolveAnchor 判定 heal 的条目（moved，或存的 rev/pos 已失效的 exact，且候选唯一或 ctx ≥ 1.5），
     用新模型重建 anchor（quote 不变）。登录态入队 PUT——失败留在离线队列里重试；访客草稿只更新本地存储。
     后台动作，用户没改任何东西，所以不弹 toast。 */
  function healPlaced() {
    var todo = S.placed.filter(function (r) { return r.heal; });
    if (!todo.length) return;
    var M = getModel(), queued = false;
    todo.forEach(function (rec) {
      var a = rec.a;
      rec.heal = false;
      a.anchor = anchorAt(M, rec.s, rec.e).anchor;
      if (a.draft) { saveGuestItem(a); return; }
      var uid = uidNow();
      if (uid) { if (enqueuePut(a)) queued = true; return; }
      if (loggedIn()) {                                    // 账号 id 暂未确认：确认后再入队，仍不行就等下次加载再愈
        resolveUid().then(function (u) { if (u && enqueuePut(a)) scheduleFlush(0); });
      }
    });
    if (queued) scheduleFlush(0);
  }

  /* 登录/登出后：等在途 flush → 重拉 → 合并本章队列与访客草稿 → 重渲染 → 自愈漂移的锚点。
     幂等：每次都从 clearMarks 开始，连调 N 次 innerHTML 不变。 */
  function refresh() {
    if (!S.body || !S.chapter) return Promise.resolve();
    var seq = ++S.seq;
    return (S.flushing || Promise.resolve()).then(resolveUid).then(function () {
      return fetchList(S.chapter.id);
    }).then(function (list) {
      if (seq !== S.seq || !S.body || !document.contains(S.body)) return;
      if (list) {                                          // 拉取失败（null）则保留现有内存状态
        var carry = S.server.filter(function (x) {         // 无队列可依托的未同步项（账号未确认时）
          return x.unsynced && !list.some(function (l) { return l.id === x.id; });
        });
        S.server = mergeQueue(list.concat(carry), inChapterScope);
      } else if (!loggedIn()) {
        S.server = [];
      } else {
        S.server = mergeQueue(S.server.slice(), inChapterScope);   // 离线刷新：队列里的项照常显示
      }
      render();
      healPlaced();
      if (!S.rendered) {
        S.rendered = true;
        if (loggedIn()) flush();                           // 挂载后 flush 一次（§6.9）
        var h = window.location.hash || '';
        if (/^#hl-/.test(h)) {                             // §3.8：高亮渲染晚于 reader.js 的 0/160/420ms 定位，此处补一次
          var ok = S.onRendered ? S.onRendered() : false;
          if (!ok && !document.getElementById(h.slice(1))) {
            toast(loggedIn() ? '没有找到这条高亮（可能已被删除，或原文已修订）' : '请先登录，再打开这条高亮');
          }
        }
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

  function handleLogin() {
    if (S.loginBusy) return;
    S.loginBusy = true;                                    // 同时抑制在途请求的 401 再弹登录窗
    // 先等在途的 flush 收尾，再重置失败状态：否则它晚到的 401 会把 failed 重新置真，补发被跳过
    (S.flushing || Promise.resolve()).then(resolveUid).then(function () {
      S.authPrompted = false; S.failed = false; S.failToast = false; S.retryN = 0;
      var drafts = readGuest();
      var cur = drafts.filter(isCurrent), others = drafts.filter(function (d) { return !isCurrent(d); });
      if (adoptDrafts(cur) < cur.length) toast('暂时无法确认账号，本地草稿已保留，稍后可在「我的笔记」里同步');
      S.loginBusy = false;
      S.bookList = null;
      var open = S.afterLoginOpen;
      S.afterLoginOpen = null;
      flush();
      return refresh().then(function () {
        if (open && marksOf(open).length) openPop(open);   // 登录前点的是"笔记"：登录后接着写
        if (others.length && !S.panelOpen) {               // 公用电脑防串号：其它章的草稿需用户确认
          toast('将 ' + others.length + ' 条未登录时的标注保存到当前账号？', [
            { label: '保存', run: function () { adoptDrafts(others); flush(); refresh(); } },
            { label: '忽略', run: function () {} }
          ]);
        }
        renderPanel();
      });
    }).catch(function (e) { S.loginBusy = false; warn(e); });
  }

  function handleLogout() {
    commitAllUndo();                                       // 批次里记着各自的 uid，登出后仍可入队
    closePop(true);
    clearTimeout(S.retryTimer); clearTimeout(S.flushTimer); S.flushTimer = 0;
    S.server = []; S.bookList = null; S.bookState = 'idle';
    S.failed = false; S.failToast = false; S.retryN = 0; S.authPrompted = false;
    S.uid = null; S.uidTok = null;
    refresh();
    renderPanel();
  }

  function bindAuth() {
    var A = auth();
    if (S.authBound || !A) return;
    S.authBound = true;
    if (typeof A.onLogin === 'function') A.onLogin(handleLogin);
    if (typeof A.onLogout === 'function') A.onLogout(handleLogout);
  }

  /* ── 7. UI：toast、选区工具条（§6.4）──────────────────────────────────── */

  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(cls, text, label) {
    var b = mk('button', cls, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '';
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  function hideToast() {
    if (S.toastEl) S.toastEl.hidden = true;
    clearTimeout(S.toastTimer);
  }
  function toast(msg, actions, ms) {
    var t = S.toastEl;
    if (!t) {
      t = S.toastEl = document.createElement('div');
      t.id = 'rdr-ann-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = '';
    t.appendChild(mk('span', null, msg));
    (actions || []).forEach(function (act) {
      var b = btn(null, act.label);
      b.addEventListener('click', function () { hideToast(); act.run(); });
      t.appendChild(b);
    });
    t.hidden = false;
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(hideToast, ms || (actions && actions.length ? 15000 : 4500));
  }

  function ensureToolbar() {
    if (S.toolbar) return S.toolbar;
    var t = document.createElement('div');
    t.id = 'rdr-ann-toolbar';
    t.setAttribute('role', 'toolbar');
    t.setAttribute('aria-label', '高亮');
    t.hidden = true;
    COLORS.forEach(function (c) {
      var b = btn('rdr-ann-dot rdr-ann-dot-' + c, '', COLOR_LABEL[c] + '高亮');
      b.setAttribute('data-color', c);
      b.title = COLOR_LABEL[c];
      t.appendChild(b);
    });
    var note = btn('rdr-ann-note', '✎ 笔记', '添加笔记');     // 以 color:'none' 创建并打开笔记浮层；选区即已有高亮时直接打开它
    note.setAttribute('data-act', 'note');
    t.appendChild(note);
    var loc = btn('rdr-ann-loc', '挂到这里', '把这条笔记挂到选中的文字上');   // 仅"重新定位"模式显示（§3.7）
    loc.setAttribute('data-act', 'relocate');
    loc.hidden = true;
    t.appendChild(loc);
    var del = btn('rdr-ann-del', '删除');
    del.setAttribute('data-act', 'delete');
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

  function topLimit() {                                    // 顶栏之下的可用起点
    var bar = document.getElementById('rdr-topbar');
    return (bar ? bar.offsetHeight : 54) + 4;
  }

  function placeToolbar(range) {
    var t = S.toolbar, rects = [], all = range.getClientRects(), i;
    for (i = 0; i < all.length; i++) if (all[i].width > 0 || all[i].height > 0) rects.push(all[i]);
    if (!rects.length) { hideToolbar(); return; }
    t.style.visibility = 'hidden';
    t.hidden = false;
    var first = rects[0], last = rects[rects.length - 1], tw = t.offsetWidth, th = t.offsetHeight;
    var bar = document.getElementById('rdr-topbar'), topLimit = (bar ? bar.offsetHeight : 54) + 4;
    var touch = S.pointerType === 'touch', top, ref = null;
    if (touch) {                                           // 触屏：钉在视口底部居中——iOS 原生选区菜单贴着选区，够不到底部；拇指也顺手
      var vv = window.visualViewport;
      var vb = vv ? (vv.offsetTop + vv.height) : window.innerHeight;
      top = Math.round(vb - th - 14);
    } else {
      top = first.top - th - 8; ref = first;               // 鼠标：首行上方
      if (top < topLimit) { top = last.bottom + 8; ref = last; }   // 会被顶栏挡住：翻到下方
      if (top + th > window.innerHeight - 8) top = Math.max(topLimit, window.innerHeight - th - 8);
    }
    var left = ref
      ? Math.max(8, Math.min(window.innerWidth - tw - 8, ref.left + ref.width / 2 - tw / 2))
      : Math.max(8, (window.innerWidth - tw) / 2);
    t.style.left = Math.round(left) + 'px';
    t.style.top = Math.round(top) + 'px';
    t.style.visibility = '';
  }

  function showToolbar(range, existing) {
    var t = ensureToolbar(), reloc = !!S.reloc;
    var dots = t.querySelectorAll('.rdr-ann-dot');
    for (var i = 0; i < dots.length; i++) {
      var cur = !reloc && !!existing && dots[i].getAttribute('data-color') === existing.a.color;
      dots[i].classList.toggle('is-current', cur);
      dots[i].setAttribute('aria-pressed', cur ? 'true' : 'false');
      dots[i].hidden = reloc;
    }
    t.querySelector('.rdr-ann-note').hidden = reloc;
    t.querySelector('.rdr-ann-del').hidden = reloc || !existing;
    t.querySelector('.rdr-ann-loc').hidden = !reloc;
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
      if ((p.status === 'exact' || p.status === 'moved') && p.s === r.s && p.e === r.e) { existing = p; break; }
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

  // 点高亮 → 打开笔记浮层（§6.6）。选区非空（正在拖选）与链接点击照常放行
  function onContentClick(e) {
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    var t = e.target;
    if (!t || !t.closest || t.closest('a[href]')) return;       // 链接照常跳转
    var mark = t.closest('mark.rdr-hl');
    if (!mark) return;
    var id = mark.getAttribute('data-hl-id');
    if (S.pop && !S.pop.hidden && S.popId === id) { closePop(); return; }   // 再次点同一 mark：关闭
    openPop(id, mark, { x: e.clientX, y: e.clientY });
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
    if (main) main.addEventListener('scroll', function () { hideToolbar(); schedulePlacePop(); });   // 滚动或缩放时隐藏工具条，浮层跟随（§6.4）
    window.addEventListener('resize', function () { hideToolbar(); schedulePlacePop(); });
    if (window.visualViewport) {                           // iOS 软键盘开/关、系统平移只在 visualViewport 上有事件
      window.visualViewport.addEventListener('resize', schedulePlacePop);
      window.visualViewport.addEventListener('scroll', schedulePlacePop);
    }
  }

  // 全局监听只挂一次：联网/回到前台补发队列、离开页面前提交撤销窗口内的删除、Esc、点浮层外部
  function wireGlobal() {
    if (S.globalWired) return;
    S.globalWired = true;
    window.addEventListener('online', function () { clearTimeout(S.retryTimer); S.retryN = 0; flush(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') flush(); });
    window.addEventListener('pagehide', commitAllUndo);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (S.reloc) { cancelRelocate(); e.preventDefault(); }
      else if (S.pop && !S.pop.hidden) { closePop(); e.preventDefault(); }
      else if (S.panelOpen) { closePanel(); e.preventDefault(); }
    });
    document.addEventListener('pointerdown', function (e) {
      if (!S.pop || S.pop.hidden) return;
      var t = e.target;
      if (S.pop.contains(t)) return;
      var m = t && t.closest ? t.closest('mark.rdr-hl') : null;
      if (m && m.getAttribute('data-hl-id') === S.popId) return;   // 留给 click 切换关闭
      closePop(true);
    }, true);
  }

  /* ── 7b. 笔记浮层 #rdr-hl-pop（§6.6）──────────────────────────────────── */

  function getItem(id) {                                   // 登录态条目（S.server 内同一对象）或访客草稿（新建对象，改完须 persist）
    for (var i = 0; i < S.server.length; i++) if (S.server[i].id === id) return S.server[i];
    var ds = readGuest();
    for (var k = 0; k < ds.length; k++) if (ds[k].id === id) return draftToItem(ds[k]);
    return null;
  }
  function placedRec(id) {
    for (var i = 0; i < S.placed.length; i++) if (S.placed[i].a.id === id) return S.placed[i];
    return null;
  }
  function placedStatus(id) { var r = placedRec(id); return r ? r.status : ''; }
  function syncState(a) {
    if (a.draft) return loggedIn() ? 'draft' : 'guest';
    var uid = uidNow(), q = uid ? qRead(uid) : {};
    if (!q[a.id]) return a.unsynced ? 'offline' : 'saved';
    return S.failed ? 'offline' : 'saving';
  }
  var SYNC_TEXT = { saving: '保存中…', saved: '已保存', offline: '离线，已存本地', draft: '本地草稿，尚未同步', guest: '未登录，仅存本机' };

  function ensurePop() {
    if (S.pop) return S.pop;
    var p = mk('div');
    p.id = 'rdr-hl-pop';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', '高亮笔记');
    p.hidden = true;
    var head = mk('div', 'rdr-pop-head');
    COLORS.forEach(function (c) {
      var b = btn('rdr-ann-dot rdr-ann-dot-' + c, '', COLOR_LABEL[c]);
      b.setAttribute('data-color', c);
      b.title = COLOR_LABEL[c];
      head.appendChild(b);
    });
    var none = btn('rdr-pop-none', '仅笔记', '仅笔记（无底色）');
    none.setAttribute('data-color', 'none');
    head.appendChild(none);
    var del = btn('rdr-pop-del', '删除', '删除这条标注');
    del.setAttribute('data-act', 'delete');
    head.appendChild(del);
    var ta = mk('textarea', 'rdr-pop-note');
    ta.placeholder = '写下你的笔记…';
    ta.maxLength = 20000;                                  // 与后端 MAX_NOTE 一致
    ta.setAttribute('aria-label', '笔记');
    var quote = mk('div', 'rdr-pop-quote');
    var loc = mk('div', 'rdr-pop-loc');
    var guest = mk('div', 'rdr-pop-guest');
    guest.appendChild(mk('span', null, '未登录：内容暂存在本机，登录后同步到账号。'));
    var lg = btn('rdr-pop-login', '登录');
    lg.setAttribute('data-act', 'login');
    guest.appendChild(lg);
    var foot = mk('div', 'rdr-pop-foot');
    foot.appendChild(mk('span', 'rdr-pop-time'));
    var sync = mk('span', 'rdr-pop-sync');
    sync.setAttribute('role', 'status');
    foot.appendChild(sync);
    [head, ta, quote, loc, guest, foot].forEach(function (n) { p.appendChild(n); });
    head.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b || !S.popId) return;
      var color = b.getAttribute('data-color');
      if (color) { var a = getItem(S.popId); if (a) recolor(a, color); }
      else if (b.getAttribute('data-act') === 'delete') { var d = getItem(S.popId); if (d) removeItems([d]); }
    });
    guest.addEventListener('click', function () { openLogin(); });
    ta.addEventListener('input', onPopInput);
    ta.addEventListener('blur', flushNow);                 // 失焦立即发出（§6.6）
    document.body.appendChild(p);
    S.pop = p;
    return p;
  }

  function updatePopHead() {
    var a = S.popId ? getItem(S.popId) : null;
    if (!a || !S.pop) return;
    var bs = S.pop.querySelectorAll('.rdr-pop-head button[data-color]');
    for (var i = 0; i < bs.length; i++) {
      var cur = bs[i].getAttribute('data-color') === colorOf(a);
      bs[i].classList.toggle('is-current', cur);
      bs[i].setAttribute('aria-pressed', cur ? 'true' : 'false');
    }
  }
  function updatePopLoc(a) {                               // 所在小节；原文已修订（fuzzy）时改为提示去面板确认
    var loc = S.pop.querySelector('.rdr-pop-loc'), head = a.anchor && a.anchor.heading && a.anchor.heading.text;
    var fz = placedStatus(a.id) === 'fuzzy';
    loc.textContent = fz ? '原文已修订，位置待确认（可在「我的笔记」里确认）' : head ? '所在小节：' + head : '';
    loc.hidden = !fz && !head;
  }
  function updatePopStatus() {
    if (!S.pop || S.pop.hidden || !S.popId) return;
    var a = getItem(S.popId);
    if (!a) return;
    var st = syncState(a), el = S.pop.querySelector('.rdr-pop-sync');
    el.textContent = SYNC_TEXT[st];
    el.setAttribute('data-state', st);
    S.pop.querySelector('.rdr-pop-guest').hidden = st !== 'guest';
    var t = fmtTime(a.updated_at);
    S.pop.querySelector('.rdr-pop-time').textContent = t ? '更新于 ' + t : '';
  }

  function onPopInput() {
    var a = getItem(S.popId);
    if (!a) return;
    a.note = S.pop.querySelector('textarea').value;
    a.updated_at = nowISO();
    var ms = marksOf(a.id), last = ms[ms.length - 1];
    if (last) last.classList.toggle('rdr-hl-has-note', /\S/.test(a.note));   // 局部更新，不重建 DOM
    persist(a, SAVE_DEBOUNCE);                             // 立即落本地，800ms 防抖后发出
    updatePopStatus();
  }

  function openPop(id, markEl, pt) {
    var a = getItem(id);
    if (!a) return;
    var p = ensurePop(), ms = marksOf(id);
    if (!ms.length) return;                                // 孤儿等未渲染条目没有落点
    if (S.popId && S.popId !== id) closePop(true);         // 先收起前一个（触发其 flush）
    closePanel();
    hideToolbar();
    S.popId = id;
    S.popSeg = Math.max(0, Array.prototype.indexOf.call(ms, markEl));
    S.popLine = 0;
    if (pt && ms[S.popSeg]) {                              // 浮层贴在被点中的那一行下方
      var rs = ms[S.popSeg].getClientRects();
      for (var i = 0; i < rs.length; i++) if (pt.y >= rs[i].top && pt.y <= rs[i].bottom) { S.popLine = i; break; }
    }
    var ta = p.querySelector('textarea');
    ta.value = a.note || '';
    p.querySelector('.rdr-pop-quote').textContent = a.quote;
    p.querySelector('.rdr-pop-quote').title = a.quote;
    updatePopLoc(a);
    var seg = ms[S.popSeg].getBoundingClientRect();
    if (window.innerWidth > 1023 && (seg.bottom < topLimit() || seg.top > window.innerHeight)) {
      ms[S.popSeg].scrollIntoView({ block: 'center' });    // 登录后自动打开等场景：高亮可能在视口外，先滚进来
    }
    p.hidden = false;
    p.style.visibility = 'hidden';                         // 先量尺寸再定位，避免闪一下
    placePop();
    p.style.visibility = '';
    updatePopHead();
    updatePopStatus();
    try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
  }

  function closePop(noFocus) {
    if (!S.pop || S.pop.hidden) return;
    S.pop.hidden = true;
    S.popId = null;
    flushNow();                                            // 关闭时立即 flush（§6.6）
    if (!noFocus) {
      var main = document.getElementById('rdr-main');
      if (main) try { main.focus({ preventScroll: true }); } catch (e) { main.focus(); }
    }
  }

  // 浮层内正在输入？（iOS 键盘弹起会平移页面，此时别把正在编辑的浮层当"滚出视口"关掉）
  function popEditing() {
    var ae = document.activeElement;
    return !!(S.pop && ae && S.pop.contains(ae) && /^(TEXTAREA|INPUT)$/.test(ae.tagName));
  }

  // 桌面：贴在被点击行下方（下方放不下翻到上方）；≤1023px 为底部抽屉（样式由 CSS 负责，这里只清掉内联定位）
  function placePop() {
    var p = S.pop;
    if (!p || p.hidden || !S.popId) return;
    var sheet = window.innerWidth <= 1023;
    p.classList.toggle('is-sheet', sheet);
    if (sheet) {
      p.style.left = ''; p.style.top = '';
      var vv = window.visualViewport;                      // iOS 软键盘：抽屉抬到键盘正上方
      if (vv) {
        p.style.bottom = Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height))) + 'px';
        p.style.maxHeight = Math.round(Math.max(220, vv.height - 10)) + 'px';
      }
      return;
    }
    p.style.bottom = ''; p.style.maxHeight = '';            // 切回桌面模式：清掉抽屉残留内联
    var ms = marksOf(S.popId);
    if (!ms.length) return;
    var el = ms[Math.min(S.popSeg, ms.length - 1)], rects = [], all = el.getClientRects(), i;
    for (i = 0; i < all.length; i++) if (all[i].width > 0 || all[i].height > 0) rects.push(all[i]);
    if (!rects.length) return;
    var r = rects[Math.min(S.popLine, rects.length - 1)];
    var limit = topLimit();
    if ((r.bottom < limit || r.top > window.innerHeight) && !popEditing()) { closePop(true); return; }   // 高亮已滚出可视区（输入中不关）
    var pw = p.offsetWidth, ph = p.offsetHeight, top = r.bottom + 8;
    if (top + ph > window.innerHeight - 8) top = r.top - ph - 8;
    if (top < limit) top = Math.max(limit, window.innerHeight - ph - 8);
    var left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left));
    p.style.left = Math.round(left) + 'px';
    p.style.top = Math.round(top) + 'px';
  }
  function schedulePlacePop() {
    if (S.placeRaf || !S.pop || S.pop.hidden) return;
    S.placeRaf = requestAnimationFrame(function () { S.placeRaf = 0; placePop(); });
  }

  // render() 重建 mark 后：条目还在就跟随新位置，没了就关闭
  function syncPop() {
    if (!S.popId) return;
    if (!getItem(S.popId) || !marksOf(S.popId).length) { closePop(true); return; }
    placePop();
    updatePopHead();
    updatePopLoc(getItem(S.popId));
    updatePopStatus();
  }

  /* ── 7c. "我的笔记"面板 #rdr-notes-panel（§6.7）────────────────────────── */

  function chapterList() {                                 // manifest 顺序
    var out = [];
    if (S.manifest && Array.isArray(S.manifest.parts)) {
      S.manifest.parts.forEach(function (part) {
        (part.chapters || []).forEach(function (c) { out.push({ id: c.id, title: c.title || c.id }); });
      });
    }
    return out;
  }
  function posOf(a) { return a.anchor && a.anchor.pos && isInt(a.anchor.pos.start) ? a.anchor.pos.start : 0; }
  function byPos(x, y) { return (posOf(x) - posOf(y)) || (x.created_at < y.created_at ? -1 : 1); }
  function hlUrl(a) {                                      // 与 reader.js bookUrl 同形：reader.html?book=<b>&ch=<c>#hl-<id>
    return 'reader.html?book=' + encodeURIComponent(a.book) + '&ch=' + encodeURIComponent(a.chapter) + '#hl-' + a.id;
  }

  function ensurePanel() {
    if (S.panel) return S.panel;
    var scrim = mk('div');
    scrim.id = 'rdr-notes-scrim';
    scrim.hidden = true;
    scrim.addEventListener('click', function () { closePanel(); });
    var p = mk('aside');
    p.id = 'rdr-notes-panel';
    p.setAttribute('aria-label', '我的笔记');
    p.setAttribute('aria-hidden', 'true');
    var head = mk('div', 'rdr-notes-head');
    head.appendChild(mk('span', 'rdr-notes-title', '我的笔记'));
    head.appendChild(btn('rdr-notes-close', '×', '关闭我的笔记'));
    var tabs = mk('div', 'rdr-notes-tabs');
    tabs.setAttribute('role', 'tablist');
    p.appendChild(head); p.appendChild(tabs); p.appendChild(mk('div', 'rdr-notes-body'));
    p.addEventListener('click', onPanelClick);
    document.body.appendChild(scrim);
    document.body.appendChild(p);
    S.panel = p; S.scrim = scrim;
    return p;
  }

  function setNotesBtn(open) {
    var b = document.getElementById('rdr-notes-btn');
    if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function openPanel() {
    ensurePanel();
    closePop(true);
    hideToolbar();
    if (!S.panelOpen) {
      S.panelTab = S.chapter ? 'chapter' : 'book';
      if (!loggedIn() && bookDrafts().length) S.panelTab = 'draft';   // 未登录：先看本地草稿（§6.7）
    }
    S.panelOpen = true;
    document.body.classList.add('rdr-notes-open');
    S.panel.setAttribute('aria-hidden', 'false');
    S.scrim.hidden = false;
    setNotesBtn(true);
    renderPanel();
    if (S.panelTab === 'book') loadBook(true);
    var x = S.panel.querySelector('.rdr-notes-close');
    if (x) x.focus({ preventScroll: true });
  }
  function closePanel() {
    if (!S.panelOpen) return;
    S.panelOpen = false;
    document.body.classList.remove('rdr-notes-open');
    S.panel.setAttribute('aria-hidden', 'true');
    S.scrim.hidden = true;
    setNotesBtn(false);
    if (S.panel.contains(document.activeElement)) {
      var b = document.getElementById('rdr-notes-btn');
      if (b) b.focus({ preventScroll: true });
    }
  }
  function togglePanel() { if (S.panelOpen) closePanel(); else openPanel(); }

  // 全书数据：GET ?book=（登录态）。每次打开面板重拉，看得到别的设备上的改动
  function loadBook(force) {
    if (!loggedIn() || S.bookState === 'loading' || (S.bookList && !force)) return;
    S.bookState = 'loading';
    renderPanel();
    resolveUid().then(function () { return fetchList(''); }).then(function (list) {
      if (!loggedIn()) return;
      S.bookState = list ? 'ready' : 'error';
      S.bookList = list ? mergeQueue(list, inBookScope) : null;
      renderPanel();
    });
  }

  function noteRow(a, o) {
    var li = mk('li', 'rdr-note-item' + (o.orphan ? ' is-orphan' : '') + (o.fuzzy ? ' is-fuzzy' : '') + (a.draft ? ' is-draft' : ''));
    li.setAttribute('data-id', a.id);
    var main = o.orphan ? mk('div', 'rdr-note-main') : mk('a', 'rdr-note-main');
    if (!o.orphan) { main.href = hlUrl(a); main.setAttribute('data-id', a.id); }
    var sw = mk('span', 'rdr-note-swatch rdr-note-swatch-' + colorOf(a));
    sw.setAttribute('aria-hidden', 'true');
    main.appendChild(sw);
    var txt = mk('span', 'rdr-note-txt');
    txt.appendChild(mk('span', 'rdr-note-quote', a.quote));
    if (o.fuzzy && o.newQuote) {                           // 待确认：并排给出正文里现在的对应文字，供用户判断是否确认
      var nq = mk('span', 'rdr-note-newq');
      nq.appendChild(mk('span', 'rdr-note-newq-label', '现在的原文'));
      nq.appendChild(mk('span', 'rdr-note-newq-text', o.newQuote));
      txt.appendChild(nq);
    }
    if (a.note && /\S/.test(a.note)) txt.appendChild(mk('span', 'rdr-note-text', a.note));
    var meta = [], head = a.anchor && a.anchor.heading && a.anchor.heading.text;
    if (head) meta.push(head);
    var tm = fmtTime(a.updated_at);
    if (tm) meta.push(tm);
    if (a.draft) meta.push('草稿');
    else if (a.unsynced) meta.push('未同步');
    if (o.orphan) meta.push('原文已找不到');
    if (o.fuzzy) meta.push('原文已修订');
    txt.appendChild(mk('span', 'rdr-note-meta', meta.join(' · ')));
    main.appendChild(txt);
    li.appendChild(main);
    var del = btn('rdr-note-del', '删除', '删除这条标注');
    del.setAttribute('data-act', 'del');
    del.setAttribute('data-id', a.id);
    if (o.orphan || o.fuzzy) {                             // 一列操作：待确认 → 确认新位置；无法定位 → 重新定位；都可删除
      var acts = mk('div', 'rdr-note-acts');
      var go = btn('rdr-note-act', o.fuzzy ? '确认新位置' : '重新定位', o.fuzzy ? '确认这条标注的新位置' : '为这条标注重新选择位置');
      go.setAttribute('data-act', o.fuzzy ? 'confirm' : 'reloc');
      go.setAttribute('data-id', a.id);
      acts.appendChild(go);
      acts.appendChild(del);
      li.appendChild(acts);
    } else li.appendChild(del);
    return li;
  }
  function appendList(parent, items, o) {
    var ul = mk('ul', 'rdr-note-list');
    items.forEach(function (a) { ul.appendChild(noteRow(a, o || {})); });
    parent.appendChild(ul);
  }
  function appendFuzzy(parent, fuzzies) {                  // 待确认（§3.7）：正文里以虚线标出可能的新位置，确认后才回写
    if (!fuzzies.length) return;
    var sec = mk('div', 'rdr-notes-fuzzy');
    sec.appendChild(mk('div', 'rdr-notes-group is-fuzzy', '待确认 · ' + fuzzies.length));
    sec.appendChild(mk('p', 'rdr-notes-hint', '这些高亮对应的原文已被修订，正文里以虚线标出了可能的新位置。确认后才会保存新位置；不对的话可以删除。'));
    var ul = mk('ul', 'rdr-note-list');
    fuzzies.forEach(function (a) {
      var rec = placedRec(a.id);
      ul.appendChild(noteRow(a, { fuzzy: true, newQuote: rec ? rec.newQuote : '' }));
    });
    sec.appendChild(ul);
    parent.appendChild(sec);
  }
  function appendOrphans(parent, orphans) {                // 无法定位：只在面板展示，可单条删除、重新定位，或整组清理（§6.7、§3.7）
    if (!orphans.length) return;
    var sec = mk('div', 'rdr-notes-orphans');
    var h = mk('div', 'rdr-notes-group is-orphan');
    h.appendChild(mk('span', null, '无法定位 · ' + orphans.length));
    var clean = btn('rdr-notes-clean', '全部清理');
    clean.setAttribute('data-act', 'clean-orphans');
    h.appendChild(clean);
    sec.appendChild(h);
    sec.appendChild(mk('p', 'rdr-notes-hint', '这些高亮对应的原文已被修订或删除，正文中不再显示；笔记内容仍保留在这里。'));
    appendList(sec, orphans, { orphan: true });
    parent.appendChild(sec);
  }
  function splitByStatus(items) {                          // 只对当前章有意义：其它章没有 DOM，无从判定
    var out = { ok: [], fuzzy: [], orphan: [] };
    items.forEach(function (a) {
      var st = placedStatus(a.id);
      out[st === 'orphan' ? 'orphan' : st === 'fuzzy' ? 'fuzzy' : 'ok'].push(a);
    });
    return out;
  }

  function buildLoginPrompt(body, nDraft) {
    var box = mk('div', 'rdr-notes-empty');
    box.appendChild(mk('p', null, '登录后，你的高亮与笔记会保存到账号，并在各设备间同步。'));
    if (nDraft) box.appendChild(mk('p', 'rdr-notes-hint', '本机有 ' + nDraft + ' 条草稿，见「草稿」页签。'));
    var b = btn('rdr-notes-login', '登录');
    b.setAttribute('data-act', 'login');
    box.appendChild(b);
    body.appendChild(box);
  }
  function buildChapterTab(body) {
    var items = S.server.slice().sort(byPos);
    if (!items.length) {
      body.appendChild(mk('p', 'rdr-notes-empty', '本章还没有高亮。选中正文里的文字，就可以高亮或写笔记。'));
      return;
    }
    var sp = splitByStatus(items);
    if (sp.ok.length) appendList(body, sp.ok);
    appendFuzzy(body, sp.fuzzy);
    appendOrphans(body, sp.orphan);
  }
  function buildBookTab(body) {
    if (S.bookState === 'loading' && !S.bookList) { body.appendChild(mk('p', 'rdr-notes-empty', '加载中…')); return; }
    var items = (S.bookList || []).filter(function (a) { return !isCurrentChapter(a); });
    if (S.chapter) items = items.concat(S.server);         // 本章以内存状态为准（含孤儿判定）
    if (S.bookState === 'error') {
      var err = mk('div', 'rdr-notes-banner');
      err.appendChild(mk('span', null, '全书笔记加载失败，当前只显示本章与待同步的内容。'));
      var rb = btn('rdr-notes-retry', '重试');
      rb.setAttribute('data-act', 'retry-book');
      err.appendChild(rb);
      body.appendChild(err);
    }
    if (!items.length) { body.appendChild(mk('p', 'rdr-notes-empty', '这本书还没有高亮或笔记。')); return; }
    var groups = {}, order = [];
    items.forEach(function (a) { (groups[a.chapter] = groups[a.chapter] || []).push(a); });
    chapterList().forEach(function (c) { if (groups[c.id]) order.push({ id: c.id, title: c.title }); });
    Object.keys(groups).sort().forEach(function (id) {     // manifest 里已找不到的章节放最后
      if (!order.some(function (o) { return o.id === id; })) order.push({ id: id, title: '其它章节（' + id + '）' });
    });
    order.forEach(function (g) {
      var list = groups[g.id].sort(byPos);
      var sp = S.chapter && g.id === S.chapter.id ? splitByStatus(list) : { ok: list, fuzzy: [], orphan: [] };
      body.appendChild(mk('div', 'rdr-notes-group', g.title + ' · ' + list.length));
      if (sp.ok.length) appendList(body, sp.ok);
      appendFuzzy(body, sp.fuzzy);
      appendOrphans(body, sp.orphan);
    });
  }
  function buildDraftTab(body, drafts) {
    var bar = mk('div', 'rdr-notes-banner'), b;
    if (loggedIn()) {
      bar.appendChild(mk('span', null, drafts.length + ' 条草稿尚未同步到当前账号'));
      b = btn('rdr-notes-adopt', '保存到当前账号');
      b.setAttribute('data-act', 'adopt');
    } else {
      bar.appendChild(mk('span', null, drafts.length + ' 条本地草稿，登录后同步'));
      b = btn('rdr-notes-login', '登录');
      b.setAttribute('data-act', 'login');
    }
    bar.appendChild(b);
    body.appendChild(bar);
    var groups = {}, order = [];
    drafts.forEach(function (d) { (groups[d.chapter] = groups[d.chapter] || []).push(draftToItem(d)); });
    chapterList().forEach(function (c) { if (groups[c.id]) order.push({ id: c.id, title: c.title }); });
    Object.keys(groups).sort().forEach(function (id) {
      if (!order.some(function (o) { return o.id === id; })) order.push({ id: id, title: '其它章节（' + id + '）' });
    });
    order.forEach(function (g) {
      var list = groups[g.id].sort(byPos);
      body.appendChild(mk('div', 'rdr-notes-group', g.title + ' · ' + list.length));
      appendList(body, list);
    });
  }

  function renderPanel() {
    if (!S.panel || !S.panelOpen) return;
    var drafts = bookDrafts(), tab = S.panelTab;
    if (tab === 'chapter' && !S.chapter) tab = 'book';
    if (tab === 'draft' && !drafts.length) tab = S.chapter ? 'chapter' : 'book';
    S.panelTab = tab;
    var tabs = S.panel.querySelector('.rdr-notes-tabs');
    tabs.textContent = '';
    [['chapter', '本章'], ['book', '全书'], ['draft', '草稿' + (drafts.length ? ' (' + drafts.length + ')' : '')]].forEach(function (t) {
      if ((t[0] === 'chapter' && !S.chapter) || (t[0] === 'draft' && !drafts.length)) return;
      var b = btn('rdr-notes-tab' + (t[0] === tab ? ' is-active' : ''), t[1]);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', t[0] === tab ? 'true' : 'false');
      b.setAttribute('data-tab', t[0]);
      tabs.appendChild(b);
    });
    var body = S.panel.querySelector('.rdr-notes-body'), top = body.scrollTop;
    body.textContent = '';
    if (tab === 'draft') buildDraftTab(body, drafts);
    else if (!loggedIn()) buildLoginPrompt(body, drafts.length);
    else if (tab === 'chapter') buildChapterTab(body);
    else buildBookTab(body);
    body.scrollTop = top;
  }

  function findAny(id) {
    var a = getItem(id), i;
    if (a) return a;
    if (S.bookList) for (i = 0; i < S.bookList.length; i++) if (S.bookList[i].id === id) return S.bookList[i];
    return null;
  }

  // 同章：改 hash 为 #hl-<id> 再调用 reader.js 的 jumpToHash（replaceState 不触发 hashchange，所以手动调）
  function gotoHighlight(id) {
    try { history.replaceState(null, '', '#hl-' + id); } catch (e) { window.location.hash = 'hl-' + id; return; }
    if (S.onRendered && !S.onRendered()) toast('没有找到这条高亮（可能已被删除，或原文已修订）');
  }

  function onPanelClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.rdr-notes-close')) { closePanel(); return; }
    var tab = t.closest('.rdr-notes-tab');
    if (tab) {
      S.panelTab = tab.getAttribute('data-tab');
      renderPanel();
      if (S.panelTab === 'book') loadBook(true);
      return;
    }
    var act = t.closest('[data-act]');
    if (act) {
      var name = act.getAttribute('data-act');
      if (name === 'login') openLogin();
      else if (name === 'retry-book') loadBook(true);
      else if (name === 'adopt') {
        var n = adoptDrafts(bookDrafts());
        flush(); refresh();
        toast(n ? '已把 ' + n + ' 条草稿保存到当前账号' : '暂时无法确认账号，草稿已保留');
        renderPanel();
      } else if (name === 'clean-orphans') {
        removeItems(S.server.filter(function (a) { return placedStatus(a.id) === 'orphan'; }));
      } else if (name === 'del') {
        var a = findAny(act.getAttribute('data-id'));
        if (a) removeItems([a]);
      } else if (name === 'confirm') confirmFuzzy(act.getAttribute('data-id'));
      else if (name === 'reloc') startRelocate(act.getAttribute('data-id'));
      return;
    }
    var link = t.closest('a.rdr-note-main');
    if (link) {
      var it = findAny(link.getAttribute('data-id'));
      if (it && isCurrentChapter(it)) {                    // 同章：就地定位。异章：放行 <a href>，reader.js 的全局点击已先 saveScroll
        e.preventDefault();
        closePanel();
        gotoHighlight(it.id);
      }
    }
  }

  /* ── 8. 工具条动作：创建 / 换色 / 笔记 / 删除 ──────────────────────────── */

  function onToolbarClick(e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || !S.pending) return;
    var color = b.getAttribute('data-color'), act = b.getAttribute('data-act');
    if (color) commitColor(color);
    else if (act === 'note') commitNote();
    else if (act === 'delete') removeExisting();
    else if (act === 'relocate') commitRelocate();
  }

  // 新建一条：登录态乐观渲染并入队；访客存草稿 → 虚线渲染 → 登录引导（§6.8）
  function createItem(p, color) {
    var iso = nowISO();
    var a = { id: uuid(), book: S.bookId, chapter: S.chapter.id, color: color, quote: p.r.quote, note: '',
      anchor: p.r.anchor, created_at: iso, updated_at: iso };
    if (loggedIn()) {
      S.server.push(a);
      render();
      persist(a, 0);
    } else {
      a.draft = true;
      saveGuestItem(a);
      render();
      openLogin();
    }
    return a;
  }

  function commitColor(color) {
    var p = S.pending;
    S.pending = null;
    clearSelection();
    hideToolbar();
    if (!p) return;
    if (p.existing) { recolor(p.existing.a, color); return; }
    createItem(p, color);
  }

  // "✎ 笔记"：以 color:'none' 创建并打开浮层；选区已是现有高亮则直接打开它
  function commitNote() {
    var p = S.pending;
    S.pending = null;
    clearSelection();
    hideToolbar();
    if (!p) return;
    var id = p.existing ? p.existing.a.id : null;
    if (!id) {
      var a = createItem(p, 'none');
      id = a.id;
      if (!loggedIn()) { S.afterLoginOpen = id; return; }  // 登录弹窗已打开；登录成功后接着打开浮层
    }
    var ms = marksOf(id);
    openPop(id, ms[0]);
  }

  function recolor(a, color) {
    if (a.color === color) return;
    a.color = color;
    a.updated_at = nowISO();
    setMarkColor(a.id, color);
    persist(a, 0);                                         // 草稿保留 note 只改色；登录态入队
    updatePopHead();
  }

  function removeExisting() {
    var p = S.pending;
    S.pending = null;
    clearSelection();
    hideToolbar();
    if (!p || !p.existing) return;
    removeItems([p.existing.a]);
  }

  /* ── 9. 待确认 / 孤儿的处理（§3.7）──────────────────────────────────────── */

  // 待确认 → "确认新位置"：用 fuzzy 命中的正文原文更新 quote + anchor 并 PUT；重渲染后即为 exact
  function confirmFuzzy(id) {
    var rec = placedRec(id), a = findAny(id);
    if (!rec || rec.status !== 'fuzzy' || !a) return;
    var r = anchorAt(getModel(), rec.s, rec.e);
    if (r.quote.length > MAX_QUOTE) { toast('新位置的文字过长（最多 ' + MAX_QUOTE + ' 字），请删除后重新选择'); return; }
    a.quote = r.quote;
    a.anchor = r.anchor;
    a.updated_at = nowISO();
    persist(a, 0);
    render();
    toast('已确认新位置');
  }

  // 孤儿 → "重新定位"：收起面板，横幅提示在正文选一段新文字；工具条只剩"挂到这里"，点后 PUT 同一 id（新 quote/anchor）
  function ensureRelocBar() {
    if (S.relocBar) return S.relocBar;
    var b = mk('div');
    b.id = 'rdr-ann-reloc';
    b.setAttribute('role', 'status');
    b.hidden = true;
    b.appendChild(mk('span', 'rdr-reloc-msg', '重新定位：请在正文里选中这条笔记要挂的新位置'));
    b.appendChild(mk('span', 'rdr-reloc-quote'));
    var c = btn('rdr-reloc-cancel', '取消');
    c.addEventListener('click', cancelRelocate);
    b.appendChild(c);
    document.body.appendChild(b);
    S.relocBar = b;
    return b;
  }
  function startRelocate(id) {
    var a = findAny(id);
    if (!a || !S.body || !isCurrentChapter(a)) return;
    cancelRelocate();
    closePanel();
    closePop(true);
    hideToolbar();
    S.reloc = { id: id };
    var bar = ensureRelocBar();
    bar.querySelector('.rdr-reloc-quote').textContent = '“' + (a.quote.length > 36 ? a.quote.slice(0, 36) + '…' : a.quote) + '”';
    bar.hidden = false;
  }
  function cancelRelocate() {
    if (!S.reloc) return;
    S.reloc = null;
    if (S.relocBar) S.relocBar.hidden = true;
    hideToolbar();
  }
  function commitRelocate() {
    var p = S.pending, id = S.reloc && S.reloc.id;
    S.pending = null;
    clearSelection();
    hideToolbar();
    if (!p || !id) return;
    var a = findAny(id);
    cancelRelocate();
    if (!a) return;                                        // 期间已被删除
    a.quote = p.r.quote;
    a.anchor = p.r.anchor;
    a.updated_at = nowISO();
    persist(a, 0);
    render();
    toast('已重新定位');
  }

  /* ── 10. 入口 ──────────────────────────────────────────────────────── */

  // "我的笔记"入口：reader.html 中默认 hidden，模块就绪后才取消（脚本没加载时入口不出现）
  function bindNotesBtn() {
    var b = document.getElementById('rdr-notes-btn');
    if (!b || b.getAttribute('data-bound')) return;
    b.setAttribute('data-bound', '1');
    b.hidden = false;
    b.addEventListener('click', togglePanel);
  }

  var api = window.ReaderAnnotations = {
    // opts: { bookId, chapter|null, manifest, body|null, onRendered }；封面传 chapter:null, body:null
    mount: function (opts) {
      try {
        opts = opts || {};
        cancelRelocate();                                  // 换章/重挂载：退出"重新定位"模式
        S.bookId = opts.bookId || null;
        S.chapter = opts.chapter || null;
        S.manifest = opts.manifest || null;               // 全书面板按 manifest 顺序分章
        S.body = opts.body || null;
        S.onRendered = typeof opts.onRendered === 'function' ? opts.onRendered : null;
        S.server = []; S.model = null; S.placed = []; S.rendered = false;
        S.bookList = null; S.bookState = 'idle';
        bindAuth();
        bindNotesBtn();
        wireGlobal();
        if (!S.body || !S.chapter) {                      // 封面：只有全书面板；顺手补发上次遗留的队列
          if (loggedIn()) flush();
          return Promise.resolve();
        }
        wireSelection();
        return refresh();
      } catch (e) { warn(e); return Promise.resolve(); }   // 故障隔离：绝不让阅读器的 renderChapter 因此进入错误页
    },
    refresh: refresh,
    openPanel: openPanel,
    closePanel: closePanel,
    _internal: { buildModel: buildModel, anchorFromRange: anchorFromRange, anchorAt: anchorAt, resolveAnchor: resolveAnchor,
      applyMarks: applyMarks, clearMarks: clearMarks, cyrb53: cyrb53,
      placed: function () {                                // 最近一次渲染的判定结果（P4 自测用）
        return S.placed.map(function (r) {
          return { id: r.a.id, status: r.status, lv: r.lv, n: r.n, ctx: r.ctx, s: r.s, e: r.e, newQuote: r.newQuote || '' };
        });
      } }    // 仅测试用（同 ReaderAuth._emitLogout 先例）
  };
})();
