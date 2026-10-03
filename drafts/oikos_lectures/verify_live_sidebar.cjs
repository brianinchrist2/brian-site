// 线上验：reader 侧栏「讲义/全书导览」组 —— 链接可见、可点、目标可达（生产环境）
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const B = 'https://jiadongli.online/organicchurch/library/';
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  await p.route('**://fonts.googleapis.com/**', r => r.abort());
  await p.route('**://fonts.gstatic.com/**', r => r.abort());
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message)));
  await p.goto(B + 'reader.html?book=oikos_church', { waitUntil: 'commit', timeout: 45000 });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const s = document.getElementById('rdr-toc-scroll'); if (s) s.scrollTop = s.scrollHeight; });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const box = document.getElementById('rdr-toc-extras');
    if (!box) return { hasBox: false };
    const groups = [...box.querySelectorAll('.rdr-extras-group')].map(g => ({
      title: g.querySelector('.rdr-extras-title')?.textContent,
      items: [...g.querySelectorAll('.rdr-extras-item')].map(a => ({
        label: a.querySelector('.rdr-extras-label')?.textContent,
        href: a.getAttribute('href'),
        note: a.querySelector('.rdr-extras-note')?.textContent || '',
      })),
    }));
    return { hasBox: true, hidden: box.hidden, groups, totalItems: box.querySelectorAll('.rdr-extras-item').length };
  });
  await p.screenshot({ path: '/tmp/live-sidebar-restored.png' });
  // 目标可达性：直接导航到「全书大纲」链接目标
  let mm = null;
  if (r.hasBox) {
    const g = r.groups.find(x => x.title && x.title.indexOf('全书导览') >= 0);
    const href = g && g.items[0] && g.items[0].href;
    if (href) {
      const target = new URL(href, B + 'reader.html').href;
      const resp = await p.goto(target, { waitUntil: 'commit', timeout: 30000 });
      await p.waitForTimeout(2500);
      mm = await p.evaluate(() => ({
        title: document.title,
        lv1: document.querySelectorAll('li.lv1').length,
        nodes: document.querySelectorAll('rect[data-role="box"]').length,
        chips: document.querySelectorAll('.chip').length,
      }));
      mm.httpStatus = resp && resp.status();
      mm.target = target;
      await p.screenshot({ path: '/tmp/live-mindmap-restored.png' });
    }
  }
  console.log(JSON.stringify({ r, mm, errs }, null, 1));
  await b.close();
})();
