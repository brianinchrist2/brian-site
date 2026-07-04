// Deployed site test: resizable panel on production
import { chromium } from 'playwright';
const BASE = 'https://master.brianinchrist-site.pages.dev/organicchurch/books';
const CH01 = BASE + '/book2/chapter01.html';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let passed = 0, failed = 0;
  function check(name, ok) { if (ok) { passed++; console.log('  PASS:', name); } else { failed++; console.log('  FAIL:', name); } }

  // A. Basic page load
  console.log('\n[Deploy] Basic load');
  const p1 = await ctx.newPage();
  await p1.goto(CH01, { waitUntil: 'networkidle', timeout: 15000 });
  check('Page loads', await p1.title() !== '');
  check('reader.css loads', await p1.evaluate(() =>
    [...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href.includes('reader.css'))));
  check('courseware-panel.css loads', await p1.evaluate(() =>
    [...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href.includes('courseware-panel.css'))));
  check('courseware-panel.js loads', await p1.evaluate(() =>
    [...document.querySelectorAll('script[src]')].some(s => s.src.includes('courseware-panel.js'))));
  await p1.close();

  // B. Resize functionality
  console.log('\n[Deploy] Resize');
  const p2 = await ctx.newPage();
  await p2.goto(CH01, { waitUntil: 'networkidle', timeout: 15000 });
  await p2.evaluate(() => { try { localStorage.clear(); } catch(e) {} });
  await p2.reload({ waitUntil: 'networkidle' });
  await p2.waitForTimeout(500);

  // Open panel
  await p2.click('.chapter-nav .courseware-btn');
  await p2.waitForTimeout(800);

  // Check handle exists
  const handle = await p2.$('.cw-panel-resize-handle');
  check('Resize handle exists on deployed', !!handle);

  // Check default width
  const w1 = await p2.evaluate(() =>
    parseInt(getComputedStyle(document.getElementById('cwPanel')).width, 10));
  check('Default width ~360px', w1 >= 350 && w1 <= 370);

  // Drag to resize
  const box = await p2.evaluate(() => {
    const r = document.querySelector('.cw-panel-resize-handle').getBoundingClientRect();
    return { x: r.left + 4, y: r.top + 10 };
  });
  await p2.mouse.move(box.x, box.y);
  await p2.mouse.down();
  await p2.mouse.move(box.x - 80, box.y, { steps: 10 });
  await p2.mouse.up();
  await p2.waitForTimeout(200);

  const w2 = await p2.evaluate(() =>
    parseInt(getComputedStyle(document.getElementById('cwPanel')).width, 10));
  check('Panel widened (~440px)', w2 >= 430 && w2 <= 450);

  const cssVar = await p2.evaluate(() =>
    parseInt(document.documentElement.style.getPropertyValue('--cw-panel-w'), 10));
  check('CSS var updated (~440px)', cssVar >= 430 && cssVar <= 450);

  const saved = await p2.evaluate(() =>
    parseInt(localStorage.getItem('cw_panel_width'), 10));
  check('localStorage saved (~440px)', saved >= 430 && saved <= 450);

  // Layout shift
  const marginR = await p2.evaluate(() =>
    parseInt(getComputedStyle(document.querySelector('.layout')).marginRight, 10));
  check('Layout margin matches width (' + marginR + ' ≈ ' + w2 + ')', Math.abs(marginR - w2) < 20);

  await p2.close();

  // C. Width persistence across reload
  console.log('\n[Deploy] Persistence');
  const p3 = await ctx.newPage();
  await p3.goto(CH01, { waitUntil: 'networkidle', timeout: 15000 });
  // Set width and state
  await p3.evaluate(() => {
    localStorage.setItem('cw_panel_width', '420');
    localStorage.setItem('cw_panel_open', 'open');
  });
  await p3.reload({ waitUntil: 'networkidle' });
  await p3.waitForTimeout(1200); // Wait for auto-open
  const w3 = await p3.evaluate(() =>
    parseInt(getComputedStyle(document.getElementById('cwPanel')).width, 10));
  check('Width persisted (420px)', w3 >= 410 && w3 <= 430);
  await p3.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
