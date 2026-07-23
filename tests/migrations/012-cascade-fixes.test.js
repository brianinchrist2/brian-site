import { describe, it, expect } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

const MIGRATIONS = ['001_init.sql', '003-interactions.sql', '008-videos.sql', '012-cascade-fixes.sql'];

describe('migration 012-cascade-fixes.sql', () => {
  it('video_lessons.course_id references courses with ON DELETE CASCADE', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const result = await db.prepare("PRAGMA foreign_key_list(video_lessons)").all();
    const fks = result.results;
    const courseFk = fks.find(fk => fk.from === 'course_id');
    expect(courseFk).toBeDefined();
    expect(courseFk.on_delete).toBe('CASCADE');
  });

  it('questions.item_id references course_items with ON DELETE CASCADE', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const result = await db.prepare("PRAGMA foreign_key_list(questions)").all();
    const fks = result.results;
    const itemFk = fks.find(fk => fk.from === 'item_id');
    expect(itemFk).toBeDefined();
    expect(itemFk.on_delete).toBe('CASCADE');
  });

  it('video_lessons preserves existing data after rebuild', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"teacher\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, description, created_by) VALUES ('c1','Course','Desc','u1')").run();
    await db.prepare("INSERT INTO video_lessons (id, course_id, title, video_type, video_url, created_by) VALUES ('v1','c1','Video1','video','http://v','u1')").run();
    await db.prepare("DELETE FROM courses WHERE id = 'c1'").run();
    const result = await db.prepare("SELECT COUNT(*) as c FROM video_lessons WHERE course_id = 'c1'").first();
    expect(result.c).toBe(0);
  });

  it('questions preserves existing data after rebuild', async () => {
    const db = await setupTestDB(MIGRATIONS);
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('u1','a@b.c','A','h','s','[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, description, created_by) VALUES ('c1','Course','Desc','u1')").run();
    await db.prepare("INSERT INTO course_items (id, course_id, title, type, item_ref) VALUES ('i1','c1','Item1','reading','ref1')").run();
    await db.prepare("INSERT INTO questions (id, student_id, course_id, item_id, title) VALUES ('q1','u1','c1','i1','Question1')").run();
    await db.prepare("DELETE FROM course_items WHERE id = 'i1'").run();
    const result = await db.prepare("SELECT COUNT(*) as c FROM questions WHERE item_id = 'i1'").first();
    expect(result.c).toBe(0);
  });

  it('video_lessons.class_id still uses ON DELETE SET NULL', async () => {
    const db = await setupTestDB(MIGRATIONS);
    const result = await db.prepare("PRAGMA foreign_key_list(video_lessons)").all();
    const fks = result.results;
    const classFk = fks.find(fk => fk.from === 'class_id');
    expect(classFk).toBeDefined();
    expect(classFk.on_delete).toBe('SET NULL');
  });
});
