import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**'],
  },
});
