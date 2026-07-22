import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:8788',
    headless: true,
  },
  webServer: {
    command: 'npx wrangler pages dev course-app --port 8788',
    port: 8788,
    reuseExistingServer: true,
  },
});
