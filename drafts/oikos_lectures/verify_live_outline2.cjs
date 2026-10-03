// 线上默认视图 + 折叠交互复验（用 aria-pressed 判定，非 class）
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const U = 'https://jiadongli.online/organicchurch/library/oikos_church/lectures/mindmap.html';
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  await p.goto(U, { waitUntil: 'commit', timeout: 30000 }); await p.waitForTimeout(2000);
  const vis = s => `[...document.querySelectorAll('${s}')].filter(e=>e.getClientRects().length).length`;
  const def = await p.evaluate(`(() => ({
    treePressed: document.getElementById('t-tree').getAttribute('aria-pressed'),
    mmPressed: document.getElementById('t-mm').getAttribute('aria-pressed'),
    treeDisplay: getComputedStyle(document.getElementById('v-tree')).display,
    stageDisplay: getComputedStyle(document.getElementById('stage')).display,
    visLv1: ${vis('li.lv1')}, visLv2: ${vis('li.lv2')}, visLv3: ${vis('li.lv3')},
  }))()`);
  await p.screenshot({ path: '/tmp/live-ol-def.png' });
  // 点「要点」全开 → 再折一个部 → 再收起
  await p.click('#tree-tools .btn[data-lv="3"]'); await p.waitForTimeout(300);
  const all = await p.evaluate(`(${vis('li.lv3')})`);
  await p.click('li.lv1[data-id="g1"] .row'); await p.waitForTimeout(250);
  const folded = await p.evaluate(`({ visLv2: ${vis('li.lv2')}, off: document.querySelector('li.lv1[data-id="g1"]').classList.contains('off') })`);
  await p.click('li.lv1[data-id="g1"] .row'); await p.waitForTimeout(250);
  const back = await p.evaluate(`({ visLv2: ${vis('li.lv2')} })`);
  console.log(JSON.stringify({ def, allLv3Visible: all, folded, back, errs }, null, 1));
  await b.close();
})();
