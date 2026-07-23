import { describe, it, expect, beforeAll } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { createMockEnv } from '../../../helpers/mock-env.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPut } from '../../../../functions/api/modules/books/[id].js';

describe('PUT /api/modules/books/[id]', () => {
  let db, adminToken, mockEnv;

  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '004-books.sql']);
    mockEnv = createMockEnv({ DB: db });
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('admin1', 'admin@test.com', 'Admin', 'hash', 'salt', '[\"admin\"]')").run();
    await db.prepare("INSERT INTO books (id, title, language) VALUES ('book1', 'Old Title', 'zh')").run();
    adminToken = await signJWT({ sub: 'admin1', roles: ['admin'] }, mockEnv.JWT_SECRET);
  });

  it('updates book successfully without SQL syntax error', async () => {
    const ctx = createMockContext({
      method: 'PUT',
      url: 'http://localhost/api/modules/books/book1',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { title: 'Updated Title' },
      env: mockEnv,
      params: { id: 'book1' }
    });
    const res = await onRequestPut(ctx);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.book.title).toBe('Updated Title');
  });
});
