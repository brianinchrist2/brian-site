window.Courseware = window.Courseware || {};
(function() {
  var C = window.Courseware;

  function renderDashboard() {
    var parts = C.getParts();
    var container = document.getElementById('parts-container');
    var completed = C.progress.get();
    var visited = C.progress.getVisited();
    var total = 0;
    for (var i = 0; i < parts.length; i++) {
      total += (parts[i].chapters || []).length;
    }
    var pct = total ? Math.round((completed.length / total) * 100) : 0;

    var bar = document.getElementById('progress-bar');
    if (bar) {
      bar.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', pct);
    }

    var statCompleted = document.getElementById('stat-completed');
    if (statCompleted) statCompleted.textContent = completed.length + '/' + total;
    var statPercent = document.getElementById('stat-percent');
    if (statPercent) statPercent.textContent = pct + '%';

    var html = '';
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      html += '<section class="part-card">';
      html += '<h2 class="section-title">' + C.escapeHtml(part.title) + '</h2>';
      html += '<div class="dashboard-grid">';
      for (var j = 0; j < (part.chapters || []).length; j++) {
        var ch = part.chapters[j];
        var isDone = completed.indexOf(ch.id) !== -1;
        var isVisited = !isDone && visited.indexOf(ch.id) !== -1;
        var cls = 'chapter-card';
        if (isDone) cls += ' done';
        else if (isVisited) cls += ' visited';
        html += '<div class="' + cls + '" onclick="location.href=\'chapter.html?c=' + encodeURIComponent(ch.id) + '\'">';
        html += '<span class="card-title">' + C.escapeHtml(ch.title) + '</span>';
        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; width: 100%;">';
        html += '<span class="card-meta" style="margin-top: 0;">';
        if (isDone) html += '✓ 已完成';
        else if (isVisited) html += '◎ 已浏览';
        else html += '开始学习';
        html += '</span>';
        html += '<a href="' + ch.href + '" class="card-read-link" onclick="event.stopPropagation();" style="font-size: 12px; color: var(--accent); font-family: var(--font-ui); text-decoration: none; font-weight: 500;" onmouseover="this.style.textDecoration=\'underline\'; this.style.color=\'var(--accent-ink)\'" onmouseout="this.style.textDecoration=\'none\'; this.style.color=\'var(--accent)\'">阅读正文 &rarr;</a>';
        html += '</div>';
        html += '</div>';
      }
      html += '</div></section>';
    }
    container.innerHTML = html;

    var resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) {
      var lastChapter = C.stats.getLastChapter();
      var next = lastChapter ? C.getChapter(lastChapter) : null;
      if (!next) next = C.getNextIncompleteChapter(completed);
      if (next) {
        var span = resumeBtn.querySelector('.btn-primary');
        if (span) span.textContent = '继续学习：' + next.title;
        resumeBtn.href = 'chapter.html?c=' + encodeURIComponent(next.id);
        resumeBtn.style.display = 'inline-flex';
      } else {
        resumeBtn.style.display = 'none';
      }
    }
  }

  function updateStats() {
    var s = C.stats.get();
    var visited = C.progress.getVisited();
    var total = 0;
    var parts = C.getParts();
    for (var i = 0; i < parts.length; i++) {
      total += (parts[i].chapters || []).length;
    }
    var el = document.getElementById('stat-minutes');
    if (el) el.textContent = Math.round(s.minutes || 0);
    var visEl = document.getElementById('stat-visited');
    if (visEl) visEl.textContent = visited.length + '/' + total;
  }

  function setupExportActions() {
    var mdBtn = document.getElementById('export-md');
    if (mdBtn) mdBtn.addEventListener('click', C.exportMarkdown);
    var txtBtn = document.getElementById('export-txt');
    if (txtBtn) txtBtn.addEventListener('click', C.exportText);
  }

  function setupTimeTracking() {
    C.stats.recordVisit();
    window.addEventListener('beforeunload', function() {
      C.stats.recordLeave();
    });
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        C.stats.pauseVisit();
      } else {
        C.stats.resumeVisit();
      }
    });
  }

  try {
    renderDashboard();
    updateStats();
    setupExportActions();
    setupTimeTracking();
  } catch (err) {
    console.error(err);
    var container = document.getElementById('parts-container');
    if (container) container.innerHTML = '<p class="error">课件数据加载失败，请确认已运行 build_courseware.py</p>';
  }
})();
