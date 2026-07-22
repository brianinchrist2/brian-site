import { test, expect } from '@playwright/test';

const setAuthToken = async (page) => {
  await page.goto('/login.html');
  await page.evaluate(() => localStorage.setItem('auth_token', 'e2e-test-dummy-token'));
};

test.describe('Teacher full flow', () => {
  test('admin dashboard shows all management links', async ({ page }) => {
    await setAuthToken(page);
    await page.goto('/admin/dashboard.html');
    await expect(page.locator('a[href="attendance.html"]')).toBeVisible();
    await expect(page.locator('a[href="assignments.html"]')).toBeVisible();
    await expect(page.locator('a[href="assessments.html"]')).toBeVisible();
    await expect(page.locator('a[href="grades.html"]')).toBeVisible();
    await expect(page.locator('a[href="books.html"]')).toBeVisible();
    await expect(page.locator('a[href="reports.html"]')).toBeVisible();
  });
});
