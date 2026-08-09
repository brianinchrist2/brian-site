/* post-viewer.js — single-post Markdown viewer
 *
 * Loads a post by ?id= from posts/<id>.md (frontmatter + GFM body), renders
 * it with the vendored marked (library/assets/js/marked.min.js), and shares
 * reader_theme / reader_measure / reader_font with the library reader so a
 * visitor's reading preferences carry across articles and books.
 *
 * Posts are public articles — deliberately NO courseware pane, TOC drawer,
 * login gate, or note sync (those belong to the library reader).
 */
(function () {
  'use strict';

  var THEMES = ['light', 'sepia', 'dark', 'olive'];
  var MEASURE_MIN = 26, MEASURE_MAX = 76, MEASURE_STEP = 2, MEASURE_DEFAULT = 38; // em
  var FONT_MIN = 14, FONT_MAX = 26, FONT_STEP = 2, FONT_DEFAULT = 18;

  function $(id) { return document.getElementById(id); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  var store = (function () {
    try { var k = '__pt'; localStorage.setItem(k, k); localStorage.removeItem(k); return localStorage; }
    catch (e) { return null; }
  })();
  function get(k, d) { try { var v = store && store.getItem(k); return v === null || v === undefined ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { store && store.setItem(k, v); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------------
  // URL / id
  // ------------------------------------------------------------------

  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  var postId = param('id');
  if (!postId || !/^\d+$/.test(postId)) {
    showError('缺少文章编号（URL 中需要 ?id=1234）。');
    return;
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderMarkdown(md) {
    if (window.marked && typeof window.marked.parse === 'function') {
      try { return window.marked.parse(md); } catch (e) { /* fall through */ }
    }
    return '<pre>' + escapeHtml(md) + '</pre>';
  }

  function stripFrontmatter(md) {
    return String(md).replace(/^﻿/, '').replace(/^---\n[\s\S]*?\n---\n?/, '');
  }

  function featuredSrc(path) {
    if (!path) return '';
    if (/^(https?:)?\/\//.test(path) || path.indexOf('/') === 0) return path;
    if (path.indexOf('../') === 0) return path;
    return '../' + path; // posts.json stores 'uploads/…' relative to organicchurch/
  }

  function formatDate(iso) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso || '');
    if (!m) return iso || '';
    return m[1] + '年' + (+m[2]) + '月' + (+m[3]) + '日';
  }

  function renderHeader(meta) {
    $('pt-eyebrow').textContent = meta.eyebrow || '';
    $('pt-title').textContent = meta.title || '';

    var metaEl = $('pt-meta');
    metaEl.innerHTML = '';
    var info = document.createElement('span');
    info.className = 'pt-author-info';
    var avatar = document.createElement('span');
    avatar.className = 'pt-author-avatar';
    avatar.textContent = (meta.author || '佚').charAt(0);
    var name = document.createElement('span');
    name.textContent = meta.author || '';
    info.appendChild(avatar);
    info.appendChild(name);
    metaEl.appendChild(info);

    if (meta.date) {
      var sep1 = document.createElement('span');
      sep1.className = 'pt-sep';
      sep1.textContent = '•';
      var time = document.createElement('time');
      time.dateTime = meta.date;
      time.textContent = formatDate(meta.date);
      metaEl.appendChild(sep1);
      metaEl.appendChild(time);
    }

    if (meta.categories && meta.categories.length) {
      var sep2 = document.createElement('span');
      sep2.className = 'pt-sep';
      sep2.textContent = '•';
      var cats = document.createElement('span');
      cats.className = 'pt-categories';
      meta.categories.forEach(function (c) {
        var tag = document.createElement('span');
        tag.className = 'pt-cat-tag';
        tag.textContent = c;
        cats.appendChild(tag);
      });
      metaEl.appendChild(sep2);
      metaEl.appendChild(cats);
    }

    var feat = $('pt-featured');
    var src = featuredSrc(meta.featured_image);
    if (src) {
      feat.hidden = false;
      feat.innerHTML = '';
      var img = document.createElement('img');
      img.src = src;
      img.alt = meta.title || '';
      img.loading = 'eager';
      img.onerror = function () { feat.hidden = true; feat.innerHTML = ''; };
      feat.appendChild(img);
    } else {
      feat.hidden = true;
      feat.innerHTML = '';
    }
  }

  function renderNav(entries, index) {
    var nav = $('pt-pagenav');
    nav.innerHTML = '';
    var prev = entries[index - 1];
    var next = entries[index + 1];

    function link(dir, entry, cssClass, label) {
      var a = document.createElement('a');
      a.className = 'pt-nav-link ' + cssClass;
      if (entry) {
        a.href = 'post.html?id=' + entry.id;
        var d = document.createElement('span');
        d.className = 'pt-nav-dir';
        d.textContent = label;
        var t = document.createElement('span');
        t.className = 'pt-nav-title';
        t.textContent = entry.title || '';
        a.appendChild(d);
        a.appendChild(t);
      } else {
        a.classList.add('is-disabled');
        var d2 = document.createElement('span');
        d2.className = 'pt-nav-dir';
        d2.textContent = label;
        a.appendChild(d2);
      }
      return a;
    }

    // entries are date-desc; index-1 is newer, index+1 is older.
    nav.appendChild(link('prev', prev, 'is-prev', '更新的文章'));
    nav.appendChild(link('next', next, 'is-next', '更早的文章'));
    nav.hidden = false;
  }

  function showError(msg) {
    var article = $('pt-article');
    if (!article) return;
    article.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'pt-error';
    box.innerHTML = '<p>' + escapeHtml(msg) + '</p>' +
      '<p style="margin-top:12px"><a href="../index.html">← 返回文章列表</a></p>';
    article.appendChild(box);
    $('pt-top-title').textContent = '文章';
  }

  // ------------------------------------------------------------------
  // Settings (shared keys with the library reader)
  // ------------------------------------------------------------------

  function readMeasure() {
    var raw = get('reader_measure');
    var m;
    if (raw === 'narrow') m = 30;
    else if (raw === 'standard') m = 38;
    else if (raw === 'wide') m = 48;
    else m = parseInt(raw, 10);
    if (isNaN(m)) m = MEASURE_DEFAULT;
    return Math.min(MEASURE_MAX, Math.max(MEASURE_MIN, m));
  }

  var state = { theme: THEMES[0], measure: MEASURE_DEFAULT, font: FONT_DEFAULT };

  function applySettings() {
    var theme = get('reader_theme', THEMES[0]);
    if (THEMES.indexOf(theme) === -1) theme = THEMES[0];
    state.theme = theme;
    state.measure = readMeasure();
    state.font = parseInt(get('reader_font', String(FONT_DEFAULT)), 10);
    if (isNaN(state.font)) state.font = FONT_DEFAULT;
    state.font = Math.min(FONT_MAX, Math.max(FONT_MIN, state.font));

    document.documentElement.setAttribute('data-theme', state.theme);
    document.documentElement.style.setProperty('--rdr-measure', state.measure + 'em');
    document.documentElement.style.setProperty('--rdr-font-size', state.font + 'px');

    $$('#pt-settings [data-theme]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme') === state.theme);
    });
    $('pt-font-label').textContent = state.font + 'px';
    $('pt-measure-label').textContent = state.measure + 'em';
  }

  function adjustFont(delta) {
    state.font = Math.min(FONT_MAX, Math.max(FONT_MIN, state.font + delta));
    set('reader_font', String(state.font));
    document.documentElement.style.setProperty('--rdr-font-size', state.font + 'px');
    $('pt-font-label').textContent = state.font + 'px';
  }

  function adjustMeasure(delta) {
    state.measure = Math.min(MEASURE_MAX, Math.max(MEASURE_MIN, state.measure + delta));
    set('reader_measure', String(state.measure));
    document.documentElement.style.setProperty('--rdr-measure', state.measure + 'em');
    $('pt-measure-label').textContent = state.measure + 'em';
  }

  function wireSettings() {
    $('pt-settings-btn').addEventListener('click', function () {
      var open = document.body.classList.toggle('pt-settings-open');
      this.classList.toggle('open', open);
      this.setAttribute('aria-expanded', String(open));
      $('pt-settings').setAttribute('aria-hidden', String(!open));
    });
    document.addEventListener('click', function (e) {
      var panel = $('pt-settings');
      if (!document.body.classList.contains('pt-settings-open')) return;
      if (!panel.contains(e.target) && e.target.id !== 'pt-settings-btn') {
        document.body.classList.remove('pt-settings-open');
        $('pt-settings-btn').classList.remove('open');
        $('pt-settings-btn').setAttribute('aria-expanded', 'false');
        $('pt-settings').setAttribute('aria-hidden', 'true');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.body.classList.remove('pt-settings-open');
        $('pt-settings-btn').classList.remove('open');
        $('pt-settings-btn').setAttribute('aria-expanded', 'false');
        $('pt-settings').setAttribute('aria-hidden', 'true');
      }
    });
    $('pt-font-minus').addEventListener('click', function () { adjustFont(-FONT_STEP); });
    $('pt-font-plus').addEventListener('click', function () { adjustFont(FONT_STEP); });
    $('pt-measure-minus').addEventListener('click', function () { adjustMeasure(-MEASURE_STEP); });
    $('pt-measure-plus').addEventListener('click', function () { adjustMeasure(MEASURE_STEP); });
    $$('#pt-settings [data-theme]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var value = btn.getAttribute('data-theme');
        if (THEMES.indexOf(value) === -1) return;
        set('reader_theme', value);
        document.documentElement.setAttribute('data-theme', value);
        $$('#pt-settings [data-theme]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });
  }

  // ------------------------------------------------------------------
  // Scroll chrome + keyboard nav
  // ------------------------------------------------------------------

  function wireScroll() {
    var bar = $('pt-progress');
    var backTop = $('pt-back-top');
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var st = window.scrollY || document.documentElement.scrollTop;
        var dh = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (dh > 0 ? (st / dh) * 100 : 0) + '%';
        backTop.classList.toggle('pt-show', st > 600);
      });
    }, { passive: true });
    backTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ← → flips to the newer / older article in the date-desc list.
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var sel = (e.key === 'ArrowLeft' ? '.pt-nav-link.is-prev:not(.is-disabled)' :
                 e.key === 'ArrowRight' ? '.pt-nav-link.is-next:not(.is-disabled)' : null);
      if (!sel) return;
      var link = document.querySelector(sel);
      if (link && link.href) {
        e.preventDefault();
        window.location.href = link.href;
      }
    });
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------

  async function load() {
    var index, meta, entries, indexOf;

    try {
      var resp = await fetch('posts.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      index = await resp.json();
    } catch (e) {
      showError('无法载入文章索引（posts.json）。');
      return;
    }

    entries = Array.isArray(index) ? index : [];
    entries.forEach(function (e, i) { if (String(e.id) === postId) { meta = e; indexOf = i; } });

    var mdResp, md;
    try {
      mdResp = await fetch(postId + '.md', { cache: 'no-cache' });
      if (!mdResp.ok) throw new Error('HTTP ' + mdResp.status);
      md = await mdResp.text();
    } catch (e) {
      if (meta) renderHeader(meta); // show meta even if the body is missing
      showError('无法载入文章正文（' + postId + '.md）。');
      return;
    }

    var title = (meta && meta.title) ? meta.title : '文章';
    document.title = title + ' - 有机教会';
    $('pt-top-title').textContent = title;

    if (meta) renderHeader(meta);
    $('pt-body').innerHTML = renderMarkdown(stripFrontmatter(md));
    if (meta && entries.length) renderNav(entries, indexOf);

    // Anchor links inside the body (if the source used any #fragments).
    var firstHash = window.location.hash;
    if (firstHash) {
      var target = document.querySelector(firstHash);
      if (target) setTimeout(function () { target.scrollIntoView(); }, 60);
    }
  }

  applySettings();
  wireSettings();
  wireScroll();
  load();
})();
