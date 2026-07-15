window.Courseware = window.Courseware || {};
(function() {
  var C = window.Courseware;

  function getQuestions(ch) {
    var q = [];
    var types = ch.questions || {};
    if (types.guided) q = q.concat(types.guided);
    if (types.exploratory) q = q.concat(types.exploratory);
    if (types.practical) q = q.concat(types.practical);
    return q;
  }

  function buildReportModel(data) {
    var allAnswers = C.answers.getAll();
    var completed = C.progress.get();
    var s = C.stats.get();
    var total = 0;
    for (var i = 0; i < data.parts.length; i++) {
      total += (data.parts[i].chapters || []).length;
    }
    if (total === 0) total = 1;

    var parts = [];
    for (var i = 0; i < data.parts.length; i++) {
      var part = data.parts[i];
      var chs = [];
      for (var j = 0; j < (part.chapters || []).length; j++) {
        var ch = part.chapters[j];
        var chAnswers = allAnswers[ch.id] || {};
        var hasAnswers = false;
        for (var key in chAnswers) {
          if (chAnswers.hasOwnProperty(key)) { hasAnswers = true; break; }
        }
        if (!hasAnswers) continue;

        var questions = getQuestions(ch);
        var qas = [];
        for (var k = 0; k < questions.length; k++) {
          qas.push({
            question: questions[k],
            answer: chAnswers[k] || '（未作答）',
          });
        }
        chs.push({ title: ch.title, questions: qas });
      }
      if (chs.length > 0) {
        parts.push({ title: part.title, chapters: chs });
      }
    }

    return {
      title: data.title,
      generatedAt: new Date().toLocaleString('zh-CN'),
      completed: completed.length,
      total: total,
      minutes: Math.round(s.minutes || 0),
      parts: parts,
    };
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 0);
  }

  C.exportMarkdown = function() {
    var data = window.COURSEWARE_DATA;
    var model = buildReportModel(data);

    var lines = [
      '# ' + C.escapeMd(model.title) + ' 学习报告',
      '',
      '生成时间：' + model.generatedAt,
      '已完成章节：' + model.completed + ' / ' + model.total,
      '累计学习：' + model.minutes + ' 分钟',
      '',
    ];

    for (var i = 0; i < model.parts.length; i++) {
      var part = model.parts[i];
      lines.push('## ' + C.escapeMd(part.title));
      for (var j = 0; j < part.chapters.length; j++) {
        var ch = part.chapters[j];
        lines.push('### ' + C.escapeMd(ch.title));
        for (var k = 0; k < ch.questions.length; k++) {
          var qa = ch.questions[k];
          lines.push('**问：** ' + C.escapeMd(qa.question));
          lines.push('');
          lines.push('**答：** ' + C.escapeMd(qa.answer));
          lines.push('');
        }
      }
    }

    var blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, '学习报告.md');
  };

  C.exportText = function() {
    var data = window.COURSEWARE_DATA;
    var model = buildReportModel(data);
    var lines = [
      model.title + ' 学习报告',
      '生成时间：' + model.generatedAt,
      '已完成章节：' + model.completed + ' / ' + model.total,
      '累计学习：' + model.minutes + ' 分钟',
      '',
    ];

    for (var i = 0; i < model.parts.length; i++) {
      var part = model.parts[i];
      lines.push('【' + part.title + '】');
      for (var j = 0; j < part.chapters.length; j++) {
        var ch = part.chapters[j];
        lines.push('  ' + ch.title);
        for (var k = 0; k < ch.questions.length; k++) {
          var qa = ch.questions[k];
          lines.push('    问：' + qa.question);
          lines.push('    答：' + qa.answer);
          lines.push('');
        }
      }
    }

    var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, '学习报告.txt');
  };

  C.renderPrintView = function(container) {
    var data = window.COURSEWARE_DATA;
    var model = buildReportModel(data);

    var html = '<div class="print-header">' +
      '<h1>' + C.escapeHtml(model.title) + ' 学习报告</h1>' +
      '<p>生成时间：' + C.escapeHtml(model.generatedAt) + '</p>' +
      '<p>已完成章节：' + model.completed + ' / ' + model.total + ' · 累计学习：' + model.minutes + ' 分钟</p>' +
      '</div>';

    for (var i = 0; i < model.parts.length; i++) {
      var part = model.parts[i];
      html += '<section class="print-part"><h2>' + C.escapeHtml(part.title) + '</h2>';
      for (var j = 0; j < part.chapters.length; j++) {
        var ch = part.chapters[j];
        html += '<section class="print-chapter"><h3>' + C.escapeHtml(ch.title) + '</h3>';
        for (var k = 0; k < ch.questions.length; k++) {
          var qa = ch.questions[k];
          html += '<div class="print-qa">' +
            '<p class="print-q"><strong>问：</strong>' + C.escapeHtml(qa.question) + '</p>' +
            '<p class="print-a"><strong>答：</strong>' + C.escapeHtml(qa.answer).replace(/\n/g, '<br>') + '</p>' +
            '</div>';
        }
        html += '</section>';
      }
      html += '</section>';
    }

    container.innerHTML = html;
  };
})();
