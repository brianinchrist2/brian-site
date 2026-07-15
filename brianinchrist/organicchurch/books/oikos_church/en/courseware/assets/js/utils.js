window.Courseware = window.Courseware || {};
(function() {
  window.Courseware.escapeHtml = function(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  window.Courseware.escapeMd = function(text) {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/([*_`#\[\]<>|])/g, '\\$1')
      .replace(/^(\s*)([-+*]|\d+\.)\s+/gm, '$1\\$2 ')
      .replace(/^(\s*)(#{1,6}\s)/gm, '$1\\$2');
  };
})();
