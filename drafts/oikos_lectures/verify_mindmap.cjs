// 思维导图验收：文字是否溢框、节点是否出画布/重叠、字体下限、零外链、结构与数据一致
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const url = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await p.route('**://fonts.googleapis.com/**', r => r.abort());
  await p.route('**://fonts.gstatic.com/**', r => r.abort());
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(url, { waitUntil: 'commit', timeout: 40000 });
  await p.waitForTimeout(1200);
  // 合并页默认是大纲视图：先切到瀑布图，否则隐藏元素 getBBox 全为 0
  await p.evaluate(() => { const t = document.getElementById('t-mm'); if (t) t.click(); });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const svg = document.getElementById('mm');
    const geom = JSON.parse(document.getElementById('mm-geom').textContent);
    // 画布尺寸从布局数据推得（viewBox 会随平移缩放变化，不能作准）
    const W = Math.max(...geom.map(g => g.x + g.w));
    const H = Math.max(...geom.map(g => g.y + g.h));
    const gbox = {}; geom.forEach(g => gbox[g.id] = g);
    const rects = [...document.querySelectorAll('rect[data-role="box"]')];
    let overflow = [], outside = [], minfs = 99, fsById = {};
    for (const rc of rects) {
      const id = rc.dataset.id;
      const rb = rc.getBBox();
      if (rb.x < -0.6 || rb.y < -0.6 || rb.x + rb.width > W + 0.6 || rb.y + rb.height > H + 0.6) outside.push({ id, x: +rb.x.toFixed(1), y: +rb.y.toFixed(1), r: +(rb.x + rb.width).toFixed(1), b: +(rb.y + rb.height).toFixed(1) });
      for (const role of ['title', 'sum']) {
        const t = document.querySelector(`text[data-id="${id}"][data-role="${role}"]`);
        if (!t) { overflow.push({ id, role, why: 'missing' }); continue; }
        const tb = t.getBBox(), fs = parseFloat(getComputedStyle(t).fontSize);
        fsById[id] = Math.max(fsById[id] || 0, fs); minfs = Math.min(minfs, fs);
        const tol = 1.2;
        if (tb.x < rb.x - tol || tb.y < rb.y - tol || tb.x + tb.width > rb.x + rb.width + tol || tb.y + tb.height > rb.y + rb.height + tol)
          overflow.push({ id, role, fs, text: [tb.x, tb.y, +(tb.x + tb.width).toFixed(1), +(tb.y + tb.height).toFixed(1)], box: [+rb.x.toFixed(1), +rb.y.toFixed(1), +(rb.x + rb.width).toFixed(1), +(rb.y + rb.height).toFixed(1)] });
      }
    }
    // 2D 重叠：任意两个节点框都不应相交
    const overlaps = [];
    for (let i = 0; i < geom.length; i++) for (let j = i + 1; j < geom.length; j++) {
      const A = geom[i], B = geom[j];
      if (A.x < B.x + B.w - 0.5 && B.x < A.x + A.w - 0.5 && A.y < B.y + B.h - 0.5 && B.y < A.y + A.h - 0.5) overlaps.push([A.id, B.id]);
    }
    // 连线是否穿过节点框（允许穿过自己的起点/终点）
    const crossings = [];
    const ins = 1.5;
    const boxAt = (x, y, ex) => geom.find(g => ex.indexOf(g.id) < 0 && x > g.x + ins && x < g.x + g.w - ins && y > g.y + ins && y < g.y + g.h - ins);
    document.querySelectorAll('.edges path').forEach(pth => {
      const pid = pth.dataset.a + '→' + pth.dataset.b, L = pth.getTotalLength();
      for (let s = 2; s <= 60; s++) {
        const pt = pth.getPointAtLength(L * s / 62);
        const hit = boxAt(pt.x, pt.y, [pth.dataset.a, pth.dataset.b]);
        if (hit) { if (crossings.length < 8) crossings.push({ path: pid, box: hit.id, at: [+pt.x.toFixed(0), +pt.y.toFixed(0)] }); break; }
      }
    });
    const ext = [...document.querySelectorAll('[src],[href]')].map(e => e.getAttribute('src') || e.getAttribute('href')).filter(u => u && /^(https?:)?\/\//i.test(u));
    const chips = [...document.querySelectorAll('.chip')].map(c => c.textContent);
    return {
      canvas: [W, H], nodes: geom.length, kinds: geom.reduce((a, g) => (a[g.kind] = (a[g.kind] || 0) + 1, a), {}),
      overflow, outside, overlaps: overlaps.slice(0, 6), overlapCount: overlaps.length,
      crossings, crossingCount: crossings.length,
      minFont: +minfs.toFixed(2), external: ext, chips: chips.length,
      txtPoints: document.querySelectorAll('li.lv3, .cb li').length,
      txtChapters: document.querySelectorAll('li.lv2, .cb h4').length,
      groups: document.querySelectorAll('li.lv1, details.grp').length,
      paths: document.querySelectorAll('.edges path').length,
      pageH: document.body.scrollHeight,
    };
  });
  console.log(JSON.stringify({ ...r, errs }, null, 1));
  await b.close();
})();
