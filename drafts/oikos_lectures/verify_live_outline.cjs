// 线上复验：侧栏条目 + 线上大纲页（真浏览器）
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const R = 'https://jiadongli.online/organicchurch/library/reader.html?book=oikos_church';
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  const out = {};
  try {
    const resp = await p.goto(R, { waitUntil: 'commit', timeout: 30000 });
    out.readerStatus = resp && resp.status();
    await p.waitForTimeout(3000);
    await p.evaluate(() => { const s = document.getElementById('rdr-toc-scroll'); if (s) s.scrollTop = s.scrollHeight; });
    await p.waitForTimeout(500);
    out.sidebar = await p.evaluate(() => {
      const box = document.getElementById('rdr-toc-extras'); if (!box) return 'no-extras';
      const items = [...box.querySelectorAll('.rdr-extras-item')];
      const last = items[items.length - 1];
      return { groups: [...box.querySelectorAll('.rdr-extras-group')].map(g => g.querySelector('.rdr-extras-title').textContent), n: items.length, last: last.querySelector('.rdr-extras-label').textContent, note: last.querySelector('.rdr-extras-note')?.textContent || '', href: last.getAttribute('href') };
    });
    const t = new URL(out.sidebar.href, R).href;
    const r2 = await p.goto(t, { waitUntil: 'commit', timeout: 30000 });
    out.pageStatus = r2 && r2.status();
    await p.waitForTimeout(1500);
    out.page = await p.evaluate(() => ({
      title: document.title, lv1: document.querySelectorAll('li.lv1').length, lv2: document.querySelectorAll('li.lv2').length, lv3: document.querySelectorAll('li.lv3').length,
      defView: document.querySelector('#t-tree').classList.contains('sel') ? '大纲' : '瀑布图',
      visDef: [...document.querySelectorAll('li.lv3')].filter(e => e.getClientRects().length).length,
      boxes: document.querySelectorAll('rect[data-role="box"]').length,
    }));
    out.ok = true;
  } catch (e) { out.err = String(e.message).slice(0, 160); }
  out.errs = errs;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
