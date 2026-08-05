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

  var THEMES = ['light', 'sepia', 'dark'];
  var MEASURES = ['narrow', 'standard', 'wide'];
  var FONT_MIN = 14, FONT_MAX = 26, FONT_STEP = 2, FONT_DEFAULT = 18;

  var state = {
    bookId: null,   // manifest id from ?book=
    manifest: null, // parsed manifest
    chapters: [],   // flattened [{ part, chapter }] in reading order
    current: null,  // { index, chapter } of open chapter, or null
    font: FONT_DEFAULT
  };

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
    setNav(qs('#rdr-foot-prev'), prev);
    setNav(qs('#rdr-foot-next'), next);
  }
  function updateCourseware(ch) {
    var m = state.manifest;
    var show = !!(m && m.courseware && ch && ch.cw);
    var top = qs('#rdr-courseware');
    var foot = qs('#rdr-foot-courseware');
    setVisible(top, show);
    setVisible(foot, show);
    if (show) {
      var url = state.bookId + '/' + m.courseware + '?c=' + encodeURIComponent(ch.cw);
      if (top) top.setAttribute('href', url);
      if (foot) foot.setAttribute('href', url);
    }
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

  function applySettings() {
    var theme = localStorage.getItem('reader_theme') || THEMES[0];
    if (THEMES.indexOf(theme) === -1) theme = THEMES[0];
    var measure = localStorage.getItem('reader_measure') || MEASURES[1];
    if (MEASURES.indexOf(measure) === -1) measure = MEASURES[1];
    var font = parseInt(localStorage.getItem('reader_font') || String(FONT_DEFAULT), 10);
    if (isNaN(font)) font = FONT_DEFAULT;
    font = Math.min(FONT_MAX, Math.max(FONT_MIN, font));
    state.font = font;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-measure', measure);
    document.documentElement.style.setProperty('--rdr-font-size', font + 'px');
    els('[data-theme]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
    });
    els('[data-measure]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-measure') === measure);
    });
    var label = qs('#rdr-font-label');
    if (label) label.textContent = font + 'px';
  }
  function adjustFont(delta) {
    state.font = Math.min(FONT_MAX, Math.max(FONT_MIN, state.font + delta));
    localStorage.setItem('reader_font', String(state.font));
    document.documentElement.style.setProperty('--rdr-font-size', state.font + 'px');
    var label = qs('#rdr-font-label');
    if (label) label.textContent = state.font + 'px';
  }

  function wireStaticUi() {
    var menu = qs('#rdr-menu');
    if (menu) menu.addEventListener('click', function () { document.body.classList.toggle('rdr-sidebar-open'); });
    var settingsBtn = qs('#rdr-settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', function () { document.body.classList.toggle('rdr-settings-open'); });
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
    els('[data-measure]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var value = btn.getAttribute('data-measure');
        if (MEASURES.indexOf(value) === -1) return;
        localStorage.setItem('reader_measure', value);
        document.documentElement.setAttribute('data-measure', value);
        els('[data-measure]').forEach(function (b) { b.classList.toggle('active', b === btn); });
      });
    });

    var backTop = qs('#rdr-back-top');
    if (backTop) backTop.addEventListener('click', function () {
      var main = qs('#rdr-main');
      if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    });
    var main = qs('#rdr-main');
    if (main) main.addEventListener('scroll', updateProgress);

    // Chapter nav (topbar + footer): navigate via JS so scroll is saved first.
    ['#rdr-prev', '#rdr-next', '#rdr-foot-prev', '#rdr-foot-next'].forEach(function (sel) {
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
    var home = qs('#rdr-foot-home');
    if (home) home.addEventListener('click', function (event) {
      var href = home.getAttribute('href');
      if (!href) return;
      event.preventDefault();
      saveScroll();
      window.location.href = href;
    });

    // Safety net: save scroll before ANY same-site link (TOC, courseware…).
    document.addEventListener('click', function (event) {
      var target = event.target;
      var link = target && target.closest ? target.closest('a[href]') : null;
      if (link) saveScroll();
    });
    window.addEventListener('beforeunload', saveScroll);
  }

  async function init() {
    applySettings();
    wireStaticUi();
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
      var home = qs('#rdr-foot-home');
      if (home) home.setAttribute('href', bookUrl(null));
      renderToc(null);   // cover mode: sidebar TOC with no active chapter
      updateNav();
      updateCourseware(null);
      var index = findChapterIndex(params.get('ch'));
      if (index >= 0) {
        state.current = { index: index, chapter: state.chapters[index].chapter };
        updateNav();
        updateCourseware(state.current.chapter);
        await renderChapter();
      } else {
        renderCover();
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
