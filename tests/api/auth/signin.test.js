import { describe, it, expect } from 'vitest';
import { createMockContext } from '../../helpers/mock-context.js';
import { createMockEnv } from '../../helpers/mock-env.js';
import { onRequestPost } from '../../../functions/api/auth/signin.js';

describe('POST /api/auth/signin', () => {
  it('returns 400 when email is missing', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/auth/signin',
      body: { password: 'testpass' },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('required');
  });

  it('returns 400 when password is missing', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/auth/signin',
      body: { email: 'test@example.com' },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('required');
  });

  it('returns 500 when DB binding is missing', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/auth/signin',
      body: { email: 'test@example.com', password: 'testpass' },
      env: { JWT_SECRET: 'test-secret' }, // no DB
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain('DB');
  });

  it('returns 401 when user not found', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/auth/signin',
      body: { email: 'nonexistent@example.com', password: 'testpass' },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Invalid');
  });
});
