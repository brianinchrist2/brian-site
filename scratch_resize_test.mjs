// Test: resizable panel width via Playwright mouse API
import { chromium } from 'playwright';
const BASE = 'http://localhost:8000/brianinchrist/organicchurch/books/book2/chapter01.html';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let passed = 0, failed = 0;
  function check(name, ok) { if (ok) { passed++; console.log('  PASS:', name); } else { failed++; console.log('  FAIL:', name); } }

  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // Open panel
  await page.click('.chapter-nav .courseware-btn');
  await page.waitForTimeout(600);

  // 1. Resize handle exists
  const handle = await page.$('.cw-panel-resize-handle');
  check('Resize handle exists', !!handle);

  // 2. Panel has default width (360px)
  const panelW1 = await page.evaluate(() => {
    const p = document.getElementById('cwPanel');
    return parseInt(getComputedStyle(p).width, 10);
  });
  check('Panel default width ~360px', panelW1 >= 350 && panelW1 <= 370);

  // 3. Get handle position and drag to resize
  const handleBox = await page.evaluate(() => {
    const h = document.querySelector('.cw-panel-resize-handle');
    const r = h.getBoundingClientRect();
    return { x: r.left + 4, y: r.top + 10 };
  });

  // Mouse down on handle
  await page.mouse.move(handleBox.x, handleBox.y);
  await page.mouse.down();
  // Drag left by 80px
  await page.mouse.move(handleBox.x - 80, handleBox.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  // 4. Panel is now wider
  const panelW2 = await page.evaluate(() => {
    const p = document.getElementById('cwPanel');
    return parseInt(getComputedStyle(p).width, 10);
  });
  check('Panel widened after drag (~440px)', panelW2 >= 430 && panelW2 <= 450);

  // 5. CSS variable updated
  const cssVar = await page.evaluate(() => {
    return parseInt(document.documentElement.style.getPropertyValue('--cw-panel-w'), 10);
  });
  check('CSS var ~440px', cssVar >= 430 && cssVar <= 450);

  // 6. localStorage saved
  const savedW = await page.evaluate(() => parseInt(localStorage.getItem('cw_panel_width'), 10));
  check('localStorage saves width (~440px)', savedW >= 430 && savedW <= 450);

  // 7. Reload + verify width restored (panel auto-opens from saved state)
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Wait for auto-open (300ms delay in init) + transition
  await page.waitForTimeout(1000);

  const panelW3 = await page.evaluate(() => {
    const p = document.getElementById('cwPanel');
    return parseInt(getComputedStyle(p).width, 10);
  });
  check('Width restored after reload (~440px)', panelW3 >= 430 && panelW3 <= 450);

  // 8. Layout margin-right matches panel width
  const info = await page.evaluate(() => {
    const layout = document.querySelector('.layout');
    const csMargin = getComputedStyle(layout).marginRight;
    const p = document.getElementById('cwPanel');
    const csWidth = getComputedStyle(p).width;
    return { marginRight: csMargin, pWidth: csWidth, cssVar: document.documentElement.style.getPropertyValue('--cw-panel-w') };
  });
  const layoutMarginR = parseInt(info.marginRight, 10);
  const panelW4 = parseInt(info.pWidth, 10);
  const matches = Math.abs(layoutMarginR - panelW4) < 20;
  check('Layout margin-right (' + info.marginRight + ') matches panel width (' + info.pWidth + ')', matches);

  await page.close();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
