import { describe, it, expect } from 'vitest';
import { rateLimit } from '../../functions/_utils/rate-limit.js';
import { createMockEnv } from '../helpers/mock-env.js';

describe('rateLimit', () => {
  it('applies limit in test env', async () => {
    const env = createMockEnv();
    let last;
    for (let i = 0; i < 5; i++) {
      last = await rateLimit(env, 'u:abc', 3, 60000);
    }
    expect(last.allowed).toBe(false);
  });

  it('does not bypass when JWT_SECRET equals old dev strings', async () => {
    const env = createMockEnv({ JWT_SECRET: 'a_very_long_secure_random_key_for_jwt_auth_1298471928' });
    let last;
    for (let i = 0; i < 5; i++) {
      last = await rateLimit(env, 'u:def', 3, 60000);
    }
    expect(last.allowed).toBe(false);
  });

  it('relaxes the limit to 10000 when ENVIRONMENT is dev', async () => {
    const env = createMockEnv({ ENVIRONMENT: 'dev' });
    let last;
    for (let i = 0; i < 30; i++) {
      last = await rateLimit(env, 'u:dev', 3, 60000);
    }
    // 30 次调用远超 limit=3，但 ENVIRONMENT==='dev' 时应放宽到 10000，仍允许
    expect(last.allowed).toBe(true);
  });
});
