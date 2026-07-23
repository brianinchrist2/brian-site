import { test, expect } from '@playwright/test';

test.describe('Login page toggle link stability', () => {
  test('allows toggling between login and signup multiple times without DOM error', async ({ page }) => {
    await page.goto('/login.html');

    const toggleLink = page.locator('#toggle-link');
    const nicknameGroup = page.locator('#nickname-group');
    const submitBtn = page.locator('#btn-submit');

    // 1. 默认状态：登录
    await expect(nicknameGroup).toBeHidden();
    await expect(submitBtn).toHaveText('登录');

    // 2. 第一次点击：切换到注册
    await toggleLink.click();
    await expect(nicknameGroup).toBeVisible();
    await expect(submitBtn).toHaveText('注册');

    // 3. 第二次点击：切回登录 (若绑定 toggleLink.click 则在此处引发 Maximum call stack size exceeded 异常)
    await toggleLink.click();
    await expect(nicknameGroup).toBeHidden();
    await expect(submitBtn).toHaveText('登录');

    // 4. 第三次点击：再次切到注册
    await toggleLink.click();
    await expect(nicknameGroup).toBeVisible();
    await expect(submitBtn).toHaveText('注册');
  });
});
