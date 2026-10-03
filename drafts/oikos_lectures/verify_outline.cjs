// 可折叠大纲验收：层级计数、折叠/展开、按层级收放、键盘、搜索、打印、零外链、无报错
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const url = process.argv[2];
const CK = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = { counts: {}, def: {}, lvl: {}, toggle: {}, keys: {}, search: {}, print: {}, via: {}, errs: [] };

(async () => {
  const b = await chromium.launch({ executablePath: CK, args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.route('**://fonts.googleapis.com/**', r => r.abort());
  await p.route('**://fonts.gstatic.com/**', r => r.abort());
  p.on('pageerror', e => OUT.errs.push('pageerror: ' + e.message));
  await p.goto(url, { waitUntil: 'commit', timeout: 40000 });
  await p.waitForTimeout(900);

  const vis = (sel) => p.evaluate((s) => {
    const on = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    return [...document.querySelectorAll(s)].filter(on).length;
  }, sel);

  // 1) 结构计数 + 每个节点都有标题与一句话总结
  OUT.counts = await p.evaluate(() => {
    const txt = (e, s) => { const n = e.querySelector(s); return n ? n.textContent.trim() : ''; };
    const l3 = [...document.querySelectorAll('li.lv3')];
    const empt = l3.filter(li => !txt(li, '.ttl') || !txt(li, '.ps')).map(li => li.dataset.id);
    const l2 = [...document.querySelectorAll('li.lv2')];
    const empt2 = l2.filter(li => !txt(li, '.ttl') || !txt(li, 'p.sum')).map(li => li.dataset.id);
    const dup = (xs) => { const m = {}; xs.forEach(x => m[x] = (m[x] || 0) + 1); return Object.keys(m).filter(k => m[k] > 1); };
    const titles = [...document.querySelectorAll('li.lv3 .ttl')].map(e => e.textContent.trim());
    const sumLen = l3.map(li => txt(li, '.ps').length);
    return { lv1: document.querySelectorAll('li.lv1').length, lv2: l2.length, lv3: l3.length,
      emptyPointText: empt, emptyChapterText: empt2, dupPointTitles: dup(titles),
      sumMin: Math.min(...sumLen), sumMax: Math.max(...sumLen),
      deep: document.querySelectorAll('li.lv3 > .kids').length };
  });

  // 2) 默认状态：展开到「章」 → 要点全折起
  OUT.def = { visLv1: await vis('li.lv1'), visLv2: await vis('li.lv2'), visLv3: await vis('li.lv3'),
    pressed: await p.evaluate(() => [...document.querySelectorAll('#tree-tools .btn')].map(b => b.dataset.lv + ':' + b.getAttribute('aria-pressed'))) };

  // 3) 按层级收放
  const lvl = async (n) => { await p.click(`#tree-tools .btn[data-lv="${n}"]`); await p.waitForTimeout(120);
    return { lv1: await vis('li.lv1'), lv2: await vis('li.lv2'), lv3: await vis('li.lv3') }; };
  OUT.lvl.to1 = await lvl(1);
  OUT.lvl.to3 = await lvl(3);
  OUT.lvl.to2 = await lvl(2);

  // 4) 点标题折叠/展开（第 1 部）
  await p.click('li.lv1[data-id="g0"] > .row .ttl');
  await p.waitForTimeout(120);
  OUT.toggle.afterClick = { off: await p.evaluate(() => document.querySelector('li.lv1[data-id="g0"]').classList.contains('off')),
    visLv2: await vis('li.lv2') };
  await p.click('li.lv1[data-id="g0"] > .row .ttl');
  await p.waitForTimeout(120);
  OUT.toggle.afterClick2 = { off: await p.evaluate(() => document.querySelector('li.lv1[data-id="g0"]').classList.contains('off')),
    visLv2: await vis('li.lv2') };

  // 5) 键盘：聚焦方框后 ← 折起、→ 展开
  await p.click('li.lv2[data-id="g0c0"] > .row .tw');
  await p.evaluate(() => document.querySelector('li.lv2[data-id="g0c0"] > .row .tw').focus());
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(100);
  OUT.keys.afterLeft = await p.evaluate(() => ({ off: document.querySelector('li.lv2[data-id="g0c0"]').classList.contains('off'),
    aria: document.querySelector('li.lv2[data-id="g0c0"] > .row .tw').getAttribute('aria-expanded') }));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
  OUT.keys.afterRight = await p.evaluate(() => ({ off: document.querySelector('li.lv2[data-id="g0c0"]').classList.contains('off'),
    visLv3: [...document.querySelectorAll('li.lv3')].filter(e => e.offsetWidth || e.offsetHeight).length }));

  // 6) 搜索：命中自动展开、无关隐藏；清空后回到原折叠态
  await p.fill('#q', '蒲公英'); await p.waitForTimeout(400);
  OUT.search.hit = await p.textContent('#hit');
  OUT.search.state = await p.evaluate(() => ({
    searching: document.getElementById('ol').classList.contains('searching'),
    hits: document.querySelectorAll('li.hit').length,
    hidden: document.querySelectorAll('li.hide').length,
    visHit: [...document.querySelectorAll('li.hit')].filter(e => e.offsetWidth || e.offsetHeight).length,
    hitHasHiddenAncestor: [...document.querySelectorAll('li.hit')].some(e => { let p = e.parentNode; while (p && p.tagName) { if (p.classList && p.classList.contains('hide')) return true; p = p.parentNode; } return false; }),
  }));
  await p.fill('#q', ''); await p.waitForTimeout(400);
  OUT.search.cleared = { searching: await p.evaluate(() => document.getElementById('ol').classList.contains('searching')), visLv3: await vis('li.lv3') };

  // 7) 打印：全部展开、工具条隐藏
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(200);
  OUT.print = { visLv3: await vis('li.lv3'), barHidden: await p.evaluate(() => { const b = document.querySelector('.bar'); return !(b.offsetWidth || b.offsetHeight); }),
    overflowX: await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) };
  await p.emulateMedia({ media: 'screen' });

  // 8) 零外链 + 画面不横向溢出
  OUT.via = await p.evaluate(() => ({
    external: [...document.querySelectorAll('[src],[href]')].map(e => e.getAttribute('src') || e.getAttribute('href')).filter(u => u && /^(https?:)?\/\//i.test(u)),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    view: document.getElementById('v-tree').style.display,
  }));

  // 9) 瀑布图视图仍可用（几何数据齐全、stage 有尺寸）
  await p.click('#t-mm'); await p.waitForTimeout(400);
  OUT.mm = await p.evaluate(() => ({
    stageW: document.getElementById('stage').clientWidth, stageH: document.getElementById('stage').clientHeight,
    boxes: JSON.parse(document.getElementById('mm-geom').textContent).length,
    viewBox: document.getElementById('mm').getAttribute('viewBox'), lv: document.getElementById('z-lv').textContent,
  }));

  // 10) 深链 #g3 → 展开并滚动到位（须整页重载才会跑初始化）
  await p.goto('about:blank');
  await p.goto(url.replace(/#.*$/, '') + '#g3', { waitUntil: 'commit' }); await p.waitForTimeout(1400);
  OUT.hash = await p.evaluate(() => ({ off: document.querySelector('li.lv1[data-id="g3"]').classList.contains('off'), scrollY: Math.round(window.scrollY) }));

  console.log(JSON.stringify(OUT, null, 1));
  await b.close();
})();
