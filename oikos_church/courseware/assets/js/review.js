window.Courseware = window.Courseware || {};
(function() {
  var C = window.Courseware;

  function renderFlashcards() {
    var container = document.getElementById('flashcards');
    var parts = C.getParts();
    var terms = C.shuffle(C.collectAllTerms(parts)).slice(0, 12);

    if (!terms.length) {
      container.innerHTML = '<p class="empty">暂无关键术语</p>';
      return;
    }

    var html = '<h2>关键术语闪卡</h2>' +
      '<p class="hint">点击卡片查看提示</p>' +
      '<div class="flashcard-grid">';
    for (var i = 0; i < terms.length; i++) {
      html += '<div class="term-flip" tabindex="0" role="button" aria-pressed="false">' +
        '<div class="term-front">' + C.escapeHtml(terms[i]) + '</div>' +
        '<div class="term-back">（请回忆该术语在书中的解释）</div>' +
        '</div>';
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.term-flip').forEach(function(card) {
      var toggle = function() {
        card.classList.toggle('flipped');
        card.setAttribute('aria-pressed', card.classList.contains('flipped') ? 'true' : 'false');
      };
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  function renderQuiz() {
    var container = document.getElementById('quiz');
    var parts = C.getParts();
    var questions = C.buildQuiz(parts, 5);
    var saved = C.quizAnswers.get();

    if (!questions.length) {
      container.innerHTML = '<p class="empty">暂无测验题目</p>';
      return;
    }

    var html = '<h2>随机自测</h2>' +
      '<p class="hint">从全书引导性问题中随机抽取 5 题</p>' +
      '<div class="quiz-list">';
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var qKey = 'quiz_' + q.chapterId + '_' + i;
      var savedText = saved[qKey] || '';
      html += '<div class="question-card">' +
        '<p class="question-meta">' + C.escapeHtml(q.chapterTitle) + '</p>' +
        '<p class="question-text">' + (i + 1) + '. ' + C.escapeHtml(q.question) + '</p>' +
        '<textarea class="answer-input quiz-answer" data-qkey="' + qKey + '" rows="3" placeholder="试答…">' + C.escapeHtml(savedText) + '</textarea>' +
        '<button class="btn-secondary reveal-answer">显示提示</button>' +
        '<p class="answer-hint hidden">参考答案思路：请回到 ' + C.escapeHtml(q.chapterTitle) + ' 的相关章节，结合上下文思考。</p>' +
        '</div>';
    }
    html += '</div>' +
      '<button id="new-quiz" class="btn-primary">换一批题目</button>';
    container.innerHTML = html;

    container.querySelectorAll('.quiz-answer').forEach(function(textarea) {
      textarea.addEventListener('input', function() {
        var key = textarea.getAttribute('data-qkey');
        C.quizAnswers.save(key, textarea.value);
      });
    });

    container.querySelectorAll('.reveal-answer').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var hint = btn.nextElementSibling;
        if (hint) {
          hint.classList.toggle('hidden');
          btn.textContent = hint.classList.contains('hidden') ? '显示提示' : '隐藏提示';
        }
      });
    });

    document.getElementById('new-quiz').addEventListener('click', renderQuiz);
  }

  function renderScriptureReview() {
    var container = document.getElementById('scripture-review');
    var parts = C.getParts();
    var groups = C.collectScriptures(parts);

    if (!groups.length) {
      container.innerHTML = '<p class="empty">暂无经文</p>';
      return;
    }

    var html = '<h2>经文回顾</h2><div class="scripture-list">';
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      html += '<details class="scripture-group">' +
        '<summary>' + C.escapeHtml(g.chapterTitle) + '</summary><ul>';
      for (var j = 0; j < g.scriptures.length; j++) {
        html += '<li>' + C.escapeHtml(g.scriptures[j]) + '</li>';
      }
      html += '</ul></details>';
    }
    html += '</div>';
    container.innerHTML = html;
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
    renderFlashcards();
    renderQuiz();
    renderScriptureReview();
    setupTimeTracking();
  } catch (err) {
    console.error(err);
    document.querySelector('main').innerHTML = '<p class="error">课件数据加载失败</p>';
  }
})();
