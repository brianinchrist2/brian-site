-- 016-reader-annotations.sql
-- 阅读器正文高亮 + 笔记：按用户隔离，跨设备同步（last-write-wins；软删除墓碑防离线队列复活）
-- 增量建表，对既有表零影响；可重复执行（IF NOT EXISTS）

CREATE TABLE IF NOT EXISTS reader_annotations (
  id          TEXT PRIMARY KEY,                     -- 客户端生成 UUID v4：离线创建 + 幂等重试
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     TEXT NOT NULL,                        -- reader.html?book=（= library/<book>/ 目录名，如 lordship_gospel）
  chapter_id  TEXT NOT NULL,                        -- manifest.json parts[].chapters[].id（如 '11'、'preface'）
  color       TEXT NOT NULL DEFAULT 'yellow',       -- yellow|green|blue|pink|purple|none（none = 仅笔记，下划线样式）；由 API 白名单校验
  quote       TEXT NOT NULL,                        -- 选中的规范化原文（≤ 5000 字）
  note        TEXT NOT NULL DEFAULT '',             -- 笔记纯文本（≤ 20000 字，与 courseware_notes 上限一致）
  anchor      TEXT NOT NULL,                        -- JSON（v=1，见设计文档 §3.3），≤ 4096 字节
  pos_start   INTEGER NOT NULL DEFAULT 0,           -- = anchor.pos.start，仅用于排序
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT                                   -- 软删除墓碑；NULL = 有效
);

CREATE INDEX IF NOT EXISTS idx_reader_ann_user_book
  ON reader_annotations(user_id, book_id, chapter_id, pos_start);
