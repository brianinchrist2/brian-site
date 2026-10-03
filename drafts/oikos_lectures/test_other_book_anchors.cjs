// 回归：别的书（lordship_gospel）也有小节 id 与深链跳转
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const B = 'http://127.0.0.1:8899/library/reader.html?book=lordship_gospel&ch=';
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  const out = {};
  for (const ch of ['00', '03']) {
    await p.goto(B + ch, { waitUntil: 'commit' }); await p.waitForTimeout(2000);
    out['ch' + ch] = await p.evaluate(() => {
      const hs = document.querySelectorAll('.rdr-chapter-body h2,.rdr-chapter-body h3,.rdr-chapter-body h4');
      return { title: (document.querySelector('.rdr-chapter-title') || {}).textContent ? document.querySelector('.rdr-chapter-title').textContent.slice(0, 26) : null, heads: hs.length, ids: [...hs].filter(h => h.id).length, bodyLen: (document.querySelector('.rdr-chapter-body') || {}).textContent ? document.querySelector('.rdr-chapter-body').textContent.length : 0 };
    });
  }
  await p.goto(B + '03', { waitUntil: 'commit' }); await p.waitForTimeout(1600);
  const aid = await p.evaluate(() => { const h = document.querySelectorAll('.rdr-chapter-body h2,.rdr-chapter-body h3')[2]; return h ? h.id : null; });
  await p.goto(B + '03#' + encodeURIComponent(aid), { waitUntil: 'commit' }); await p.waitForTimeout(1800);
  out.deepJump = await p.evaluate((a) => { const m = document.getElementById('rdr-main'); const e = document.querySelector('.rdr-chapter-body [id="' + a + '"]'); return e ? { delta: Math.round(e.getBoundingClientRect().top - m.getBoundingClientRect().top), cls: e.className } : { found: false }; }, aid);
  out.aidUsed = aid; out.errs = errs;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
