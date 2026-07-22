import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDB } from '../helpers/setup-db.js';

describe('migration 006-import-books-data.sql', () => {
  let db;
  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '004-books.sql', '006-import-books-data.sql']);
  });

  it('inserts at least 1 book', async () => {
    const r = await db.prepare('SELECT COUNT(*) as count FROM books').first();
    expect(r.count).toBeGreaterThan(0);
  });

  it('inserts book chapters', async () => {
    const r = await db.prepare('SELECT COUNT(*) as count FROM book_chapters').first();
    expect(r.count).toBeGreaterThan(0);
  });
});
