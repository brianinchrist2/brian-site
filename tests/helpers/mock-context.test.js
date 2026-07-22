import { describe, it, expect } from 'vitest';
import { createMockContext } from './mock-context.js';

describe('createMockContext', () => {
  it('creates context with request and env', () => {
    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/test',
    });
    expect(ctx.request.method).toBe('GET');
    expect(ctx.env).toBeDefined();
    expect(ctx.env.DB).toBeDefined();
    expect(ctx.env.JWT_SECRET).toBeDefined();
  });

  it('sets authorization header when provided', () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/test',
      headers: { 'Authorization': 'Bearer test-token' },
    });
    expect(ctx.request.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('parses JSON body when provided', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/test',
      body: { foo: 'bar' },
    });
    const body = await ctx.request.json();
    expect(body.foo).toBe('bar');
  });
});
