// 思维导图页面截图（拦掉外部字体，保持离线一致）
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const url = process.argv[2], out = process.argv[3] || '/tmp/mm';
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await p.route('**://fonts.googleapis.com/**', r => r.abort());
  await p.route('**://fonts.gstatic.com/**', r => r.abort());
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(url, { waitUntil: 'commit', timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: out + '-1-full.png' });           // 首屏（默认缩放）
  await p.click('#z-fit'); await p.waitForTimeout(600);
  await p.screenshot({ path: out + '-2-fit.png' });            // 适应全图
  await p.click('#z-100'); await p.waitForTimeout(600);
  await p.screenshot({ path: out + '-3-100.png' });            // 100%
  const m = await p.evaluate(() => ({
    svgVb: document.getElementById('mm').getAttribute('viewBox'),
    stage: [document.getElementById('stage').clientWidth, document.getElementById('stage').clientHeight],
    chips: document.querySelectorAll('.chip').length,
    boxes: JSON.parse(document.getElementById('mm-geom').textContent).length,
    txtPoints: document.querySelectorAll('.cb li').length,
    lvl: document.getElementById('z-lv').textContent,
    external: [...document.querySelectorAll('[src],[href]')].map(e => e.getAttribute('src') || e.getAttribute('href')).filter(u => u && /^https?:/i.test(u)),
  }));
  console.log(JSON.stringify({ ...m, errs }, null, 1));
  await b.close();
})();
