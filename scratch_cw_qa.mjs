// Quick smoke test: courseware panel functionality
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const BASE = 'http://localhost:8000/brianinchrist/organicchurch/books';
const CH01 = BASE + '/book2/chapter01.html';
const EN_CH01 = BASE + '/en/book2/chapter01.html';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let passed = 0, failed = 0;

  function check(name, ok) {
    if (ok) { passed++; console.log('  PASS:', name); }
    else { failed++; console.log('  FAIL:', name); }
  }

  // 1. Page loads with external CSS
  console.log('\n[Test 1] Page loads with external CSS');
  const page1 = await ctx.newPage();
  await page1.goto(CH01, { waitUntil: 'domcontentloaded' });
  const hasExternalCss = await page1.evaluate(() =>
    [...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href.includes('reader.css'))
  );
  check('External reader.css loaded', hasExternalCss);
  const hasNoStyle = await page1.evaluate(() => document.querySelectorAll('style').length === 0);
  check('No inline <style> blocks', hasNoStyle);

  // 2. Courseware button exists in topbar
  console.log('\n[Test 2] Courseware button in topbar');
  const cwBtn = await page1.$('.chapter-nav .courseware-btn');
  check('Topbar courseware button exists', !!cwBtn);

  // 3. Click courseware button → panel opens, sidebar collapses
  console.log('\n[Test 3] Panel toggle on button click');
  if (cwBtn) {
    await cwBtn.click();
    await page1.waitForTimeout(600);
    const panelOpen = await page1.evaluate(() => {
      const p = document.getElementById('cwPanel');
      return p && p.classList.contains('open');
    });
    check('Panel opens', panelOpen);

    const sidebarCollapsed = await page1.evaluate(() => {
      const s = document.querySelector('.sidebar');
      return s && s.classList.contains('collapsed');
    });
    check('Sidebar collapses', sidebarCollapsed);
  }

  // 4. Close button works
  console.log('\n[Test 4] Close panel');
  const closeBtn = await page1.$('.cw-panel-close');
  if (closeBtn) {
    await closeBtn.click();
    await page1.waitForTimeout(600);
    const panelClosed = await page1.evaluate(() => {
      const p = document.getElementById('cwPanel');
      return p && p.classList.contains('closed');
    });
    check('Panel closes', panelClosed);
  }
  await page1.close();

  // 5. en/chapter01.html has courseware button in topbar
  console.log('\n[Test 5] EN chapter has topbar courseware button');
  const page2 = await ctx.newPage();
  await page2.goto(EN_CH01, { waitUntil: 'domcontentloaded' });
  const enCwBtn = await page2.$('.topbar .courseware-btn');
  check('EN topbar courseware button exists', !!enCwBtn);
  await page2.close();

  // Summary
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
