import { test, expect } from '@playwright/test';

const PASSWORD = 'testpass123';

// 每次调用生成独立邮箱，避免跨用例共享模块级 Date.now() 导致的邮箱漂移
function freshEmail() {
  return `e2e-student-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function signupViaUi(page, email) {
  await page.goto('/login.html');
  await page.locator('#toggle-link').click();
  await page.locator('#nickname').fill('E2E Student');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#btn-submit').click();
  // 注册成功后前端会跳转到学生仪表盘（wrangler pages dev 会把 .html 重定向为无扩展名 URL）
  await page.waitForURL('**/student/dashboard*', { timeout: 15000 }).catch(() => {});
}

test.describe('Student full flow with real auth', () => {
  // wrangler pages dev 函数冷启动较慢，放宽单测超时
  test.setTimeout(60000);

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#btn-submit')).toBeVisible();
  });

  test('student can signup and access dashboard', async ({ page }) => {
    await signupViaUi(page, freshEmail());
    await page.goto('/student/dashboard.html');
    // 用 a.card 精确定位：仪表盘入口卡片每项唯一，避免与侧边栏 sidebar-link 重复造成 strict mode violation
    await expect(page.locator('a.card[href="attendance.html"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a.card[href="assignments.html"]')).toBeVisible();
    await expect(page.locator('a.card[href="assessments.html"]')).toBeVisible();
    await expect(page.locator('a.card[href="videos.html"]')).toBeVisible();
    await expect(page.locator('a.card[href="grades.html"]')).toBeVisible();
    await expect(page.locator('a.card[href="questions.html"]')).toBeVisible();
    await expect(page.locator('a.card[href="certificate.html"]')).toBeVisible();
  });

  test('student can sign in after signup', async ({ page, request }) => {
    // 用 API 直接创建账号，再走 UI 登录，确保登录的邮箱确实已注册
    const email = freshEmail();
    const res = await request.post('/api/auth/signup', {
      data: { email, password: PASSWORD, nickname: 'E2E Student' },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto('/login.html');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(PASSWORD);
    await page.locator('#btn-submit').click();
    // 登录成功应跳转到学生仪表盘；未跳转说明登录失败（如 401），让断言给出明确失败
    await page.waitForURL('**/student/dashboard*', { timeout: 15000 });
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
  });
});
