import { describe, it, expect } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { onRequestGet } from '../../../../functions/api/modules/videos/index.js';

describe('GET /api/modules/videos', () => {
  it('returns 401 without auth', async () => {
    const ctx = createMockContext({ method: 'GET', url: 'http://localhost/api/modules/videos' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });
  it('returns 401 with invalid token', async () => {
    const ctx = createMockContext({ method: 'GET', url: 'http://localhost/api/modules/videos', headers: { Authorization: 'Bearer invalid' } });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });
});
