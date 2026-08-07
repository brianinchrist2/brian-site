/**
 * reader.js — independent single-file web book reader.
 *
 * Vanilla JS, no dependencies, no build step. Loaded by books/reader.html
 * AFTER assets/js/marked.min.js (browser global `marked.parse(md) -> HTML`).
 *
 * URL contract:
 *   reader.html?book=<id>            -> cover mode
 *   reader.html?book=<id>&ch=<chId>  -> chapter mode
 *
 * All fetches resolve relative to reader.html: <book>/manifest.json,
 * <book>/<chapter.file>. Settings live in localStorage:
 * reader_theme / reader_measure / reader_font / reader_last_page /
 * book_pos_<bookId>_<chId> (per-chapter scroll restore).
 */
(function () {
  'use strict';

  var THEMES = ['light', 'sepia', 'dark', 'olive'];
  var MEASURE_MIN = 26, MEASURE_MAX = 76, MEASURE_STEP = 2, MEASURE_DEFAULT = 38; // em
  var FONT_MIN = 14, FONT_MAX = 26, FONT_STEP = 2, FONT_DEFAULT = 18;

  var state = {
    bookId: null,   // manifest id from ?book=
    manifest: null, // parsed manifest
    chapters: [],   // flattened [{ part, chapter }] in reading order
    current: null,  // { index, chapter } of open chapter, or null
    font: FONT_DEFAULT,
    measure: MEASURE_DEFAULT,
    coursewareData: null,  // parsed courseware.json
    coursewareReady: null  // promise resolving when courseware.json is loaded
  };

  // ---- 课件登录门禁 + 用户笔记 ----
  var AUTH = window.ReaderAuth;
  function notesUrl(chapter) {
    return '/api/courseware/notes?book=' + encodeURIComponent(state.bookId || 'lordship_gospel') +
      '&chapter=' + encodeURIComponent(chapter);
  }
  function draftKey(userId, chapter, qtype, index) {
    return 'cw_draft_' + userId + '_' + chapter + '_' + qtype + '_' + index;
  }
  function clearDraft(userId, chapter, qtype, index) {
    try { localStorage.removeItem(draftKey(userId, chapter, qtype, index)); } catch (e) {}
  }

  function qs(sel) { return document.querySelector(sel); }
  function els(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function setVisible(el, visible) {
    if (!el) return;
    if (visible) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
  }

  function bookUrl(chId) {
    var url = 'reader.html?book=' + encodeURIComponent(state.bookId);
    if (chId != null) url += '&ch=' + encodeURIComponent(chId);
    return url;
  }
  function bookPosKey(chId) { return 'book_pos_' + state.bookId + '_' + chId; }
  function flattenChapters(manifest) {
    var flat = [];
    manifest.parts.forEach(function (part) {
      part.chapters.forEach(function (chapter) { flat.push({ part: part.part, chapter: chapter }); });
    });
    return flat;
  }
  function findChapterIndex(chId) {
    if (chId == null) return -1;
    for (var i = 0; i < state.chapters.length; i++) {
      if (state.chapters[i].chapter.id === chId) return i;
    }
    return -1;
  }

  // Render markdown via vendored marked, with a plain-text fallback.
  function renderMarkdown(md) {
    if (window.marked && typeof window.marked.parse === 'function') return window.marked.parse(md);
    return '<pre>' + escapeHtml(md) + '</pre>';
  }
  // First line of every chapter file is "# 标题" — split the title off.
  function splitMarkdown(md, fallbackTitle) {
    var text = md.replace(/^\uFEFF/, '').replace(/^\n+/, '');
    var match = text.match(/^#\s+([^\n]+)\n?/);
    if (match) return { title: match[1].trim(), body: text.slice(match[0].length) };
    return { title: fallbackTitle || '', body: text };
  }

  async function fetchManifest() {
    var resp = await fetch(state.bookId + '/manifest.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var manifest = await resp.json();
    if (!manifest || !Array.isArray(manifest.parts)) throw new Error('manifest 数据无效');
    return manifest;
  }

  function renderCover() {
    var m = state.manifest;
    var lastUrl = localStorage.getItem('reader_last_page');
    var tocHtml = m.parts.map(function (part) {
      return '<div class="rdr-part-title">' + escapeHtml(part.part) + '</div>' +
        part.chapters.map(function (c) {
          return '<a class="rdr-toc-item" href="' + escapeHtml(bookUrl(c.id)) + '">' + escapeHtml(c.title) + '</a>';
        }).join('');
    }).join('');
    var first = state.chapters[0];
    var resumeAttr = lastUrl ? ' href="' + escapeHtml(lastUrl) + '"' : ' hidden';
    var ctaHtml = first ? '<a class="rdr-cover-cta" href="' + escapeHtml(bookUrl(first.chapter.id)) + '">开始阅读</a>' : '';
    qs('#rdr-content').innerHTML =
      '<div class="rdr-cover">' +
        '<h1 class="rdr-cover-title">' + escapeHtml(m.title || '') + '</h1>' +
        (m.subtitle ? '<p class="rdr-cover-subtitle">' + escapeHtml(m.subtitle) + '</p>' : '') +
        (m.desc ? '<p class="rdr-cover-desc">' + escapeHtml(m.desc) + '</p>' : '') +
        (m.stat ? '<p class="rdr-cover-stat">' + escapeHtml(m.stat) + '</p>' : '') +
        '<a class="rdr-cover-resume"' + resumeAttr + '>继续阅读</a>' + ctaHtml +
        '<nav class="rdr-cover-toc">' + tocHtml + '</nav>' +
      '</div>';
    document.title = m.title || state.bookId || '';
  }

  async function renderChapter() {
    var entry = state.current;
    var ch = entry.chapter;
    var main = qs('#rdr-main');
    try {
      var resp = await fetch(state.bookId + '/' + ch.file);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var md = await resp.text();
      var parts = splitMarkdown(md, ch.title);
      document.title = state.manifest.title || '';
      var titleEl = qs('#rdr-title');
      if (titleEl) titleEl.textContent = state.manifest.title || '';
      qs('#rdr-content').innerHTML =
        '<h1 class="rdr-chapter-title">' + escapeHtml(parts.title) + '</h1>' +
        '<div class="rdr-chapter-body">' + renderMarkdown(parts.body) + '</div>';
      renderToc(ch.id);
      showCoursewareFor(ch.cw);
      localStorage.setItem('reader_last_page', window.location.href);
      // Restore previous scroll position once layout settles.
      var saved = parseInt(localStorage.getItem(bookPosKey(ch.id)) || '0', 10) || 0;
      window.setTimeout(function () {
        if (main) main.scrollTop = saved;
        updateProgress();
      }, 0);
    } catch (err) {
      renderError('无法加载本章内容：' + (err && err.message ? err.message : String(err)));
    }
  }

  function renderToc(activeId) {
    var toc = qs('#rdr-toc');
    if (!toc) return;
    var html = state.manifest.parts.map(function (part) {
      return '<div class="rdr-part-title">' + escapeHtml(part.part) + '</div>' +
        part.chapters.map(function (c) {
          var cls = (activeId != null && c.id === activeId) ? 'rdr-toc-item active' : 'rdr-toc-item';
          return '<a class="' + cls + '" href="' + escapeHtml(bookUrl(c.id)) + '">' + escapeHtml(c.title) + '</a>';
        }).join('');
    }).join('');
    toc.innerHTML = html;
  }

  function renderError(message) {
    var content = qs('#rdr-content');
    if (!content) return;
    var backUrl = state.bookId ? 'reader.html?book=' + encodeURIComponent(state.bookId) : 'reader.html';
    content.innerHTML =
      '<div class="rdr-error">' +
        '<p>' + escapeHtml(message) + '</p>' +
        '<a href="' + escapeHtml(backUrl) + '">返回书目</a>' +
      '</div>';
  }

  function setNav(btn, entry) {
    if (!btn) return;
    if (!entry) {
      btn.setAttribute('disabled', '');
      btn.removeAttribute('href');
    } else {
      btn.removeAttribute('disabled');
      btn.setAttribute('href', bookUrl(entry.chapter.id));
    }
  }
  function updateNav() {
    var prev = null, next = null;
    if (state.current) {
      var index = state.current.index;
      if (index > 0) prev = state.chapters[index - 1];
      if (index < state.chapters.length - 1) next = state.chapters[index + 1];
    }
    setNav(qs('#rdr-prev'), prev);
    setNav(qs('#rdr-next'), next);
  }
  function updateCourseware(ch) {
    var m = state.manifest;
    var show = !!(m && m.courseware && ch && ch.cw);
    setVisible(qs('#rdr-courseware'), show);
  }

  function updateProgress() {
    var main = qs('#rdr-main');
    if (!main) return;
    var max = main.scrollHeight - main.clientHeight;
    var pct = max > 0 ? (main.scrollTop / max) * 100 : 0;
    var bar = qs('#rdr-progress');
    if (bar) bar.style.width = pct.toFixed(2) + '%';
    setVisible(qs('#rdr-back-top'), main.scrollTop > 400);
  }
  function saveScroll() {
    if (!state.current || !state.manifest) return;
    var main = qs('#rdr-main');
    if (!main) return;
    localStorage.setItem(bookPosKey(state.current.chapter.id), String(main.scrollTop));
  }

  // Read the numeric reading measure (em) from storage, mapping the old
  // narrow/standard/wide presets so existing readers keep their width.
  function readMeasure() {
    var raw = localStorage.getItem('reader_measure');
    var m;
    if (raw === 'narrow') m = 30;
    else if (raw === 'standard') m = 38;
    else if (raw === 'wide') m = 48;
    else m = parseInt(raw, 10);
    if (isNaN(m)) m = MEASURE_DEFAULT;
    return Math.min(MEASURE_MAX, Math.max(MEASURE_MIN, m));
  }

  function applySettings() {
    var theme = localStorage.getItem('reader_theme') || THEMES[0];
    if (THEMES.indexOf(theme) === -1) theme = THEMES[0];
    var measure = readMeasure();
    var font = parseInt(localStorage.getItem('reader_font') || String(FONT_DEFAULT), 10);
    if (isNaN(font)) font = FONT_DEFAULT;
    font = Math.min(FONT_MAX, Math.max(FONT_MIN, font));
    state.font = font;
    state.measure = measure;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--rdr-measure', measure + 'em');
    document.documentElement.style.setProperty('--rdr-font-size', font + 'px');
    els('[data-theme]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
    });
    var label = qs('#rdr-font-label');
    if (label) label.textContent = font + 'px';
    var mlabel = qs('#rdr-measure-label');
    if (mlabel) mlabel.textContent = measure + 'em';
  }
  function adjustFont(delta) {
    state.font = Math.min(FONT_MAX, Math.max(FONT_MIN, state.font + delta));
    localStorage.setItem('reader_font', String(state.font));
    document.documentElement.style.setProperty('--rdr-font-size', state.font + 'px');
    var label = qs('#rdr-font-label');
    if (label) label.textContent = state.font + 'px';
  }
  function adjustMeasure(delta) {
    state.measure = Math.min(MEASURE_MAX, Math.max(MEASURE_MIN, state.measure + delta));
    localStorage.setItem('reader_measure', String(state.measure));
    document.documentElement.style.setProperty('--rdr-measure', state.measure + 'em');
    var label = qs('#rdr-measure-label');
    if (label) label.textContent = state.measure + 'em';
  }

  function wireStaticUi() {
    var settingsBtn = qs('#rdr-settings-btn');
    var settingsPanel = qs('#rdr-settings');
    function syncSettingsAria() {
      var open = document.body.classList.contains('rdr-settings-open');
      if (settingsBtn) settingsBtn.setAttribute('aria-expanded', String(open));
      if (settingsPanel) settingsPanel.setAttribute('aria-hidden', String(!open));
    }
    if (settingsBtn) settingsBtn.addEventListener('click', function () {
      document.body.classList.toggle('rdr-settings-open');
      syncSettingsAria();
    });
    var minus = qs('#rdr-font-minus');
    if (minus) minus.addEventListener('click', function () { adjustFont(-FONT_STEP); });
    var plus = qs('#rdr-font-plus');
    if (plus) plus.addEventListener('click', function () { adjustFont(FONT_STEP); });

    els('[data-theme]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var value = btn.getAttribute('data-theme');
        if (THEMES.indexOf(value) === -1) return;
        localStorage.setItem('reader_theme', value);
        document.documentElement.setAttribute('data-theme', value);
        els('[data-theme]').forEach(function (b) { b.classList.toggle('active', b === btn); });
      });
    });
    var mMinus = qs('#rdr-measure-minus');
    if (mMinus) mMinus.addEventListener('click', function () { adjustMeasure(-MEASURE_STEP); });
    var mPlus = qs('#rdr-measure-plus');
    if (mPlus) mPlus.addEventListener('click', function () { adjustMeasure(MEASURE_STEP); });

    var backTop = qs('#rdr-back-top');
    if (backTop) backTop.addEventListener('click', function () {
      var main = qs('#rdr-main');
      if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    });
    var main = qs('#rdr-main');
    if (main) main.addEventListener('scroll', updateProgress);

    // Chapter nav (topbar): navigate via JS so scroll is saved first.
    ['#rdr-prev', '#rdr-next'].forEach(function (sel) {
      var btn = qs(sel);
      if (!btn) return;
      btn.addEventListener('click', function (event) {
        var href = btn.getAttribute('href');
        if (btn.hasAttribute('disabled') || !href) { event.preventDefault(); return; }
        event.preventDefault();
        saveScroll();
        window.location.href = href;
      });
    });

    // Safety net: save scroll before ANY same-site link (TOC, courseware…).
    document.addEventListener('click', function (event) {
      var target = event.target;
      var link = target && target.closest ? target.closest('a[href]') : null;
      if (link) saveScroll();
    });
    window.addEventListener('beforeunload', saveScroll);

    // 键盘导航：←/→ 切换上一章/下一章（输入框、弹层打开时忽略，避免与课件作答冲突）
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      var target = event.target;
      var tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (target && target.isContentEditable)) return;
      if (document.body.classList.contains('rdr-settings-open')) return;
      if (document.body.classList.contains('rdr-lcol-expanded') ||
          document.body.classList.contains('rdr-rcol-expanded')) return;
      var btn = qs(event.key === 'ArrowLeft' ? '#rdr-prev' : '#rdr-next');
      if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('href')) {
        event.preventDefault();
        saveScroll();
        window.location.href = btn.getAttribute('href');
      }
    });
  }

  // ---------- 设置面板登录/登出行 ----------
  function renderAuthRow() {
    var row = qs('#rdr-auth-row');
    if (!row) return;
    AUTH.getProfile().then(function (user) {
      if (user) {
        row.innerHTML = '<span class="rdr-auth-user">' +
          escapeHtml((user.user && (user.user.nickname || user.user.email)) || '') +
          '</span><button type="button" id="rdr-logout-btn">登出</button>';
        var out = qs('#rdr-logout-btn');
        if (out) out.addEventListener('click', function () {
          AUTH.logout();
          renderAuthRow();
          // 登出后重新渲染课件面板（会回到锁屏）
          if (state.current && state.current.chapter && state.current.chapter.cw) {
            renderCourseware(state.current.chapter.cw);
          }
        });
      } else {
        row.innerHTML = '<button type="button" id="rdr-login-btn">登录</button>';
        var login = qs('#rdr-login-btn');
        if (login) login.addEventListener('click', function () {
          AUTH.openLoginModal(function () {
            renderAuthRow();
            if (state.current && state.current.chapter && state.current.chapter.cw) {
              renderCourseware(state.current.chapter.cw);
            }
          });
        });
      }
    });
  }

  // ---------- Three-column layout ----------

  // Left TOC column is FIXED width (--rdr-lcol-w = 280px) — no divider, not draggable.
  var RCOL_MIN = 140;   // courseware floor — freely draggable, just enough to grab the divider
  var DIVIDER_W = 8;    // matches --rdr-divider-w
  var CENTER_MIN = 60;  // reading pane floor so it never collapses to 0

  // Right (courseware) column is fully free: it can grow to fill everything
  // right of the fixed TOC column. The max is viewport-dependent, so it is
  // computed live (the left TOC column is fixed width).
  function rcolMax() {
    var lw = document.body.classList.contains('rdr-lcol-collapsed') ? 0
      : (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--rdr-lcol-w'), 10) || 280);
    return Math.max(RCOL_MIN, window.innerWidth - lw - DIVIDER_W * 2 - CENTER_MIN);
  }

  var mqNarrow = window.matchMedia('(max-width: 1279px)');

  function isNarrow() { return mqNarrow.matches; }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function saveLayoutState() {
    var root = document.documentElement;
    try {
      var rw = parseInt(getComputedStyle(root).getPropertyValue('--rdr-rcol-w'), 10);
      localStorage.setItem('reader_rcol_w', String(isFinite(rw) && rw ? rw : 360));
      localStorage.setItem('reader_lcol_collapsed', String(document.body.classList.contains('rdr-lcol-collapsed')));
      localStorage.setItem('reader_rcol_collapsed', String(document.body.classList.contains('rdr-rcol-collapsed')));
    } catch (e) { /* localStorage unavailable */ }
  }

  function restoreLayoutState() {
    var root = document.documentElement;
    function read(key, fallback) {
      try {
        var v = localStorage.getItem(key);
        return v == null ? fallback : v;
      } catch (e) { return fallback; }
    }
    var rw = parseInt(read('reader_rcol_w', '360'), 10);
    if (isFinite(rw)) root.style.setProperty('--rdr-rcol-w', clamp(rw, RCOL_MIN, rcolMax()) + 'px');
    if (!isNarrow()) {
      document.body.classList.toggle('rdr-lcol-collapsed', read('reader_lcol_collapsed', 'false') === 'true');
      document.body.classList.toggle('rdr-rcol-collapsed', read('reader_rcol_collapsed', 'false') === 'true');
    }
  }

  function setColCollapsed(cls, collapsed) {
    document.body.classList.toggle(cls, collapsed);
    saveLayoutState();
    syncColAria();
  }

  function syncColAria() {
    syncTopbarAria();
  }

  function syncTopbarAria() {
    var body = document.body;
    var menu = qs('#rdr-menu');
    var cw = qs('#rdr-courseware');
    if (isNarrow()) {
      if (menu) menu.setAttribute('aria-expanded', String(body.classList.contains('rdr-lcol-expanded')));
      if (cw) cw.setAttribute('aria-expanded', String(body.classList.contains('rdr-rcol-expanded')));
    } else {
      if (menu) menu.setAttribute('aria-expanded', String(!body.classList.contains('rdr-lcol-collapsed')));
      if (cw) cw.setAttribute('aria-expanded', String(!body.classList.contains('rdr-rcol-collapsed')));
    }
  }

  function syncDividerAria() {
    var root = document.documentElement;
    var rw = parseInt(getComputedStyle(root).getPropertyValue('--rdr-rcol-w'), 10) || 360;
    var max = rcolMax();
    var dr = qs('#rdr-divider-cr');
    if (dr) {
      dr.setAttribute('aria-valuemin', String(RCOL_MIN));
      dr.setAttribute('aria-valuemax', String(max));
      dr.setAttribute('aria-valuenow', String(clamp(rw, RCOL_MIN, max)));
    }
  }

  function wireColToggles() {
    // Collapse buttons removed from column headers; toggling is handled
    // by the topbar (#rdr-menu for the TOC column, #rdr-courseware for the
    // courseware column). Center column is not collapsible.
  }

  function syncScrim() {
    var scrim = qs('#rdr-scrim');
    if (!scrim) return;
    var open = document.body.classList.contains('rdr-lcol-expanded') ||
               document.body.classList.contains('rdr-rcol-expanded');
    if (open) scrim.removeAttribute('hidden');
    else scrim.setAttribute('hidden', '');
  }

  function wireTopbarToggles() {
    var menu = qs('#rdr-menu');
    if (menu) menu.addEventListener('click', function () {
      if (isNarrow()) {
        document.body.classList.toggle('rdr-lcol-expanded');
      } else {
        setColCollapsed('rdr-lcol-collapsed', !document.body.classList.contains('rdr-lcol-collapsed'));
      }
      syncTopbarAria();
      syncScrim();
    });
    var cw = qs('#rdr-courseware');
    if (cw) cw.addEventListener('click', function () {
      if (isNarrow()) {
        document.body.classList.toggle('rdr-rcol-expanded');
      } else {
        setColCollapsed('rdr-rcol-collapsed', !document.body.classList.contains('rdr-rcol-collapsed'));
      }
      syncTopbarAria();
      syncScrim();
    });
    mqNarrow.addEventListener('change', function () {
      if (isNarrow()) {
        document.body.classList.remove('rdr-lcol-expanded', 'rdr-rcol-expanded');
        document.body.classList.remove('rdr-lcol-collapsed', 'rdr-rcol-collapsed');
      } else {
        document.body.classList.remove('rdr-lcol-expanded', 'rdr-rcol-expanded');
        restoreLayoutState();
      }
      syncColAria();
      syncTopbarAria();
      syncScrim();
    });
  }

  function wireDrawerClose() {
    var leftClose = qs('#rdr-sidebar .rdr-drawer-close');
    if (leftClose) leftClose.addEventListener('click', function () {
      document.body.classList.remove('rdr-lcol-expanded');
      syncTopbarAria();
      syncScrim();
    });
    var rightClose = qs('#rdr-courseware-panel .rdr-drawer-close');
    if (rightClose) rightClose.addEventListener('click', function () {
      document.body.classList.remove('rdr-rcol-expanded');
      syncTopbarAria();
      syncScrim();
    });
    var scrim = qs('#rdr-scrim');
    if (scrim) scrim.addEventListener('click', function () {
      document.body.classList.remove('rdr-lcol-expanded', 'rdr-rcol-expanded');
      syncTopbarAria();
      syncScrim();
    });
  }

  function wireDividerDrag() {
    var pairs = [
      ['#rdr-divider-cr', '--rdr-rcol-w', RCOL_MIN, rcolMax, -1]
    ];
    pairs.forEach(function (pair) {
      var divider = qs(pair[0]);
      if (!divider) return;
      var prop = pair[1], min = pair[2], maxFn = pair[3], dir = pair[4];
      divider.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        var root = document.documentElement;
        var startX = e.clientX;
        var startW = parseInt(getComputedStyle(root).getPropertyValue(prop), 10) || 0;
        document.body.classList.add('rdr-dragging');
        divider.setPointerCapture(e.pointerId);
        function move(ev) {
          // dir=+1: 分隔条往右拖 → 左栏变宽（正常）
          // dir=-1: 分隔条往右拖 → 右栏变窄（分隔条在中栏与右栏之间）
          var w = clamp(startW + dir * (ev.clientX - startX), min, maxFn());
          root.style.setProperty(prop, w + 'px');
          divider.setAttribute('aria-valuenow', String(w));
        }
        function up() {
          document.body.classList.remove('rdr-dragging');
          divider.removeEventListener('pointermove', move);
          divider.removeEventListener('pointerup', up);
          divider.removeEventListener('pointercancel', up);
          saveLayoutState();
          syncDividerAria();
        }
        divider.addEventListener('pointermove', move);
        divider.addEventListener('pointerup', up);
        divider.addEventListener('pointercancel', up);
      });
    });
  }

  function wireDividerKeyboard() {
    var pairs = [
      ['#rdr-divider-cr', '--rdr-rcol-w', RCOL_MIN, rcolMax, -1]
    ];
    pairs.forEach(function (pair) {
      var divider = qs(pair[0]);
      if (!divider) return;
      var prop = pair[1], min = pair[2], maxFn = pair[3], dir = pair[4];
      divider.addEventListener('keydown', function (e) {
        var root = document.documentElement;
        var current = parseInt(getComputedStyle(root).getPropertyValue(prop), 10) || 0;
        var next = current;
        if (e.key === 'ArrowLeft') next = current - 10 * dir;
        else if (e.key === 'ArrowRight') next = current + 10 * dir;
        else if (e.key === 'Home') next = min;
        else if (e.key === 'End') next = maxFn();
        else return;
        e.preventDefault();
        next = clamp(next, min, maxFn());
        root.style.setProperty(prop, next + 'px');
        divider.setAttribute('aria-valuenow', String(next));
        saveLayoutState();
      });
    });
  }

  function initLayout() {
    restoreLayoutState();
    wireColToggles();
    wireTopbarToggles();
    wireDrawerClose();
    wireDividerDrag();
    wireDividerKeyboard();
    syncDividerAria();
    syncColAria();
    syncTopbarAria();

    // Window shrink: pull the courseware back within the new max so the
    // reading pane is never crushed into negative space. Desktop only — on
    // narrow screens the courseware is a drawer with no drag bounds.
    window.addEventListener('resize', function () {
      if (isNarrow()) return;
      var root = document.documentElement;
      var rw = parseInt(getComputedStyle(root).getPropertyValue('--rdr-rcol-w'), 10) || 360;
      var max = rcolMax();
      if (isFinite(rw) && rw > max) {
        root.style.setProperty('--rdr-rcol-w', max + 'px');
        saveLayoutState();
        syncDividerAria();
      }
    });
  }

  // ---------- Courseware panel ----------

  function fetchCoursewareData(bookId) {
    if (state.coursewareData) return Promise.resolve(state.coursewareData);
    return fetch(bookId + '/courseware/assets/data/courseware.json')
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        state.coursewareData = data;
        return data;
      });
  }

  function findCoursewareChapter(data, cwId) {
    if (!data || !Array.isArray(data.parts)) return null;
    for (var i = 0; i < data.parts.length; i++) {
      var chapters = data.parts[i].chapters || [];
      for (var j = 0; j < chapters.length; j++) {
        if (chapters[j].id === cwId) return chapters[j];
      }
    }
    return null;
  }

  function answersKey(cwId) { return 'courseware_answers_' + cwId; }
  function progressKey() { return 'courseware_progress'; }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function renderCourseware(cwId) {
    var panel = qs('#rdr-cw-content');
    if (!panel) return;
    if (!AUTH.isLoggedIn()) {
      panel.innerHTML =
        '<div class="rdr-cw-lock">' +
        '<p class="rdr-cw-lock-title">登录后可查看互动课件并保存笔记</p>' +
        '<button type="button" class="rdr-cw-lock-btn" id="rdr-cw-login-btn">登录</button>' +
        '</div>';
      var loginBtn = panel.querySelector('#rdr-cw-login-btn');
      if (loginBtn) loginBtn.addEventListener('click', function () {
        AUTH.openLoginModal(function () {
          renderCourseware(cwId);
          renderAuthRow();   // 同步齿轮设置里的登录/登出行
        });
      });
      return;
    }
    var chapter = findCoursewareChapter(state.coursewareData, cwId);
    if (!chapter) {
      panel.innerHTML =
        '<div class="rdr-cw-empty"><div class="rdr-cw-empty-title">本章暂无课件内容</div>' +
        '<p>当前章节没有配套的互动课件。</p></div>';
      return;
    }
    var savedLocal = {};   // 已登录后端为准；不读跨用户的旧 courseware_answers 键
    var done = readJson(progressKey(), []);
    var doneFlag = done.indexOf(cwId) !== -1;
    var html = '';

    html += '<section class="rdr-cw-section">';
    html += '<h2 class="rdr-cw-section-title">概要</h2>';
    html += '<p class="rdr-cw-text">' + (escapeHtml(chapter.summary) || '本章暂无概要。') + '</p>';
    html += '</section>';

    if (chapter.scriptures && chapter.scriptures.length) {
      html += '<section class="rdr-cw-section"><h2 class="rdr-cw-section-title">核心经文</h2><ul class="rdr-cw-list">';
      chapter.scriptures.forEach(function (s) { html += '<li>' + escapeHtml(s) + '</li>'; });
      html += '</ul></section>';
    }

    if (chapter.keyTerms && chapter.keyTerms.length) {
      html += '<section class="rdr-cw-section"><h2 class="rdr-cw-section-title">关键术语</h2><ul class="rdr-cw-term-list">';
      chapter.keyTerms.forEach(function (t) { html += '<li class="rdr-cw-term-pill">' + escapeHtml(t) + '</li>'; });
      html += '</ul></section>';
    }

    if (chapter.outline && chapter.outline.length) {
      html += '<section class="rdr-cw-section"><h2 class="rdr-cw-section-title">本章大纲</h2><ol class="rdr-cw-outline-list">';
      chapter.outline.forEach(function (o) {
        var cls = o.level === 4 ? 'level-4' : 'level-3';
        html += '<li class="' + cls + '">' + escapeHtml(o.text) + '</li>';
      });
      html += '</ol></section>';
    }

    var qtypes = [['guided', '引导思考'], ['exploratory', '探索思考'], ['practical', '实践应用']];
    qtypes.forEach(function (qt) {
      var list = chapter.questions && chapter.questions[qt[0]];
      if (!list || !list.length) return;
      html += '<section class="rdr-cw-section"><h2 class="rdr-cw-section-title">' + qt[1] + '</h2>';
      list.forEach(function (q, qi) {
        var saved = (savedLocal[qt[0]] && savedLocal[qt[0]][qi]) ? savedLocal[qt[0]][qi] : '';
        html += '<div class="rdr-cw-question-card">';
        html += '<p class="rdr-cw-question-text">' + escapeHtml(q) + '</p>';
        html += '<textarea class="rdr-cw-answer-input" data-qtype="' + qt[0] + '" data-index="' + qi +
          '" rows="2" placeholder="写下你的思考…" aria-label="' + qt[1] + ' 第 ' + (qi + 1) + ' 题作答">' +
          escapeHtml(saved) + '</textarea>';
        html += '</div>';
      });
      html += '</section>';
    });

    html += '<section class="rdr-cw-section">';
    html += '<button class="rdr-cw-btn-done" type="button" data-cw="' + escapeHtml(cwId) + '" aria-pressed="' +
      (doneFlag ? 'true' : 'false') + '">' + (doneFlag ? '已标记完成' : '标记本章完成') + '</button>';
    html += '</section>';

    panel.innerHTML = html;
    AUTH.getProfile().then(function (user) {
      if (!user) return;
      function fillDraft() {
        panel.querySelectorAll('.rdr-cw-answer-input').forEach(function (input) {
          var qt = input.getAttribute('data-qtype');
          var qi = input.getAttribute('data-index');
          var draft = loadDraft(user.id, cwId, qt, qi);
          if (draft) input.value = draft;
        });
      }
      fetch(notesUrl(cwId), { headers: { Authorization: 'Bearer ' + AUTH.getToken() } })
        .then(function (r) { return r.ok ? r.json() : { notes: [] }; })
        .then(function (data) {
          var byKey = {};
          (data.notes || []).forEach(function (n) { byKey[n.question_type + ':' + n.question_index] = n.content; });
          panel.querySelectorAll('.rdr-cw-answer-input').forEach(function (input) {
            var qt = input.getAttribute('data-qtype');
            var qi = input.getAttribute('data-index');
            var server = byKey[qt + ':' + qi];
            if (typeof server === 'string' && server !== '') {
              input.value = server;
              clearDraft(user.id, cwId, qt, qi);
            }
          });
        })
        .catch(fillDraft);
      var timers = {};
      panel.querySelectorAll('.rdr-cw-answer-input').forEach(function (input) {
        var qt = input.getAttribute('data-qtype');
        var qi = input.getAttribute('data-index');
        input.addEventListener('input', function () {
          try { localStorage.setItem(draftKey(user.id, cwId, qt, qi), input.value); } catch (e) {}
        });
        input.addEventListener('change', function () {
          var text = input.value;
          var key = qt + ':' + qi;
          try { localStorage.setItem(draftKey(user.id, cwId, qt, qi), text); } catch (e) {}
          clearTimeout(timers[key]);
          timers[key] = setTimeout(function () {
            fetch('/api/courseware/notes', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AUTH.getToken() },
              body: JSON.stringify({ book: state.bookId || 'lordship_gospel', chapter: cwId, question_type: qt, question_index: Number(qi), content: text }),
            }).then(function (r) {
              if (r.ok) clearDraft(user.id, cwId, qt, qi);
            }).catch(function () { /* 保留草稿，下次 change 重试 */ });
          }, 600);
        });
      });
    });
    bindCwMarkDone(cwId);
  }

  function bindCwMarkDone(cwId) {
    var panel = qs('#rdr-cw-content');
    if (!panel) return;
    var btn = panel.querySelector('.rdr-cw-btn-done');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var done = readJson(progressKey(), []);
      var idx = done.indexOf(cwId);
      var pressed;
      if (idx === -1) { done.push(cwId); pressed = true; }
      else { done.splice(idx, 1); pressed = false; }
      try { localStorage.setItem(progressKey(), JSON.stringify(done)); } catch (e) { /* ignore */ }
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      btn.textContent = pressed ? '已标记完成' : '标记本章完成';
    });
  }

  function showCoursewareFor(cwId) {
    var panel = qs('#rdr-cw-content');
    if (!panel) return;
    var render = function () { renderCourseware(cwId); };
    if (state.coursewareData) { render(); return; }
    if (state.coursewareReady) {
      state.coursewareReady.then(render, render);
    } else {
      render();
    }
  }

  function initCoursewarePanel() {
    var panel = qs('#rdr-cw-content');
    if (!state.manifest || !state.manifest.courseware) {
      if (panel) panel.innerHTML =
        '<div class="rdr-cw-empty"><div class="rdr-cw-empty-title">本章暂无课件内容</div>' +
        '<p>当前书目未配置互动课件。</p></div>';
      return;
    }
    state.coursewareReady = fetchCoursewareData(state.bookId)
      .catch(function () { /* placeholder is rendered by renderCourseware */ });
  }

  async function init() {
    applySettings();
    renderAuthRow();
    wireStaticUi();
    initLayout();
    var params = new URLSearchParams(window.location.search);
    state.bookId = params.get('book');
    if (!state.bookId) {
      renderError('缺少书目参数（?book=<id>）。请从书目页面进入阅读器。');
      return;
    }
    try {
      var manifest = await fetchManifest();
      state.manifest = manifest;
      state.chapters = flattenChapters(manifest);
      document.title = manifest.title || state.bookId;
      var titleEl = qs('#rdr-title');
      if (titleEl) titleEl.textContent = manifest.title || state.bookId;
      renderToc(null);   // cover mode: sidebar TOC with no active chapter
      updateNav();
      updateCourseware(null);
      initCoursewarePanel();
      var index = findChapterIndex(params.get('ch'));
      if (index >= 0) {
        state.current = { index: index, chapter: state.chapters[index].chapter };
        updateNav();
        updateCourseware(state.current.chapter);
        await renderChapter();
      } else {
        renderCover();
        showCoursewareFor(null);
      }
    } catch (err) {
      renderError('无法加载书目：' + (err && err.message ? err.message : String(err)));
    }
  }

  // Self-initialize; works before or after DOM ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
