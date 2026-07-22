import { test, expect } from '@playwright/test';

const setAuthToken = async (page) => {
  await page.goto('/login.html');
  await page.evaluate(() => localStorage.setItem('auth_token', 'e2e-test-dummy-token'));
};

test.describe('Student full flow', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#btn-submit')).toBeVisible();
  });

  test('student dashboard shows all module links', async ({ page }) => {
    await setAuthToken(page);
    await page.goto('/student/dashboard.html');
    await expect(page.locator('a[href="attendance.html"]')).toBeVisible();
    await expect(page.locator('a[href="assignments.html"]')).toBeVisible();
    await expect(page.locator('a[href="assessments.html"]')).toBeVisible();
    await expect(page.locator('a[href="videos.html"]')).toBeVisible();
    await expect(page.locator('a[href="grades.html"]')).toBeVisible();
    await expect(page.locator('a[href="questions.html"]')).toBeVisible();
    await expect(page.locator('a[href="certificate.html"]')).toBeVisible();
  });
});
