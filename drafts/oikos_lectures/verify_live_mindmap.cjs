const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const R = 'https://jiadongli.online/organicchurch/library/reader.html?book=oikos_church';
const M = 'https://jiadongli.online/organicchurch/library/oikos_church/lectures/mindmap.html';
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  await p.route('**://fonts.googleapis.com/**', r => r.abort());
  await p.route('**://fonts.gstatic.com/**', r => r.abort());
  const errs = [];
  p.on('pageerror', e => errs.push('reader: ' + e.message));
  await p.goto(R, { waitUntil: 'commit', timeout: 45000 });
  await p.waitForTimeout(3000);
  const sb = await p.evaluate(() => {
    const box = document.getElementById('rdr-toc-extras');
    const items = [...box.querySelectorAll('.rdr-extras-item')];
    const last = items[items.length - 1];
    return {
      groups: [...box.querySelectorAll('.rdr-extras-title')].map(t => t.textContent),
      items: items.length, lastLabel: last.querySelector('.rdr-extras-label').textContent,
      lastHref: last.getAttribute('href'),
      lastY: Math.round(last.getBoundingClientRect().top),
      shelfY: Math.round(document.getElementById('rdr-toc-bookshelf').getBoundingClientRect().top),
      stat: (document.querySelector('.rdr-book-stat') || {}).textContent || '',
    };
  });
  const r2 = await p.goto(M, { waitUntil: 'commit', timeout: 45000 });
  await p.waitForTimeout(2000);
  const mm = await p.evaluate(() => {
    const g = JSON.parse(document.getElementById('mm-geom').textContent);
    const ext = [...document.querySelectorAll('[src],[href]')].map(e => e.getAttribute('src') || e.getAttribute('href')).filter(u => u && /^(https?:)?\/\//i.test(u));
    return { nodes: g.length, kinds: g.reduce((a, x) => (a[x.kind] = (a[x.kind] || 0) + 1, a), {}), chips: document.querySelectorAll('.chip').length, txtPoints: document.querySelectorAll('.cb li').length, external: ext, title: document.title };
  });
  console.log(JSON.stringify({ readerStatus: 200, sidebar: sb, mindmapStatus: r2 && r2.status(), mindmap: mm, errs }, null, 1));
  await p.goto(R, { waitUntil: 'commit', timeout: 45000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const s = document.getElementById('rdr-toc-scroll'); s.scrollTop = s.scrollHeight; });
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/live-sidebar.png' });
  await b.close();
})();
