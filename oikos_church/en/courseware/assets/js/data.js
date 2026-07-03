window.Courseware = window.Courseware || {};
(function() {
  var courseData = window.COURSEWARE_DATA;

  window.Courseware.getParts = function() {
    return courseData.parts;
  };

  window.Courseware.getTitle = function() {
    return courseData.title;
  };

  window.Courseware.getChapter = function(id) {
    for (var i = 0; i < courseData.parts.length; i++) {
      var chapters = courseData.parts[i].chapters || [];
      for (var j = 0; j < chapters.length; j++) {
        if (chapters[j].id === id) return chapters[j];
      }
    }
    return null;
  };

  window.Courseware.getPartForChapter = function(id) {
    for (var i = 0; i < courseData.parts.length; i++) {
      var chapters = courseData.parts[i].chapters || [];
      for (var j = 0; j < chapters.length; j++) {
        if (chapters[j].id === id) return courseData.parts[i];
      }
    }
    return null;
  };

  window.Courseware.getAdjacentChapter = function(id) {
    var flat = [];
    for (var i = 0; i < courseData.parts.length; i++) {
      flat = flat.concat(courseData.parts[i].chapters || []);
    }
    var idx = -1;
    for (var i = 0; i < flat.length; i++) {
      if (flat[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: idx > 0 ? flat[idx - 1] : null,
      next: idx < flat.length - 1 ? flat[idx + 1] : null,
    };
  };

  window.Courseware.getNextIncompleteChapter = function(completedIds) {
    if (!completedIds) completedIds = [];
    for (var i = 0; i < courseData.parts.length; i++) {
      var chapters = courseData.parts[i].chapters || [];
      for (var j = 0; j < chapters.length; j++) {
        if (completedIds.indexOf(chapters[j].id) === -1) return chapters[j];
      }
    }
    return null;
  };
})();
