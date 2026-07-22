import { describe, it, expect } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { onRequestGet } from '../../../../functions/api/modules/grades/final.js';

describe('grades final API', () => {
  it('returns 401 without auth', async () => {
    const ctx = createMockContext({ method: 'GET', url: 'http://localhost/api/modules/grades/final?course_id=test' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });
});
