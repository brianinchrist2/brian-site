import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }
  });
  const page = await context.newPage();
  
  // 收集控制台报错
  page.on('console', msg => console.log(`ONLINE LOG: [${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.error(`ONLINE ERROR: ${err.message}`));
  
  const testUrl = "https://organicchurch.dpdns.org/organicchurch/posts/7817";
  console.log(`\n--- Testing Online Article: ${testUrl} ---`);
  
  try {
    await page.goto(testUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000); // 等待可能存在的 JS 加载
    
    const menuBtn = page.locator('#mobile-menu-btn');
    const isVisible = await menuBtn.isVisible();
    console.log(`Online Menu button visible: ${isVisible}`);
    
    if (isVisible) {
      const box = await menuBtn.boundingBox();
      console.log(`Online Menu button bounding box:`, box);
      
      const beforeClass = await page.locator('#mobile-menu-overlay').getAttribute('class');
      console.log(`Online Overlay class before click: ${beforeClass}`);
      
      console.log('Clicking online menu button...');
      await menuBtn.click();
      await page.waitForTimeout(1000);
      
      const afterClass = await page.locator('#mobile-menu-overlay').getAttribute('class');
      const isOverlayVisible = await page.locator('#mobile-menu-overlay').isVisible();
      console.log(`Online Overlay class after click: ${afterClass}`);
      console.log(`Online Overlay DOM visible: ${isOverlayVisible}`);
    } else {
      console.log("Error: Menu button is not visible in viewport.");
    }
  } catch (err) {
    console.error("Failed to load online page:", err.message);
  }
  
  await browser.close();
})();
