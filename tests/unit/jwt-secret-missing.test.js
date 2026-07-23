import { describe, it, expect } from 'vitest';
import { verifyJWT, signJWT } from '../../functions/_utils/jwt.js';

describe('JWT Secret Resilience Handling', () => {
  it('returns null safely when secret is undefined or null in verifyJWT', async () => {
    const payload = { sub: 'user1' };
    const token = await signJWT(payload, 'test-secret');
    
    // 当 secret 缺失或为空时，verifyJWT 应安全返回 null 而不挂掉
    const resultUndefined = await verifyJWT(token, undefined);
    expect(resultUndefined).toBeNull();

    const resultNull = await verifyJWT(token, null);
    expect(resultNull).toBeNull();
  });
});
