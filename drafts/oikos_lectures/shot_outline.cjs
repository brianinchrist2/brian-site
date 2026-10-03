// 大纲页截图：默认（展开到章）、全开、搜索命中、瀑布图视图
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const url = process.argv[2], tag = process.argv[3] || 'ol';
const CK = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async () => {
  const b = await chromium.launch({ executablePath: CK, args: ['--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  await p.route('**://fonts.googleapis.com/**', r => r.abort());
  await p.route('**://fonts.gstatic.com/**', r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  await p.goto(url, { waitUntil: 'commit' }); await p.waitForTimeout(900);
  await p.screenshot({ path: `/tmp/${tag}-1-def.png` });
  await p.click('#tree-tools .btn[data-lv="3"]'); await p.waitForTimeout(250);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(150);
  await p.screenshot({ path: `/tmp/${tag}-2-all.png` });
  await p.fill('#q', '蒲公英'); await p.waitForTimeout(450);
  await p.screenshot({ path: `/tmp/${tag}-3-search.png` });
  await p.fill('#q', ''); await p.waitForTimeout(350);
  await p.click('#t-mm'); await p.waitForTimeout(700);
  await p.click('#z-fit'); await p.waitForTimeout(400);
  await p.screenshot({ path: `/tmp/${tag}-4-mm.png` });
  console.log(JSON.stringify({ errs, files: [`/tmp/${tag}-1-def.png`, `/tmp/${tag}-2-all.png`, `/tmp/${tag}-3-search.png`, `/tmp/${tag}-4-mm.png`] }));
  await b.close();
})();
