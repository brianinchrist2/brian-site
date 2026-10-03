// 端到端：在大纲页点要点 → 新标签打开 reader → 章正确 + 落到该小节（高亮）
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const fs = require('fs');
const O = 'http://127.0.0.1:8899/library/oikos_church/lectures/mindmap.html';
const A = JSON.parse(fs.readFileSync('/Users/brianw/projects/brian-site/drafts/oikos_lectures/anchors.json', 'utf8'));
const want = { '04': '两个见证', '15': '擘饼', '18': '功能' };
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  await p.goto(O, { waitUntil: 'commit' }); await p.waitForTimeout(1200);
  await p.click('#tree-tools .btn[data-lv="3"]'); await p.waitForTimeout(300);
  const out = { links: {}, errs };
  const total = await p.evaluate(() => document.querySelectorAll('a.pt[target="_blank"]').length);
  out.pointLinks = total;
  out.newTab = await p.evaluate(() => [...document.querySelectorAll('a.pt')].every(a => a.getAttribute('target') === '_blank' && (a.getAttribute('rel') || '').indexOf('noopener') >= 0));

  for (const [ch, kw] of Object.entries(want)) {
    const sel = await p.evaluate((ch) => {
      const c = A => null;
      return 0;
    }, ch).catch(() => 0);
  }
  // 用 href 定位：找到指向该章并含指定关键词小节的要点链接
  const targets = await p.evaluate(() => [...document.querySelectorAll('a.pt')].map(a => ({ href: a.getAttribute('href'), title: a.textContent.trim().slice(0, 30) })));
  for (const ch of Object.keys(want)) {
    const t = targets.find(x => x.href.indexOf('&ch=' + ch) >= 0 && x.href.indexOf('#') > 0);
    if (!t) { out.links[ch] = 'no link'; continue; }
    const [pp] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), p.click(`a.pt[href="${t.href}"]`)]);
    await pp.waitForTimeout(2200);
    const r = await pp.evaluate(() => {
      const main = document.getElementById('rdr-main');
      const hit = document.querySelector('.rdr-anchor-hit');
      const hs = [...document.querySelectorAll('.rdr-chapter-body h2,.rdr-chapter-body h3')];
      const firstInView = hs.find(h => { const d = h.getBoundingClientRect().top - main.getBoundingClientRect().top; return d > -40 && d < 200; });
      return { url: location.href.replace(/^https?:\/\/[^/]+/, ''), chapter: (document.querySelector('.rdr-chapter-title') || {}).textContent, bodyLen: (document.querySelector('.rdr-chapter-body') || {}).textContent.length, hitFlash: !!hit, hitText: hit ? hit.textContent.slice(0, 28) : null, inView: firstInView ? firstInView.textContent.slice(0, 28) : null };
    });
    out.links[ch] = { clicked: t.title, ...r };
    await pp.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
