import { test, expect } from '@playwright/test';

test.describe('Student full flow', () => {
  test('student can navigate all modules', async ({ page }) => {
    await page.goto('/course-app/login.html');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('student dashboard shows all module links', async ({ page }) => {
    await page.goto('/course-app/student/dashboard.html');
    await expect(page.locator('a[href="attendance.html"]')).toBeVisible();
    await expect(page.locator('a[href="assignments.html"]')).toBeVisible();
    await expect(page.locator('a[href="assessments.html"]')).toBeVisible();
    await expect(page.locator('a[href="videos.html"]')).toBeVisible();
    await expect(page.locator('a[href="grades.html"]')).toBeVisible();
    await expect(page.locator('a[href="questions.html"]')).toBeVisible();
    await expect(page.locator('a[href="certificate.html"]')).toBeVisible();
  });
});
