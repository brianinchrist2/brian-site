// Deployed site Playwright test
import { chromium } from 'playwright';

const BASE = 'https://master.brianinchrist-site.pages.dev/organicchurch/books';
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
  console.log('\n[Deploy Test 1] Page loads with external CSS');
  const p1 = await ctx.newPage();
  await p1.goto(CH01, { waitUntil: 'networkidle', timeout: 15000 });
  const hasExternalCss = await p1.evaluate(() =>
    [...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href.includes('reader.css'))
  );
  check('External reader.css loaded', hasExternalCss);
  const hasPanelCss = await p1.evaluate(() =>
    [...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href.includes('courseware-panel.css'))
  );
  check('External courseware-panel.css loaded', hasPanelCss);
  const hasExternalJs = await p1.evaluate(() =>
    [...document.querySelectorAll('script[src]')].some(s => s.src.includes('reader.js'))
  );
  check('External reader.js loaded', hasExternalJs);
  const hasPanelJs = await p1.evaluate(() =>
    [...document.querySelectorAll('script[src]')].some(s => s.src.includes('courseware-panel.js'))
  );
  check('External courseware-panel.js loaded', hasPanelJs);

  // 2. Page renders correctly (theme restore preserved, title visible)
  console.log('\n[Deploy Test 2] Page renders correctly');
  const title = await p1.title();
  check('Page title matches', title.includes('身份的迷失'));
  const themeRestored = await p1.evaluate(() =>
    document.documentElement.getAttribute('data-theme') === 'light'
  );
  check('Theme restore script works', themeRestored);
  const sidebarVisible = await p1.evaluate(() => {
    const s = document.querySelector('.sidebar');
    return s && s.offsetWidth > 0;
  });
  check('Sidebar is visible', sidebarVisible);

  // 3. Courseware button in topbar
  console.log('\n[Deploy Test 3] Courseware toggle button');
  const cwBtn = await p1.$('.chapter-nav .courseware-btn');
  check('Topbar courseware button exists', !!cwBtn);

  // 4. Click → panel opens
  if (cwBtn) {
    await cwBtn.click();
    await p1.waitForTimeout(800);
    const panelOpen = await p1.evaluate(() => {
      const p = document.getElementById('cwPanel');
      return p && p.classList.contains('open');
    });
    check('Panel opens on click', panelOpen);

    const sidebarCollapsed = await p1.evaluate(() => {
      const s = document.querySelector('.sidebar');
      return s && s.classList.contains('collapsed');
    });
    check('Sidebar collapses when panel opens', sidebarCollapsed);

    // 5. Panel has content after fetch
    console.log('\n[Deploy Test 4] Panel content loads');
    await p1.waitForTimeout(2000); // Wait for courseware.json fetch
    const hasContent = await p1.evaluate(() => {
      const content = document.querySelector('.cw-panel-content');
      return content && content.textContent.length > 50;
    });
    check('Panel has content from courseware.json', hasContent);

    const hasQuestions = await p1.evaluate(() => {
      return document.querySelectorAll('.cw-question-text').length > 0;
    });
    check('Panel has questions', hasQuestions);

    // 6. Close button
    await p1.click('.cw-panel-close');
    await p1.waitForTimeout(800);
    const panelClosed = await p1.evaluate(() => {
      const p = document.getElementById('cwPanel');
      return p && p.classList.contains('closed');
    });
    check('Panel closes on close button', panelClosed);
  }
  await p1.close();

  // 7. EN chapter has courseware button
  console.log('\n[Deploy Test 5] EN courseware button');
  const p2 = await ctx.newPage();
  await p2.goto(EN_CH01, { waitUntil: 'networkidle', timeout: 15000 });
  const enBtn = await p2.$('.topbar .courseware-btn');
  check('EN topbar courseware button exists', !!enBtn);
  await p2.close();

  // Summary
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
