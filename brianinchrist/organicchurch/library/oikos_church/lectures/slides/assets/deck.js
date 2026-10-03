/* ============================================================
   《家教会的本体论革命》四讲 · 演示文稿共用脚本
   原生 JS，无任何依赖；普通 <script>（非 module），不使用 fetch，
   file:// 直接双击打开即可放映。
   功能：翻页、进度条与页码、URL hash 定位、演讲者备注（N）、
        讲者视图（P，另开窗口，与放映窗口同步）、总览（O）、
        全屏（F）、帮助（?）、分步显示（.step）、现场互动倒计时（.timer）。
   ============================================================ */
(function () {
  'use strict';

  var deck = document.querySelector('.deck');
  if (!deck) return;
  var stage = deck.querySelector('.stage');
  var slides = Array.prototype.filter.call(stage.children, function (el) {
    return el.classList.contains('slide');
  });
  var total = slides.length;
  var cur = -1;
  var tick = null;
  var t0 = Date.now();
  var isPresenter = /[?&]presenter\b/.test(location.search);
  var peer = null;          // 另一个窗口（放映窗口 ↔ 讲者视图）
  var syncing = false;      // 正在应用对方发来的状态时，不再回传

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function make(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html) el.innerHTML = html;
    return el;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(sec) { return Math.floor(sec / 60) + ':' + pad2(sec % 60); }

  /* ---------- 预处理：编号、进场次序 ---------- */
  slides.forEach(function (s, i) {
    s.setAttribute('data-num', i + 1);
    s.setAttribute('role', 'group');
    s.setAttribute('aria-roledescription', '幻灯片');
    s.setAttribute('aria-label', (i + 1) + ' / ' + total + (s.dataset.title ? '：' + s.dataset.title : ''));

    // .r 元素按文档顺序依次进场（间隔由 --stagger 控制）
    var k = 0;
    each(s.querySelectorAll('.r'), function (el) {
      if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', k);
      k++;
    });
    // SVG 内的自绘 / 弹出 / 淡入元素，在各自的 SVG 内依次出现
    each(s.querySelectorAll('svg'), function (svg) {
      var d = 0;
      each(svg.querySelectorAll('.draw, .pop, .fade, .fly'), function (el) {
        if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', d);
        d++;
      });
    });
    // 时间轴条按行推进
    var row = 0;
    each(s.querySelectorAll('.tl-bar'), function (el) { el.style.setProperty('--row', row++); });
    // 倒计时环
    each(s.querySelectorAll('.timer'), function (t) {
      if (!t.querySelector('svg')) {
        t.innerHTML =
          '<svg viewBox="0 0 120 120" aria-hidden="true">' +
          '<circle class="track" cx="60" cy="60" r="52"/>' +
          '<circle class="prog" cx="60" cy="60" r="52" pathLength="1"/></svg>' +
          '<div class="tnum"><span class="tval">' + fmt(+t.dataset.sec || 120) + '</span><small>点击重新计时</small></div>';
      }
      t.setAttribute('role', 'timer');
    });
  });

  /* ---------- 外壳：页脚、进度条、备注、帮助、总览占位 ---------- */
  var foot = make('div', 'chrome-foot',
    '<span class="cf-l">' + esc(deck.getAttribute('data-label') || '') + '</span><span class="cf-r"></span>');
  var prog = make('div', 'progress');
  var spacer = make('div', 'ov-spacer');
  stage.appendChild(foot);
  stage.appendChild(prog);
  stage.appendChild(spacer);

  var notesPanel = make('aside', 'notes-panel');
  notesPanel.setAttribute('aria-label', '演讲者备注');
  document.body.appendChild(notesPanel);

  var help = make('div', 'help-overlay',
    '<div class="help-card" role="dialog" aria-label="快捷键">' +
    '<h2>放映快捷键</h2><table>' +
    '<tr><td><kbd>→</kbd> <kbd>Space</kbd> <kbd>PageDown</kbd></td><td>下一步 / 下一页</td></tr>' +
    '<tr><td><kbd>←</kbd> <kbd>Shift</kbd>+<kbd>Space</kbd> <kbd>PageUp</kbd></td><td>上一步 / 上一页</td></tr>' +
    '<tr><td><kbd>Home</kbd> <kbd>End</kbd></td><td>首页 / 末页</td></tr>' +
    '<tr><td><kbd>F</kbd></td><td>全屏切换</td></tr>' +
    '<tr><td><kbd>N</kbd></td><td>演讲者备注（出处、讲员提示、⚠ 待核对项）</td></tr>' +
    '<tr><td><kbd>P</kbd></td><td>讲者视图：另开一个窗口，显示当前页、下一页、备注与计时，两个窗口同步翻页</td></tr>' +
    '<tr><td><kbd>O</kbd></td><td>总览缩略图（点击跳转，<kbd>Esc</kbd> 返回）</td></tr>' +
    '<tr><td><kbd>?</kbd></td><td>显示 / 关闭本帮助</td></tr>' +
    '<tr><td>鼠标 / 触屏</td><td>点击画面左三分之一后退，右三分之一前进；左右滑动翻页</td></tr>' +
    '<tr><td>网址 <kbd>#12</kbd></td><td>直达第 12 页</td></tr>' +
    '</table><p class="foot">打印（⌘P / Ctrl+P）即可导出每页一张的 PDF 讲义。</p></div>');
  document.body.appendChild(help);

  /* ---------- 讲者视图：下一页预览 ---------- */
  var preview = null;
  if (isPresenter) {
    document.body.classList.add('is-presenter');
    deck.classList.add('notes-on');
    document.body.classList.add('notes-on');
    preview = make('div', 'pv-next', '<div class="pv-label">下一页</div><div class="pv-box"><div class="pv-stage"></div></div>');
    document.body.appendChild(preview);
    document.title = '讲者视图 · ' + document.title;
  }
  function renderPreview() {
    if (!preview) return;
    var holder = preview.querySelector('.pv-stage');
    holder.innerHTML = '';
    var nx = slides[cur + 1];
    if (!nx) { holder.innerHTML = '<div class="pv-end">（最后一页）</div>'; return; }
    var c = nx.cloneNode(true);
    c.classList.remove('past');
    c.classList.add('active', 'pv-clone');
    c.removeAttribute('id');
    holder.appendChild(c);
  }

  /* ---------- 缩放 ---------- */
  function fit() {
    var s;
    if (isPresenter) {
      s = Math.min(window.innerWidth * 0.62 / 1920, window.innerHeight * 0.56 / 1080);
      if (preview) preview.style.setProperty('--ps', (window.innerWidth * 0.33) / 1920);
    } else {
      s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    }
    stage.style.setProperty('--s', s);
    if (deck.classList.contains('is-overview')) layoutOverview();
  }
  window.addEventListener('resize', fit);

  /* ---------- 翻页 ---------- */
  function go(i, revealAll) {
    i = Math.max(0, Math.min(total - 1, i));
    if (i === cur) return;
    cur = i;
    slides.forEach(function (s, j) {
      s.classList.toggle('active', j === i);
      s.classList.toggle('past', j < i);
      s.setAttribute('aria-hidden', j === i ? 'false' : 'true');
    });
    each(slides[i].querySelectorAll('.step'), function (st) { st.classList.toggle('on', !!revealAll); });
    var s = slides[i];
    stage.setAttribute('data-tone', s.classList.contains('dark') ? 'dark' : 'light');
    stage.setAttribute('data-chrome', s.hasAttribute('data-nochrome') ? 'off' : 'on');
    foot.querySelector('.cf-r').textContent = (i + 1) + ' / ' + total;
    prog.style.setProperty('--p', total > 1 ? i / (total - 1) : 1);
    setHash(i);
    renderNotes();
    renderPreview();
    runTimer();
    if (deck.classList.contains('is-overview')) scrollToCurrent();
    post();
  }

  function next() {
    var hidden = slides[cur].querySelectorAll('.step:not(.on)');
    if (hidden.length) { hidden[0].classList.add('on'); post(); return; }
    go(cur + 1, false);
  }
  function prev() {
    var shown = slides[cur].querySelectorAll('.step.on');
    if (shown.length) { shown[shown.length - 1].classList.remove('on'); post(); return; }
    go(cur - 1, true);
  }

  /* ---------- 两个窗口同步（postMessage，file:// 下可用） ---------- */
  function post() {
    if (syncing) return;
    var target = isPresenter ? window.opener : peer;
    if (!target || target.closed) return;
    try {
      target.postMessage({ deckSync: true, path: location.pathname, i: cur,
        s: slides[cur].querySelectorAll('.step.on').length }, '*');
    } catch (e) {}
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || !d.deckSync || d.path !== location.pathname) return;
    if (!isPresenter && e.source) peer = e.source;
    if (d.hello) { post(); return; }
    syncing = true;
    go(d.i, false);
    each(slides[cur].querySelectorAll('.step'), function (st, k) { st.classList.toggle('on', k < d.s); });
    syncing = false;
  });
  function openPresenter() {
    if (isPresenter) return;
    if (peer && !peer.closed) { peer.focus(); return; }
    peer = window.open(location.pathname + '?presenter#' + (cur + 1), 'deck-presenter', 'width=1280,height=800');
    if (!peer) alert('浏览器拦截了弹出窗口，请允许本页打开新窗口后再按 P。');
  }
  if (isPresenter && window.opener) {
    // 讲者视图打开后，先向放映窗口报到，再以放映窗口的页码为准
    setTimeout(function () {
      try { window.opener.postMessage({ deckSync: true, hello: true, path: location.pathname, i: cur, s: 0 }, '*'); } catch (e) {}
    }, 50);
  }

  /* ---------- URL hash：#12 = 第 12 页 ---------- */
  function setHash(i) {
    var h = '#' + (i + 1);
    if (location.hash === h) return;
    try { history.replaceState(null, '', h); }
    catch (e) { location.hash = h; }
  }
  function fromHash() {
    var m = /^#(\d+)$/.exec(location.hash);
    return m ? parseInt(m[1], 10) - 1 : 0;
  }
  window.addEventListener('hashchange', function () { go(fromHash(), false); });

  /* ---------- 演讲者备注 ---------- */
  function renderNotes() {
    if (!deck.classList.contains('notes-on') || cur < 0) return;
    var s = slides[cur];
    var n = s.querySelector('.notes');
    var nx = slides[cur + 1];
    notesPanel.innerHTML =
      '<header><b>' + (cur + 1) + ' / ' + total + '</b>' +
      (s.dataset.title ? '<span>' + esc(s.dataset.title) + '</span>' : '') +
      (s.dataset.time ? '<span>时间轴：' + esc(s.dataset.time) + '</span>' : '') +
      '<span class="np-clock"></span></header>' +
      '<div class="np-body">' + (n ? n.innerHTML : '<p>（本页无备注）</p>') + '</div>' +
      '<footer>' + (nx ? '下一页：' + esc(nx.dataset.title || '（无标题）') : '（最后一页）') + '</footer>';
    updClock();
  }
  function updClock() {
    var c = notesPanel.querySelector('.np-clock');
    if (!c) return;
    var el = Math.floor((Date.now() - t0) / 1000);
    var d = new Date();
    c.textContent = '已放映 ' + Math.floor(el / 60) + ':' + pad2(el % 60) + ' · 现在 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  setInterval(function () { if (deck.classList.contains('notes-on')) updClock(); }, 1000);

  function toggleNotes() {
    deck.classList.toggle('notes-on');
    document.body.classList.toggle('notes-on', deck.classList.contains('notes-on'));
    renderNotes();
  }

  /* ---------- 帮助 ---------- */
  function toggleHelp(force) {
    var on = typeof force === 'boolean' ? force : !document.body.classList.contains('help-on');
    document.body.classList.toggle('help-on', on);
  }
  help.addEventListener('click', function (e) { if (e.target === help) toggleHelp(false); });

  /* ---------- 全屏 ---------- */
  function toggleFull() {
    var d = document, el = d.documentElement, p;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      p = (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } else {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) p = req.call(el);
    }
    if (p && p.catch) p.catch(function () {});
  }

  /* ---------- 总览 ---------- */
  function layoutOverview() {
    var W = stage.clientWidth;
    var cols = W > 1500 ? 5 : W > 1000 ? 4 : 3;
    var gap = 28;
    var tw = (W - gap * (cols + 1)) / cols;
    var k = tw / 1920, th = 1080 * k;
    slides.forEach(function (s, j) {
      var c = j % cols, r = Math.floor(j / cols);
      s.style.transform = 'translate(' + (gap + c * (tw + gap)) + 'px,' + (gap + r * (th + gap)) + 'px) scale(' + k + ')';
      s.dataset.ovTop = gap + r * (th + gap);
    });
    spacer.style.height = (gap + Math.ceil(total / cols) * (th + gap)) + 'px';
  }
  function scrollToCurrent() {
    var top = +slides[cur].dataset.ovTop || 0;
    if (top < stage.scrollTop || top > stage.scrollTop + stage.clientHeight - 120) stage.scrollTop = Math.max(0, top - 60);
  }
  function enterOverview() {
    deck.classList.add('is-overview', 'no-trans');
    layoutOverview();
    scrollToCurrent();
  }
  function exitOverview(i) {
    deck.classList.add('no-trans');
    deck.classList.remove('is-overview');
    slides.forEach(function (s) { s.style.transform = ''; });
    spacer.style.height = '';
    stage.scrollTop = 0;
    var target = typeof i === 'number' ? i : cur;
    if (target === cur) {
      // 重新触发当前页的进场动画
      slides[cur].classList.remove('active');
      void slides[cur].offsetWidth;
      slides[cur].classList.add('active');
    } else {
      go(target, false);
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { deck.classList.remove('no-trans'); });
    });
  }
  function toggleOverview() {
    if (deck.classList.contains('is-overview')) exitOverview(cur);
    else enterOverview();
  }

  /* ---------- 现场互动倒计时 ---------- */
  function runTimer() {
    if (tick) { clearInterval(tick); tick = null; }
    var t = slides[cur].querySelector('.timer');
    if (!t) return;
    var sec = +t.dataset.sec || 120;
    var out = t.querySelector('.tval');
    var ring = t.querySelector('.prog');
    t.classList.remove('done');
    t.style.setProperty('--dur', sec + 's');
    if (ring) { ring.style.animation = 'none'; void ring.getBoundingClientRect(); ring.style.animation = ''; }
    var start = Date.now();
    function upd() {
      var left = Math.max(0, sec - Math.floor((Date.now() - start) / 1000));
      if (out) out.textContent = fmt(left);
      if (left === 0) { clearInterval(tick); tick = null; t.classList.add('done'); }
    }
    upd();
    tick = setInterval(upd, 1000);
  }

  /* ---------- 键盘 ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key;
    var ov = deck.classList.contains('is-overview');
    if (document.body.classList.contains('help-on') && k !== '?' ) {
      if (k === 'Escape' || k === 'Enter') { toggleHelp(false); e.preventDefault(); }
      return;
    }
    switch (k) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown':
        ov ? go(cur + 1, true) : next(); break;
      case ' ': case 'Spacebar':
        if (ov) go(cur + (e.shiftKey ? -1 : 1), true); else (e.shiftKey ? prev : next)(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
        ov ? go(cur - 1, true) : prev(); break;
      case 'Home': go(0, false); break;
      case 'End': go(total - 1, true); break;
      case 'f': case 'F': toggleFull(); break;
      case 'n': case 'N': if (!isPresenter) toggleNotes(); break;
      case 'p': case 'P': openPresenter(); break;
      case 'o': case 'O': toggleOverview(); break;
      case '?': toggleHelp(); break;
      case 'Enter': if (ov) exitOverview(cur); else return; break;
      case 'Escape':
        if (ov) exitOverview(cur);
        else if (deck.classList.contains('notes-on') && !isPresenter) toggleNotes();
        else return;
        break;
      default: return;
    }
    e.preventDefault();
  });

  /* ---------- 鼠标与触屏 ---------- */
  stage.addEventListener('click', function (e) {
    if (deck.classList.contains('is-overview')) {
      var hit = e.target.closest('.slide');
      if (hit) exitOverview(slides.indexOf(hit));
      return;
    }
    var t = e.target.closest('.timer');
    if (t) { runTimer(); return; }
    if (e.target.closest('a, button, input, select, textarea, [data-noclick]')) return;
    var x = e.clientX / window.innerWidth;
    if (x < 1 / 3) prev();
    else if (x > 2 / 3) next();
  });
  stage.addEventListener('mousemove', function (e) {
    if (deck.classList.contains('is-overview')) { stage.style.cursor = ''; return; }
    var x = e.clientX / window.innerWidth;
    stage.style.cursor = e.target.closest('a, .timer') ? '' : (x < 1 / 3 ? 'w-resize' : x > 2 / 3 ? 'e-resize' : '');
  });
  var touchX = null;
  stage.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 60 && !deck.classList.contains('is-overview')) (dx < 0 ? next : prev)();
  });

  /* ---------- 启动 ---------- */
  fit();
  deck.classList.add('no-trans');
  go(fromHash(), false);
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { deck.classList.remove('no-trans'); });
  });
})();
