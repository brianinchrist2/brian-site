/**
 * courseware-panel.js
 * Split-view courseware panel for the book reader.
 * Auto-creates panel DOM, fetches courseware.json, renders chapter data,
 * persists answers and panel state to localStorage.
 *
 * Pattern: ES5 IIFE (matches reader.js)
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // LocalStorage helpers (same pattern as reader.js)
  // ---------------------------------------------------------------------------
  var store = (function () {
    try {
      var t = '__t';
      localStorage.setItem(t, t);
      localStorage.removeItem(t);
      return localStorage;
    } catch (e) {
      return null;
    }
  })();

  var get = function (k, d) {
    try {
      var v = store && store.getItem(k);
      return v === null || v === undefined ? d : v;
    } catch (e) {
      return d;
    }
  };

  var set = function (k, v) {
    try {
      store && store.setItem(k, v);
    } catch (e) {}
  };

  // ---------------------------------------------------------------------------
  // Module state
  // ---------------------------------------------------------------------------
  var coursewareData = null;
  var coursewareUrl = '';
  var chapterId = '';
  var fetchPromise = null;

  // Resize state
  var MIN_PANEL_W = 280;
  var MAX_PANEL_W = 600;

  // ---------------------------------------------------------------------------
  // Locale detection
  // ---------------------------------------------------------------------------
  function detectCoursewareUrl() {
    var path = window.location.pathname;
    if (path.indexOf('/en/') !== -1) {
      return '../../courseware/assets/data/courseware.json';
    }
    if (path.indexOf('/zh/') !== -1) {
      return '../../courseware/assets/data/courseware.json';
    }
    return '../courseware/assets/data/courseware.json';
  }

  // ---------------------------------------------------------------------------
  // Chapter detection
  // ---------------------------------------------------------------------------
  function detectChapterId() {
    var path = window.location.pathname;
    var segments = path.split('/');
    var filename = segments[segments.length - 1];
    if (!filename || filename === '') return '';
    return filename.replace(/\.html$/, '');
  }

  // ---------------------------------------------------------------------------
  // Find chapter in courseware data
  // ---------------------------------------------------------------------------
  function findChapter(data, id) {
    if (!data || !data.parts) return null;
    for (var i = 0; i < data.parts.length; i++) {
      var part = data.parts[i];
      if (!part.chapters) continue;
      for (var j = 0; j < part.chapters.length; j++) {
        if (part.chapters[j].id === id) {
          return part.chapters[j];
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // HTML escaping
  // ---------------------------------------------------------------------------
  function esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------------
  // Render panel content
  // ---------------------------------------------------------------------------
  function renderPanel(chapter) {
    var content = document.querySelector('.cw-panel-content');
    if (!content) return;

    // Update header title with chapter title
    var headerTitle = document.querySelector('.cw-panel-title');
    if (headerTitle && chapter && chapter.title) {
      headerTitle.textContent = chapter.title;
    }

    if (!chapter) {
      content.innerHTML = '<div class="cw-empty"><p>本章暂无课件内容</p></div>';
      return;
    }

    var html = '';

    // Summary
    if (chapter.summary) {
      html += '<div class="cw-panel-section">';
      html += '<h3 class="cw-panel-section-title">概要</h3>';
      html += '<p>' + esc(chapter.summary) + '</p>';
      html += '</div>';
    }

    // Scriptures
    if (chapter.scriptures && chapter.scriptures.length > 0) {
      html += '<div class="cw-panel-section">';
      html += '<h3 class="cw-panel-section-title">核心经文</h3>';
      for (var i = 0; i < chapter.scriptures.length; i++) {
        html += '<div class="cw-scripture">' + esc(chapter.scriptures[i]) + '</div>';
      }
      html += '</div>';
    }

    // Key Terms
    if (chapter.keyTerms && chapter.keyTerms.length > 0) {
      html += '<div class="cw-panel-section">';
      html += '<h3 class="cw-panel-section-title">关键术语</h3>';
      for (var k = 0; k < chapter.keyTerms.length; k++) {
        html += '<span class="cw-keyterm">' + esc(chapter.keyTerms[k]) + '</span>';
      }
      html += '</div>';
    }

    // Questions
    var questionIndex = 0;
    var hasQuestions = false;
    var questionTypes = [
      { key: 'guided', label: '引导性问题' },
      { key: 'exploratory', label: '探索性问题' },
      { key: 'practical', label: '本周实践挑战' }
    ];

    if (chapter.questions) {
      for (var t = 0; t < questionTypes.length; t++) {
        var arr = chapter.questions[questionTypes[t].key];
        if (arr && arr.length > 0) {
          hasQuestions = true;
          break;
        }
      }
    }

    if (hasQuestions) {
      html += '<div class="cw-panel-section">';
      html += '<h3 class="cw-panel-section-title">思考题</h3>';

      for (var qt = 0; qt < questionTypes.length; qt++) {
        var type = questionTypes[qt];
        var questions = chapter.questions[type.key];
        if (!questions || questions.length === 0) continue;

        html += '<div class="cw-question-type">';
        html += '<h4 class="cw-question-type-label">' + esc(type.label) + '</h4>';

        for (var q = 0; q < questions.length; q++) {
          var savedAnswer = get('cw_answer_' + chapterId + '_' + questionIndex, '');
          html += '<div class="cw-question-item" data-chapter="' + esc(chapterId) + '" data-index="' + questionIndex + '">';
          html += '<div class="cw-question-text">' + esc(questions[q]) + '</div>';
          html += '<textarea class="cw-answer-textarea" placeholder="写下你的思考…" data-chapter="' + esc(chapterId) + '" data-index="' + questionIndex + '">' + esc(savedAnswer) + '</textarea>';
          html += '</div>';
          questionIndex++;
        }

        html += '</div>';
      }

      html += '</div>';
    }

    content.innerHTML = html;

    // Wire textarea events and auto-resize
    var textareas = content.querySelectorAll('.cw-answer-textarea');
    for (var ta = 0; ta < textareas.length; ta++) {
      autoResize(textareas[ta]);
      textareas[ta].addEventListener('input', onTextareaInput);
    }
  }

  // ---------------------------------------------------------------------------
  // Textarea auto-resize
  // ---------------------------------------------------------------------------
  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function onTextareaInput(e) {
    var el = e.target || e.srcElement;
    autoResize(el);
    var ch = el.getAttribute('data-chapter');
    var idx = el.getAttribute('data-index');
    set('cw_answer_' + ch + '_' + idx, el.value);
  }

  // ---------------------------------------------------------------------------
  // Loading / Error / Empty states
  // ---------------------------------------------------------------------------
  function showLoading() {
    var content = document.querySelector('.cw-panel-content');
    if (content) {
      content.innerHTML =
        '<div class="cw-loading">' +
          '<div class="cw-loading-pulse"></div>' +
          '<p>加载课件…</p>' +
        '</div>';
    }
  }

  function showError() {
    var content = document.querySelector('.cw-panel-content');
    if (content) {
      content.innerHTML =
        '<div class="cw-error">' +
          '<p>课件加载失败</p>' +
          '<button onclick="cwRetry()">重试</button>' +
        '</div>';
    }
  }

  // ---------------------------------------------------------------------------
  // Fetch + cache
  // ---------------------------------------------------------------------------
  function fetchCourseware() {
    if (fetchPromise) return fetchPromise;

    showLoading();

    fetchPromise = fetch(coursewareUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        coursewareData = data;
        return data;
      })
      .catch(function (err) {
        fetchPromise = null;
        throw err;
      });

    return fetchPromise;
  }

  // ---------------------------------------------------------------------------
  // Retry (exposed globally)
  // ---------------------------------------------------------------------------
  window.cwRetry = function () {
    coursewareData = null;
    fetchPromise = null;
    openAndRender();
  };

  // ---------------------------------------------------------------------------
  // Open and render
  // ---------------------------------------------------------------------------
  function openAndRender() {
    if (coursewareData) {
      var chapter = findChapter(coursewareData, chapterId);
      renderPanel(chapter);
    } else {
      fetchCourseware()
        .then(function (data) {
          var chapter = findChapter(data, chapterId);
          renderPanel(chapter);
        })
        .catch(function () {
          showError();
        });
    }
  }

  // ---------------------------------------------------------------------------
  // Panel toggle
  // ---------------------------------------------------------------------------
  function cwTogglePanel() {
    var panel = document.getElementById('cwPanel');
    var sidebar = document.querySelector('.sidebar');
    var layout = document.querySelector('.layout');
    var outline = document.querySelector('.outline');
    var overlay = document.getElementById('cwOverlay');

    if (!panel) return;

    var isOpen = panel.classList.contains('open');

    if (isOpen) {
      // Close
      panel.classList.remove('open');
      panel.classList.add('closed');
      if (sidebar) sidebar.classList.remove('collapsed');
      if (layout) layout.classList.remove('cw-active');
      if (outline) outline.classList.remove('hidden-by-cw');
      if (overlay) overlay.classList.add('hidden');
      set('cw_panel_open', 'closed');
    } else {
      // Open
      panel.classList.remove('closed');
      panel.classList.add('open');
      if (sidebar) sidebar.classList.add('collapsed');
      if (layout) layout.classList.add('cw-active');
      if (outline) outline.classList.add('hidden-by-cw');
      if (overlay) overlay.classList.remove('hidden');
      set('cw_panel_open', 'open');
      openAndRender();
    }
  }

  // ---------------------------------------------------------------------------
  // Create panel DOM
  // ---------------------------------------------------------------------------
  function applyPanelWidth(w) {
    w = Math.max(MIN_PANEL_W, Math.min(MAX_PANEL_W, w));
    document.documentElement.style.setProperty('--cw-panel-w', w + 'px');
    set('cw_panel_width', String(w));
  }

  function createPanelDOM() {
    // Panel container
    var panel = document.createElement('div');
    panel.className = 'cw-panel closed';
    panel.id = 'cwPanel';

    // Resize handle (inserted as first child for left-edge positioning)
    var handle = document.createElement('div');
    handle.className = 'cw-panel-resize-handle';
    panel.appendChild(handle);

    // Header
    var header = document.createElement('div');
    header.className = 'cw-panel-header';

    var title = document.createElement('span');
    title.className = 'cw-panel-title';
    title.textContent = '课件';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'cw-panel-close';
    closeBtn.setAttribute('data-cw-close', '');
    closeBtn.textContent = '\u2715';

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Content area
    var content = document.createElement('div');
    content.className = 'cw-panel-content';

    panel.appendChild(header);
    panel.appendChild(content);

    // Overlay
    var overlay = document.createElement('div');
    overlay.className = 'cw-overlay hidden';
    overlay.id = 'cwOverlay';
    overlay.setAttribute('data-cw-close', '');

    document.body.appendChild(panel);
    document.body.appendChild(overlay);
  }

  // ---------------------------------------------------------------------------
  // Resize handle — mouse drag
  // ---------------------------------------------------------------------------
  function initResizeHandle() {
    var handle = document.querySelector('.cw-panel-resize-handle');
    var panel = document.getElementById('cwPanel');
    if (!handle || !panel) return;

    var isDragging = false;
    var startX = 0, startW = 0;

    function onStart(e) {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX || (e.touches && e.touches[0].clientX);
      startW = panel.offsetWidth;
      panel.classList.add('resizing');
      handle.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    function onMove(e) {
      if (!isDragging) return;
      var cx = e.clientX || (e.touches && e.touches[0].clientX);
      if (cx === undefined) return;
      var newW = startW + (startX - cx);
      applyPanelWidth(newW);
    }

    function onEnd() {
      isDragging = false;
      panel.classList.remove('resizing');
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    handle.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);

    // Touch support
    handle.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ---------------------------------------------------------------------------
  // Wire events
  // ---------------------------------------------------------------------------
  function wireEvents() {
    // Courseware button in topbar
    var cwBtn = document.querySelector('.courseware-btn');
    if (cwBtn) {
      cwBtn.addEventListener('click', function (e) {
        e.preventDefault();
        cwTogglePanel();
      });
    }

    // Close buttons and overlay (created in createPanelDOM, now in DOM)
    var closeEls = document.querySelectorAll('[data-cw-close]');
    for (var i = 0; i < closeEls.length; i++) {
      closeEls[i].addEventListener('click', function (e) {
        e.preventDefault();
        var panel = document.getElementById('cwPanel');
        if (panel && panel.classList.contains('open')) {
          cwTogglePanel();
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    coursewareUrl = detectCoursewareUrl();
    chapterId = detectChapterId();

    // Restore saved panel width (or fall back to default 360px)
    var savedW = get('cw_panel_width', '');
    applyPanelWidth(savedW ? parseInt(savedW, 10) : 360);

    createPanelDOM();
    wireEvents();
    initResizeHandle();

    // Restore panel open/close state
    var savedState = get('cw_panel_open', 'closed');
    if (savedState === 'open') {
      setTimeout(function () {
        cwTogglePanel();
      }, 300);
    }
  }

  // ---------------------------------------------------------------------------
  // DOMContentLoaded
  // ---------------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
