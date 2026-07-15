window.Courseware = window.Courseware || {};
(function() {
  var C = window.Courseware;

  function renderChapter(chapter) {
    var part = C.getPartForChapter(chapter.id);
    var partTitle = part ? part.title : '';

    var header = document.getElementById('chapter-header');
    if (header) {
      header.innerHTML = '<div class="chapter-kicker">' + C.escapeHtml(partTitle) + '</div>' +
        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; width: 100%;">' +
        '<h1 class="chapter-title" style="margin-bottom: 0; flex: 1; min-width: 200px;">' + C.escapeHtml(chapter.title) + '</h1>' +
        '<a href="' + chapter.href + '" class="btn-primary" style="padding: 6px 16px; font-size: 14px; font-weight: 500; font-family: var(--font-ui); border-radius: var(--radius-pill); background-color: var(--accent); color: #fff; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; height: 36px; white-space: nowrap;" onmouseover="this.style.backgroundColor=\'var(--accent-ink)\'" onmouseout="this.style.backgroundColor=\'var(--accent)\'">阅读正文 &rarr;</a>' +
        '</div>';
    }

    var summary = document.getElementById('chapter-summary');
    if (summary) {
      summary.innerHTML = chapter.summary
        ? '<h2>本章概要</h2><p>' + C.escapeHtml(chapter.summary) + '</p>'
        : '<p class="muted">（本章暂无概要）</p>';
    }

    var scriptures = document.getElementById('scriptures');
    if (scriptures) {
      if (chapter.scriptures && chapter.scriptures.length) {
        var sHtml = '<h2>核心经文</h2><ul>';
        for (var i = 0; i < chapter.scriptures.length; i++) {
          sHtml += '<li>' + C.escapeHtml(chapter.scriptures[i]) + '</li>';
        }
        scriptures.innerHTML = sHtml + '</ul>';
      } else {
        scriptures.innerHTML = '';
      }
    }

    var keyTerms = document.getElementById('key-terms');
    if (keyTerms) {
      if (chapter.keyTerms && chapter.keyTerms.length) {
        var tHtml = '<h2>关键术语</h2><div class="term-list">';
        for (var i = 0; i < chapter.keyTerms.length; i++) {
          tHtml += '<span class="term-pill">' + C.escapeHtml(chapter.keyTerms[i]) + '</span>';
        }
        keyTerms.innerHTML = tHtml + '</div>';
      } else {
        keyTerms.innerHTML = '';
      }
    }

    var outline = document.getElementById('outline');
    if (outline) {
      if (chapter.outline && chapter.outline.length) {
        var oHtml = '<h2>本章大纲</h2><ul>';
        for (var i = 0; i < chapter.outline.length; i++) {
          oHtml += '<li class="level-' + String(chapter.outline[i].level) + '">' + C.escapeHtml(chapter.outline[i].text) + '</li>';
        }
        outline.innerHTML = oHtml + '</ul>';
      } else {
        outline.innerHTML = '';
      }
    }

    var questions = document.getElementById('questions');
    if (questions && chapter.questions) {
      var saved = C.answers.get(chapter.id);
      var qHtml = '<h2>思考问题</h2>';
      var qIndex = 0;
      var types = [
        { key: 'guided', label: '引导性问题' },
        { key: 'exploratory', label: '探索性问题' },
        { key: 'practical', label: '本周实践挑战' },
      ];
      for (var t = 0; t < types.length; t++) {
        var items = chapter.questions[types[t].key] || [];
        if (items.length) {
          qHtml += '<h3>' + types[t].label + '</h3>';
          for (var i = 0; i < items.length; i++) {
            var idx = qIndex++;
            qHtml += '<div class="question-card">' +
              '<p class="question-text" id="q-' + chapter.id + '-' + idx + '">' + C.escapeHtml(items[i]) + '</p>' +
              '<textarea class="answer-input" data-index="' + idx + '" rows="4" ' +
              'aria-labelledby="q-' + chapter.id + '-' + idx + '" ' +
              'placeholder="在此输入你的回答…">' + C.escapeHtml(saved[idx] || '') + '</textarea>' +
              '</div>';
          }
        }
      }
      questions.innerHTML = qHtml;
    }

    var adjacent = C.getAdjacentChapter(chapter.id);
    var nav = document.getElementById('prev-next');
    if (nav) {
      var navHtml = '';
      navHtml += adjacent.prev
        ? '<a class="nav-btn" href="chapter.html?c=' + encodeURIComponent(adjacent.prev.id) + '">← ' + C.escapeHtml(adjacent.prev.title) + '</a>'
        : '<span></span>';
      navHtml += '<a class="nav-btn" href="index.html">目录</a>';
      navHtml += adjacent.next
        ? '<a class="nav-btn" href="chapter.html?c=' + encodeURIComponent(adjacent.next.id) + '">' + C.escapeHtml(adjacent.next.title) + ' →</a>'
        : '<span></span>';
      nav.innerHTML = navHtml;
    }

    var markBtn = document.getElementById('mark-done');
    if (markBtn) {
      updateMarkDoneButton(markBtn, chapter.id);
    }
  }

  function bindInteractions(chapterId) {
    document.querySelectorAll('.answer-input').forEach(function(textarea) {
      textarea.addEventListener('input', function() {
        var idx = textarea.getAttribute('data-index');
        C.answers.save(chapterId, idx, textarea.value);
      });
    });

    var markBtn = document.getElementById('mark-done');
    if (markBtn) {
      markBtn.addEventListener('click', function() {
        if (C.progress.isDone(chapterId)) {
          C.progress.markUndone(chapterId);
        } else {
          C.progress.markDone(chapterId);
        }
        updateMarkDoneButton(markBtn, chapterId);
      });
    }
  }

  function updateMarkDoneButton(btn, chapterId) {
    if (C.progress.isDone(chapterId)) {
      btn.textContent = '取消完成标记';
      btn.classList.add('done');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.textContent = '标记本章完成';
      btn.classList.remove('done');
      btn.setAttribute('aria-pressed', 'false');
    }
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
    var params = new URLSearchParams(location.search);
    var chapterId = params.get('c') || 'preface';
    var chapter = C.getChapter(chapterId);
    if (!chapter) {
      document.querySelector('main').innerHTML = '<p class="error">未找到该章节</p>';
    } else {
      renderChapter(chapter);
      bindInteractions(chapterId);
      C.progress.markVisited(chapterId);
      C.stats.setLastChapter(chapterId);
    }
    setupTimeTracking();
  } catch (err) {
    console.error(err);
    document.querySelector('main').innerHTML = '<p class="error">课件数据加载失败</p>';
  }
})();
