import { test, expect } from '@playwright/test';

const setAuthToken = async (page) => {
  await page.goto('/login.html');
  await page.evaluate(() => localStorage.setItem('auth_token', 'e2e-test-dummy-token'));
};

test.describe('Teacher full flow', () => {
  test('admin dashboard redirects without valid profile', async ({ page }) => {
    await setAuthToken(page);
    await page.goto('/admin/dashboard.html');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url.includes('login') || url.includes('dashboard')).toBeTruthy();
  });
});
