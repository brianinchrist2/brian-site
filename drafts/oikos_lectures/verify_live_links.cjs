// 线上端到端：从线上大纲页点要点 → 线上 reader 落到该小节
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const O = 'https://jiadongli.online/organicchurch/library/oikos_church/lectures/mindmap.html';
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  const out = { errs };
  try {
    await p.goto(O, { waitUntil: 'commit', timeout: 30000 }); await p.waitForTimeout(2500);
    await p.click('#tree-tools .btn[data-lv="3"]'); await p.waitForTimeout(400);
    out.pointLinks = await p.evaluate(() => document.querySelectorAll('a.pt').length);
    const targets = await p.evaluate(() => [...document.querySelectorAll('a.pt')].map(a => a.getAttribute('href')));
    const picks = ['&ch=04', '&ch=15', '&ch=18'].map(c => targets.find(h => h.indexOf(c) >= 0 && h.indexOf('#') > 0));
    out.picked = picks;
    out.results = [];
    for (const h of picks) {
      const [pp] = await Promise.all([ctx.waitForEvent('page', { timeout: 20000 }), p.click(`a.pt[href="${h}"]`)]);
      await pp.waitForTimeout(2600);
      out.results.push(await pp.evaluate(() => {
        const main = document.getElementById('rdr-main');
        const hit = document.querySelector('.rdr-anchor-hit');
        const hs = [...document.querySelectorAll('.rdr-chapter-body h2,.rdr-chapter-body h3')];
        const inView = hs.find(x => { const d = x.getBoundingClientRect().top - main.getBoundingClientRect().top; return d > -40 && d < 260; });
        return { url: location.pathname + location.search + location.hash, chapter: (document.querySelector('.rdr-chapter-title') || {}).textContent, flash: !!hit, hitText: hit ? hit.textContent.slice(0, 26) : null, inView: inView ? inView.textContent.slice(0, 26) : null, bodyLen: (document.querySelector('.rdr-chapter-body') || {}).textContent.length };
      }));
      await pp.close();
    }
    out.ok = true;
  } catch (e) { out.err = String(e.message).slice(0, 200); }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
