window.Courseware = window.Courseware || {};
(function() {
  window.Courseware.buildQuiz = function(parts, count) {
    if (count === void 0) count = 5;
    var all = [];
    for (var i = 0; i < parts.length; i++) {
      var chapters = parts[i].chapters || [];
      for (var j = 0; j < chapters.length; j++) {
        var guided = (chapters[j].questions && chapters[j].questions.guided) || [];
        for (var k = 0; k < guided.length; k++) {
          all.push({
            chapterId: chapters[j].id,
            chapterTitle: chapters[j].title,
            question: guided[k],
          });
        }
      }
    }
    return Courseware.shuffle(all).slice(0, Math.min(count, all.length));
  };

  window.Courseware.collectAllTerms = function(parts) {
    var terms = {};
    for (var i = 0; i < parts.length; i++) {
      var chapters = parts[i].chapters || [];
      for (var j = 0; j < chapters.length; j++) {
        var keyTerms = chapters[j].keyTerms || [];
        for (var k = 0; k < keyTerms.length; k++) {
          terms[keyTerms[k]] = true;
        }
      }
    }
    return Object.keys(terms);
  };

  window.Courseware.collectScriptures = function(parts) {
    var result = [];
    for (var i = 0; i < parts.length; i++) {
      var chapters = parts[i].chapters || [];
      for (var j = 0; j < chapters.length; j++) {
        if (chapters[j].scriptures && chapters[j].scriptures.length) {
          result.push({
            chapterId: chapters[j].id,
            chapterTitle: chapters[j].title,
            scriptures: chapters[j].scriptures,
          });
        }
      }
    }
    return result;
  };

  window.Courseware.shuffle = function(array) {
    var arr = array.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  };
})();
