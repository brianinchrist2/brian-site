import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

const MIGRATIONS = ['001_init.sql', '016-reader-annotations.sql'];
const ISO_MS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

const INSERT_USER = "INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')";
const INSERT_ANN = "INSERT INTO reader_annotations (id, user_id, book_id, chapter_id, quote, anchor) VALUES (?,?,?,?,?,?)";

describe('migration 016-reader-annotations.sql', () => {
  it('creates reader_annotations table with all columns', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const cols = (await db.prepare('PRAGMA table_info(reader_annotations)').all()).results;
    const names = cols.map(c => c.name);
    for (const field of ['id','user_id','book_id','chapter_id','color','quote','note','anchor','pos_start','created_at','updated_at','deleted_at']) {
      expect(names).toContain(field);
    }
  });

  it('creates the (user_id, book_id, chapter_id, pos_start) index', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const idx = (await db.prepare('PRAGMA index_info(idx_reader_ann_user_book)').all()).results;
    expect(idx.map(i => i.name)).toEqual(['user_id', 'book_id', 'chapter_id', 'pos_start']);
  });

  it('defaults created_at/updated_at to ISO 8601 with milliseconds and Z', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare(INSERT_USER).run();
    await db.prepare(INSERT_ANN).bind('a1', 'u1', 'lg', '11', 'q', '{}').run();
    const row = await db.prepare("SELECT color, note, pos_start, created_at, updated_at, deleted_at FROM reader_annotations WHERE id='a1'").first();
    expect(row.created_at).toMatch(ISO_MS);
    expect(row.updated_at).toMatch(ISO_MS);
    expect(row.color).toBe('yellow');
    expect(row.note).toBe('');
    expect(row.pos_start).toBe(0);
    expect(row.deleted_at).toBeNull();
  });

  it('rejects inserting the same id twice', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare(INSERT_USER).run();
    const insert = () => db.prepare(INSERT_ANN).bind('a1', 'u1', 'lg', '11', 'q', '{}').run();
    await insert();
    await expect(insert()).rejects.toThrow();
  });

  it('cascades delete on user', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare(INSERT_USER).run();
    await db.prepare(INSERT_ANN).bind('a1', 'u1', 'lg', '11', 'q', '{}').run();
    await db.prepare("DELETE FROM users WHERE id='u1'").run();
    const row = await db.prepare("SELECT id FROM reader_annotations WHERE id='a1'").first();
    expect(row).toBeNull();
  });

  it('is re-runnable (IF NOT EXISTS)', async () => {
    const db = await setupTestDB([...MIGRATIONS, '016-reader-annotations.sql']);
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE name='reader_annotations'").first();
    expect(row.name).toBe('reader_annotations');
  });
});
