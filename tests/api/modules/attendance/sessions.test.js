import { describe, it, expect } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { onRequestGet } from '../../../../functions/api/modules/attendance/sessions.js';

describe('GET /api/modules/attendance/sessions', () => {
  it('returns 401 without authorization header', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/attendance/sessions',
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/attendance/sessions',
      headers: { Authorization: 'Bearer invalid-token' },
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });
});
