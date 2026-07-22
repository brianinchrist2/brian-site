// Highlights module for courseware reader
// Provides text selection highlighting and annotation functionality
const Highlights = {
  async createHighlight(itemId, anchorData, color, comment, visibility) {
    const token = localStorage.getItem('auth_token');
    const res = await fetch('/api/modules/interactions/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ item_id: itemId, anchor_data: anchorData, color: color || 'yellow', comment: comment || null, visibility: visibility || 'private' })
    });
    return await res.json();
  },

  async loadHighlights(itemId) {
    const token = localStorage.getItem('auth_token');
    const res = await fetch('/api/modules/interactions/highlights?item_id=' + itemId, {
      headers: { Authorization: 'Bearer ' + token }
    });
    return await res.json();
  },

  renderHighlights(container, highlights) {
    if (!highlights || highlights.length === 0) return;
    highlights.forEach(function(h) {
      var mark = document.createElement('mark');
      mark.style.backgroundColor = h.color || 'yellow';
      mark.title = h.comment || '';
      mark.dataset.highlightId = h.id;
      container.appendChild(mark);
    });
  },

  initSelection(container, itemId) {
    container.addEventListener('mouseup', function() {
      var selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        var text = selection.toString();
        if (confirm('创建高亮？')) {
          Highlights.createHighlight(itemId, JSON.stringify({ text: text }), 'yellow', null, 'private');
        }
      }
    });
  }
};

export default Highlights;
