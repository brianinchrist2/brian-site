// 本地验：侧栏「全书导览」组 + 思维导图链接（位置在目录最下面、可点、目标存在）
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const B = 'http://127.0.0.1:8899/library/';
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  await p.route('**://fonts.googleapis.com/**', r => r.abort());
  await p.route('**://fonts.gstatic.com/**', r => r.abort());
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message)));
  await p.goto(B + 'reader.html?book=oikos_church', { waitUntil: 'commit', timeout: 40000 });
  await p.waitForTimeout(2500);
  // 滚到侧栏底部
  await p.evaluate(() => { const s = document.getElementById('rdr-toc-scroll'); s.scrollTop = s.scrollHeight; });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const box = document.getElementById('rdr-toc-extras');
    const groups = [...box.querySelectorAll('.rdr-extras-group')].map(g => ({
      title: g.querySelector('.rdr-extras-title')?.textContent,
      items: [...g.querySelectorAll('.rdr-extras-item')].map(a => ({ label: a.querySelector('.rdr-extras-label').textContent, href: a.getAttribute('href'), note: a.querySelector('.rdr-extras-note')?.textContent || '' })),
    }));
    const last = [...box.querySelectorAll('.rdr-extras-item')].pop();
    const lastY = last.getBoundingClientRect().top;
    const btnY = document.getElementById('rdr-toc-bookshelf').getBoundingClientRect().top;
    return { groups, totalItems: box.querySelectorAll('.rdr-extras-item').length, lastHref: last.getAttribute('href'), lastY: Math.round(lastY), btnY: Math.round(btnY), stat: document.querySelector('.rdr-book-stat')?.textContent || '' };
  });
  // 目标文件是否可达（相对 reader.html 解析）
  const target = new URL(r.lastHref, B + 'reader.html').href;
  const resp = await p.goto(target, { waitUntil: 'commit', timeout: 30000 });
  const code = resp && resp.status();
  await p.waitForTimeout(800);
  const mp = await p.evaluate(() => ({ title: document.title, nodes: document.querySelectorAll('rect[data-role="box"]').length, chips: document.querySelectorAll('.chip').length, lv1: document.querySelectorAll('li.lv1').length, lv2: document.querySelectorAll('li.lv2').length, lv3: document.querySelectorAll('li.lv3').length, defView: document.querySelector('#t-tree').classList.contains('sel') ? '大纲' : '瀑布图' }));
  console.log(JSON.stringify({ ...r, target, httpStatus: code, mindmapPage: mp, errs }, null, 1));
  await p.goto(B + 'reader.html?book=oikos_church', { waitUntil: 'commit' });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const s = document.getElementById('rdr-toc-scroll'); s.scrollTop = s.scrollHeight; });
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/sidebar-mindmap.png' });
  await b.close();
})();
