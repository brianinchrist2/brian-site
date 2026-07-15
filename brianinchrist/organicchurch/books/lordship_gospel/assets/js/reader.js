(function () {
  var root = document.documentElement;
  var page = window.location.pathname.split('/').pop() || 'index.html';
  var store = (function () {
    try { var t = '__t'; localStorage.setItem(t, t); localStorage.removeItem(t); return localStorage; }
    catch (e) { return null; }
  })();
  var get = function (k, d) { try { var v = store && store.getItem(k); return v === null || v === undefined ? d : v; } catch (e) { return d; } };
  var set = function (k, v) { try { store && store.setItem(k, v); } catch (e) {} };

  /* ---------- Reading preferences ---------- */
  var FONT_MIN = 16, FONT_MAX = 24;
  function applyFont(px) { root.style.setProperty('--reading-font', px + 'px'); }
  function applyMeasure(px) { root.style.setProperty('--reading-measure', px); }
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    document.querySelectorAll('[data-theme-opt]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-theme-opt') === t);
    });
  }

  var curFont = parseInt(get('reader_font', '19'), 10);
  var curMeasure = get('reader_measure', '720px');
  var curTheme = get('reader_theme', 'light');
  applyFont(curFont); applyMeasure(curMeasure); applyTheme(curTheme);

  function syncControls() {
    var fv = document.getElementById('fontVal');
    if (fv) fv.textContent = curFont + ' px';
    document.querySelectorAll('[data-measure-opt]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-measure-opt') === curMeasure);
    });
  }

  window.readerSetTheme = function (t) { curTheme = t; applyTheme(t); set('reader_theme', t); };
  window.readerStepFont = function (d) {
    curFont = Math.max(FONT_MIN, Math.min(FONT_MAX, curFont + d));
    applyFont(curFont); set('reader_font', String(curFont)); syncControls();
  };
  window.readerSetMeasure = function (m) { curMeasure = m; applyMeasure(m); set('reader_measure', m); syncControls(); };

  /* settings popover */
  window.toggleSettings = function (ev) {
    if (ev) ev.stopPropagation();
    var p = document.getElementById('settingsPanel');
    var b = document.getElementById('settingsBtn');
    if (!p) return;
    var open = p.classList.toggle('open');
    if (b) b.classList.toggle('open', open);
    syncControls();
  };
  document.addEventListener('click', function (e) {
    var p = document.getElementById('settingsPanel');
    if (!p || !p.classList.contains('open')) return;
    if (!p.contains(e.target) && e.target.id !== 'settingsBtn') {
      p.classList.remove('open');
      var b = document.getElementById('settingsBtn'); if (b) b.classList.remove('open');
    }
  });

  /* ---------- Sidebar (mobile) ---------- */
  window.toggleSidebar = function () {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('active');
  };
  window.closeSidebar = function () {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
  };

  /* ---------- Progress + back-to-top ---------- */
  var bar = document.getElementById('progress-bar');
  var toTop = document.getElementById('backToTop');
  function onScroll() {
    var st = window.scrollY || document.documentElement.scrollTop;
    var dh = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (dh > 0 ? (st / dh) * 100 : 0) + '%';
    if (toTop) toTop.classList.toggle('visible', st > 360);
    set('book_pos_' + page, st);
    if (page && page !== 'index.html') { set('reader_last_page', page); }
  }
  window.scrollToTop = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); };

  /* ---------- In-chapter outline + scroll-spy ---------- */
  function buildOutline() {
    var aside = document.getElementById('outline');
    if (!aside) return;
    var heads = Array.prototype.slice.call(
      document.querySelectorAll('.body-text h2, .body-text h3:not(.chapter-epigraph)')
    );
    if (heads.length < 2) { aside.style.display = 'none'; return; }
    var html = '<div class="outline-title">本章导航</div>';
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'sec-' + (i + 1);
      html += '<a class="outline-link" href="#' + h.id + '" data-i="' + i + '">' + h.textContent + '</a>';
    });
    aside.innerHTML = html;
    aside.style.display = 'block';

    var links = aside.querySelectorAll('.outline-link');
    var spy = function () {
      var pos = window.scrollY + 100, cur = 0;
      heads.forEach(function (h, i) { if (h.offsetTop <= pos) cur = i; });
      links.forEach(function (l) { l.classList.toggle('active', +l.getAttribute('data-i') === cur); });
    };
    window.addEventListener('scroll', spy, { passive: true });
    spy();
  }

  /* ---------- Resume (cover page) ---------- */
  function setupResume() {
    var el = document.getElementById('resumeLink');
    if (!el) return;
    var last = get('reader_last_page', '');
    if (last && last !== 'index.html') {
      var label = el.getAttribute('data-label') || '继续阅读';
      el.href = last;
      el.textContent = '↻ ' + label;
      el.style.display = 'block';
    }
  }

  /* ---------- restore scroll ---------- */
  function restoreScroll() {
    var pos = get('book_pos_' + page, null);
    if (pos !== null) window.scrollTo(0, parseInt(pos, 10));
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 1024) { window.closeSidebar(); }
  });
  window.addEventListener('DOMContentLoaded', function () { buildOutline(); setupResume(); syncControls(); });
  window.addEventListener('load', function () { onScroll(); restoreScroll(); });
})();
