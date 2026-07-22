import { describe, it, expect } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { onRequestGet, onRequestPost } from '../../../../functions/api/modules/books/index.js';

describe('GET /api/modules/books', () => {
  it('returns 401 without authorization header', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/books',
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/books',
      headers: { Authorization: 'Bearer invalid' },
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/modules/books', () => {
  it('returns 401 without authorization header', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/books',
      body: { title: 'Test' },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/books',
      headers: { Authorization: 'Bearer invalid' },
      body: { title: 'Test' },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
  });
});
