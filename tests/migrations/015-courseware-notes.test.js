import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

const MIGRATIONS = ['001_init.sql', '015-courseware-notes.sql'];

describe('migration 015-courseware-notes.sql', () => {
  it('creates courseware_notes table with unique constraint', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const cols = (await db.prepare('PRAGMA table_info(courseware_notes)').all()).results;
    const names = cols.map(c => c.name);
    for (const field of ['id','user_id','book_id','chapter_id','question_type','question_index','content','updated_at']) {
      expect(names).toContain(field);
    }
  });

  it('enforces unique(user_id, book_id, chapter_id, question_type, question_index)', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    const insert = () => db.prepare(
      "INSERT INTO courseware_notes (id, user_id, book_id, chapter_id, question_type, question_index, content) VALUES (?,?,?,?,?,?,?)"
    ).bind(`n1`,'u1','lg','introduction','guided',0,'x').run();
    await insert();
    await expect(insert()).rejects.toThrow();
  });

  it('cascades delete on user', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courseware_notes (id, user_id, book_id, chapter_id, question_type, question_index, content) VALUES ('n1','u1','lg','introduction','guided',0,'x')").run();
    await db.prepare("DELETE FROM users WHERE id='u1'").run();
    const row = await db.prepare("SELECT id FROM courseware_notes WHERE id='n1'").first();
    expect(row).toBeNull();
  });
});
