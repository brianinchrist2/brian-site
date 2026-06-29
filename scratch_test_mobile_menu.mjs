import { chromium } from '@playwright/test';
import * as path from 'path';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }
  });
  const page = await context.newPage();
  
  // 收集控制台报错
  page.on('console', msg => console.log(`BROWSER LOG: [${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.error(`BROWSER ERROR: ${err.message}`));
  
  // 测试列表页
  const listFilePath = path.resolve('brianinchrist/organicchurch/index.html');
  console.log(`\n--- Testing List Page: ${listFilePath} ---`);
  await page.goto(`file://${listFilePath}`);
  await page.waitForTimeout(1000); // 等待 JS 初始化和 posts.json 加载完毕
  
  const menuBtn = page.locator('#mobile-menu-btn');
  const isVisible = await menuBtn.isVisible();
  console.log(`Menu button visible: ${isVisible}`);
  
  if (isVisible) {
    const box = await menuBtn.boundingBox();
    console.log(`Menu button bounding box:`, box);
    
    // 获取 overlay 在点击前的类名和状态
    const beforeClass = await page.locator('#mobile-menu-overlay').getAttribute('class');
    console.log(`Overlay class before click: ${beforeClass}`);
    
    // 点击按钮
    console.log('Clicking menu button...');
    await menuBtn.click();
    await page.waitForTimeout(500); // 等待过渡动画
    
    // 获取 overlay 在点击后的类名和状态
    const afterClass = await page.locator('#mobile-menu-overlay').getAttribute('class');
    const isOverlayVisible = await page.locator('#mobile-menu-overlay').isVisible();
    console.log(`Overlay class after click: ${afterClass}`);
    console.log(`Overlay DOM visible: ${isOverlayVisible}`);
    
    const overlayStyle = await page.locator('#mobile-menu-overlay').evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        display: style.display,
        zIndex: style.zIndex
      };
    });
    console.log(`Overlay Computed Style after click:`, overlayStyle);
    
    // 截图保存
    const screenshotPath = path.resolve('C:/Users/Administrator/.gemini/antigravity-cli/brain/469ea557-4a66-4254-82a6-7ffdb899a86f/mobile_menu_test.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to: ${screenshotPath}`);
  }
  
  await browser.close();
})();
