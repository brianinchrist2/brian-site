import { test, expect } from '@playwright/test';

const uniqueEmail = `e2e-student-${Date.now()}@test.com`;

async function signupAndLogin(page) {
  await page.goto('/login.html');
  await page.locator('#toggle-link').click();
  await page.locator('#nickname').fill('E2E Student');
  await page.locator('#email').fill(uniqueEmail);
  await page.locator('#password').fill('testpass123');
  await page.locator('#btn-submit').click();
  await page.waitForURL('**/', { timeout: 10000 }).catch(() => {});
}

test.describe('Student full flow with real auth', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#btn-submit')).toBeVisible();
  });

  test('student can signup and access dashboard', async ({ page }) => {
    await signupAndLogin(page);
    await page.goto('/student/dashboard.html');
    await expect(page.locator('a[href="attendance.html"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a[href="assignments.html"]')).toBeVisible();
    await expect(page.locator('a[href="assessments.html"]')).toBeVisible();
    await expect(page.locator('a[href="videos.html"]')).toBeVisible();
    await expect(page.locator('a[href="grades.html"]')).toBeVisible();
    await expect(page.locator('a[href="questions.html"]')).toBeVisible();
    await expect(page.locator('a[href="certificate.html"]')).toBeVisible();
  });

  test('student can sign in after signup', async ({ page }) => {
    await page.goto('/login.html');
    await page.locator('#email').fill(uniqueEmail);
    await page.locator('#password').fill('testpass123');
    await page.locator('#btn-submit').click();
    await page.waitForURL('**/', { timeout: 10000 }).catch(() => {});
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
  });
});
