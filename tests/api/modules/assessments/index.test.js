import { describe, it, expect } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { onRequestGet, onRequestPost } from '../../../../functions/api/modules/assessments/index.js';

describe('assessments API', () => {
  it('GET returns 401 without auth', async () => {
    const ctx = createMockContext({ method: 'GET', url: 'http://localhost/api/modules/assessments' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });
  it('POST returns 401 without auth', async () => {
    const ctx = createMockContext({ method: 'POST', url: 'http://localhost/api/modules/assessments', body: { course_id: 'x', title: 'Test' } });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
  });
});
