// 拼图素材：左=大纲（要点展开，可见 ↗ 提示），右=点了第四章某要点后正文落点（高亮）
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const O = 'http://127.0.0.1:8899/library/oikos_church/lectures/mindmap.html';
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(O, { waitUntil: 'commit' }); await p.waitForTimeout(1200);
  await p.click('#tree-tools .btn[data-lv="3"]'); await p.waitForTimeout(400);
  // 滚到第四章附近，让「部/章 + 要点」都在画面里
  await p.evaluate(() => { const li = document.querySelector('li.lv1[data-id="g5"]'); const y = li.getBoundingClientRect().top + window.scrollY - 210; window.scrollTo(0, y); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/fig-outline.png' });
  // 点第四章第一条要点 → 正文落点
  const href = await p.evaluate(() => { const a = [...document.querySelectorAll('a.pt')].find(x => x.getAttribute('href').indexOf('&ch=04') >= 0 && x.getAttribute('href').indexOf('#') > 0); return a ? a.getAttribute('href') : null; });
  const [pp] = await Promise.all([ctx.waitForEvent('page'), p.click(`a.pt[href="${href}"]`)]);
  await pp.setViewportSize({ width: 1180, height: 900 });
  await pp.waitForTimeout(1500);  // 高亮 2.2s，赶在消退前截
  await pp.screenshot({ path: '/tmp/fig-reader.png' });
  console.log(JSON.stringify({ href, ok: true }));
  await b.close();
})();
