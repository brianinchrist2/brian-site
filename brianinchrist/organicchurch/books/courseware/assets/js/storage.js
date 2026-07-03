window.Courseware = window.Courseware || {};
(function() {
  var PREFIX = 'courseware_';
  var SESSION_KEY = PREFIX + 'session_start';
  var MAX_VISIT_MINUTES = 120;

  function get(key, fallback) {
    if (fallback === void 0) fallback = null;
    try {
      var v = localStorage.getItem(PREFIX + key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn('localStorage write failed', e);
    }
  }

  var progress = {
    get: function() { return get('progress', []); },
    set: function(arr) { set('progress', arr); },
    isDone: function(id) { return progress.get().indexOf(id) !== -1; },
    markDone: function(id) {
      var arr = new Set(progress.get());
      arr.add(id);
      progress.set([].concat(Array.from ? Array.from(arr) : Array.prototype.slice.call(arr)));
    },
    markUndone: function(id) {
      progress.set(progress.get().filter(function(x) { return x !== id; }));
    },
    getVisited: function() { return get('visited', []); },
    isVisited: function(id) { return progress.getVisited().indexOf(id) !== -1; },
    markVisited: function(id) {
      var arr = progress.getVisited();
      if (arr.indexOf(id) === -1) {
        arr.push(id);
        set('visited', arr);
      }
    },
  };

  var answers = {
    get: function(chapterId) { return get('answers_' + chapterId, {}); },
    set: function(chapterId, obj) { set('answers_' + chapterId, obj); },
    save: function(chapterId, qIndex, text) {
      var obj = answers.get(chapterId);
      obj[qIndex] = text;
      answers.set(chapterId, obj);
    },
    getAll: function() {
      try {
        var all = {};
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(PREFIX + 'answers_') === 0) {
            var chapterId = k.slice((PREFIX + 'answers_').length);
            all[chapterId] = get(k.slice(PREFIX.length));
          }
        }
        return all;
      } catch (e) {
        return {};
      }
    },
  };

  var quizAnswers = {
    get: function() { return get('quiz_answers', {}); },
    save: function(key, text) {
      var obj = quizAnswers.get();
      obj[key] = text;
      set('quiz_answers', obj);
    },
  };

  var notes = {
    get: function(chapterId) { return get('notes_' + chapterId, ''); },
    set: function(chapterId, text) { set('notes_' + chapterId, text); },
  };

  var prefs = {
    getTheme: function() { return get('theme', 'light'); },
    setTheme: function(t) { set('theme', t); },
    getFont: function() { return get('font', '19'); },
    setFont: function(px) { set('font', String(px)); },
    getMeasure: function() { return get('measure', '720px'); },
    setMeasure: function(m) { set('measure', m); },
  };

  var stats = {
    get: function() { return get('stats', { minutes: 0, lastVisit: null }); },
    set: function(obj) { set('stats', obj); },
    addMinutes: function(n) {
      var s = stats.get();
      s.minutes += n;
      s.lastVisit = new Date().toISOString();
      stats.set(s);
    },
    getLastChapter: function() { return get('last_chapter', null); },
    setLastChapter: function(id) { set('last_chapter', id); },
    recordVisit: function() {
      try {
        if (!sessionStorage.getItem(SESSION_KEY)) {
          sessionStorage.setItem(SESSION_KEY, String(Date.now()));
        }
      } catch (e) {}
    },
    recordLeave: function() {
      try {
        var start = sessionStorage.getItem(SESSION_KEY);
        if (!start) return;
        var elapsed = (Date.now() - Number(start)) / 60000;
        sessionStorage.removeItem(SESSION_KEY);
        if (elapsed >= 1 && elapsed <= MAX_VISIT_MINUTES) {
          stats.addMinutes(Math.round(elapsed));
        }
      } catch (e) {}
    },
    pauseVisit: function() {
      try {
        var start = sessionStorage.getItem(SESSION_KEY);
        if (!start) return;
        var elapsed = (Date.now() - Number(start)) / 60000;
        if (elapsed >= 1 && elapsed <= MAX_VISIT_MINUTES) {
          stats.addMinutes(Math.round(elapsed));
        }
        sessionStorage.removeItem(SESSION_KEY);
      } catch (e) {}
    },
    resumeVisit: function() {
      try {
        sessionStorage.setItem(SESSION_KEY, String(Date.now()));
      } catch (e) {}
    },
  };

  window.Courseware.progress = progress;
  window.Courseware.answers = answers;
  window.Courseware.quizAnswers = quizAnswers;
  window.Courseware.notes = notes;
  window.Courseware.prefs = prefs;
  window.Courseware.stats = stats;
  window.Courseware.clearAll = function() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) keys.push(k);
      }
      keys.forEach(function(k) { localStorage.removeItem(k); });
    } catch (e) {}
  };
})();
