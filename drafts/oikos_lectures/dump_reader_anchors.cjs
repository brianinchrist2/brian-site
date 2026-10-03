// 逐章抓取 reader 运行时生成的小节 anchor id，落盘给 Python 与 anchors.json 逐条比对
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const B = 'http://127.0.0.1:8899/library/reader.html?book=oikos_church&ch=';
const OUT = process.argv[2] || '/tmp/reader_anchors.json';
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  const ids = ['preface', 'keywords', '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', 'conclusion', 'appendix'];
  const res = {};
  for (const ch of ids) {
    await p.goto(B + ch, { waitUntil: 'commit', timeout: 40000 });
    await p.waitForTimeout(900);
    res[ch] = await p.evaluate(() => [...document.querySelectorAll('.rdr-chapter-body h2,.rdr-chapter-body h3,.rdr-chapter-body h4')].map(h => h.id));
  }
  fs.writeFileSync(OUT, JSON.stringify({ ids: res, errs }, null, 1));
  console.log(JSON.stringify({ chapters: Object.keys(res).length, totalHeads: Object.values(res).reduce((a, x) => a + x.length, 0), errs, sample: res['00'] ? res['00'].slice(0, 3) : [] }, null, 1));
  await b.close();
})();
