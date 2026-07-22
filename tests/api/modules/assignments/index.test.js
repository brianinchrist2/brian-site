import { describe, it, expect } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { onRequestGet, onRequestPost } from '../../../../functions/api/modules/assignments/index.js';

describe('assignments API', () => {
  it('GET returns 401 without auth', async () => {
    const ctx = createMockContext({ method: 'GET', url: 'http://localhost/api/modules/assignments' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });

  it('GET returns 401 with invalid token', async () => {
    const ctx = createMockContext({ method: 'GET', url: 'http://localhost/api/modules/assignments', headers: { Authorization: 'Bearer invalid' } });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });

  it('POST returns 401 without auth', async () => {
    const ctx = createMockContext({ method: 'POST', url: 'http://localhost/api/modules/assignments', body: { course_id: 'test', title: 'Test' } });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
  });
});
