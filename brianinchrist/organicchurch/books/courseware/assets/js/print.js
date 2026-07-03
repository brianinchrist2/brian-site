window.Courseware = window.Courseware || {};
(function() {
  var C = window.Courseware;

  var container = document.getElementById('print-content');
  if (container) {
    try {
      C.renderPrintView(container);
    } catch (err) {
      console.error(err);
      container.innerHTML = '<p class="error">加载学习报告失败</p>';
    }
  }

  var printBtn = document.getElementById('print-btn');
  if (printBtn) {
    printBtn.addEventListener('click', function() { window.print(); });
  }

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
})();
