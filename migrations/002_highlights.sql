-- Phase 2: 高亮与评论

-- 高亮标注表
CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  anchor_data TEXT NOT NULL,  -- JSON: {position: {start, end}, quote: {exact, prefix, suffix}}
  comment TEXT,
  color TEXT DEFAULT 'yellow',
  visibility TEXT DEFAULT 'private',  -- private, public, class
  class_ids TEXT,  -- JSON array of class IDs
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES course_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_highlights_user ON highlights(user_id);
CREATE INDEX IF NOT EXISTS idx_highlights_item ON highlights(item_id);
CREATE INDEX IF NOT EXISTS idx_highlights_visibility ON highlights(visibility);

-- 高亮回复表
CREATE TABLE IF NOT EXISTS highlight_replies (
  id TEXT PRIMARY KEY,
  highlight_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_highlight_replies_highlight ON highlight_replies(highlight_id);
CREATE INDEX IF NOT EXISTS idx_highlight_replies_user ON highlight_replies(user_id);
