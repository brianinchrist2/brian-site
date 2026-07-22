import { test, expect } from '@playwright/test';

test.describe('Teacher full flow', () => {
  test('admin dashboard shows all management links', async ({ page }) => {
    await page.goto('/course-app/admin/dashboard.html');
    await expect(page.locator('a[href="attendance.html"]')).toBeVisible();
    await expect(page.locator('a[href="assignments.html"]')).toBeVisible();
    await expect(page.locator('a[href="assessments.html"]')).toBeVisible();
    await expect(page.locator('a[href="grades.html"]')).toBeVisible();
    await expect(page.locator('a[href="books.html"]')).toBeVisible();
    await expect(page.locator('a[href="reports.html"]')).toBeVisible();
  });
});
