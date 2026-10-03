// 深链跳转落点测试 + 历史阅读位置 vs 锚点优先级 + 别的书回归
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
const fs = require('fs');
const A = JSON.parse(fs.readFileSync('/Users/brianw/projects/brian-site/drafts/oikos_lectures/anchors.json', 'utf8'));
const ch04 = A.chapters.find(c => c.ch_id === '04');
const target = ch04.headings.find(h => h.text.indexOf('两个见证') >= 0);
const base = 'http://127.0.0.1:8899/library/reader.html?book=oikos_church&ch=';
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  const probe = () => p.evaluate((aid) => {
    const main = document.getElementById('rdr-main');
    const el = document.querySelector('.rdr-chapter-body [id="' + aid + '"]');
    if (!el) return { found: false };
    const mt = main.getBoundingClientRect().top, et = el.getBoundingClientRect().top;
    return { found: true, delta: Math.round(et - mt), scrollTop: Math.round(main.scrollTop), cls: el.className, h: Math.round(main.scrollHeight) };
  }, target.aid);

  // 场景1：先浏览本章并制造一个「历史阅读位置」（滚到很下面），再带锚点重进
  await p.goto(base + '04', { waitUntil: 'commit' }); await p.waitForTimeout(1500);
  await p.evaluate(() => { const m = document.getElementById('rdr-main'); m.scrollTop = m.scrollHeight - 2000; }); await p.waitForTimeout(200);
  const before = await p.evaluate(() => Math.round(document.getElementById('rdr-main').scrollTop));
  await p.waitForTimeout(400); // 让 saveScroll 生效
  await p.goto(base + '04#' + encodeURIComponent(target.aid), { waitUntil: 'commit' }); await p.waitForTimeout(1800);
  const s1 = await probe();

  // 场景2：同页 hashchange（点别的锚点）
  const other = ch04.headings[1];
  await p.evaluate((aid) => { window.location.hash = '#' + aid; }, other.aid); await p.waitForTimeout(900);
  const s2 = await p.evaluate((aid) => {
    const main = document.getElementById('rdr-main');
    const el = document.querySelector('.rdr-chapter-body [id="' + aid + '"]');
    return { delta: Math.round(el.getBoundingClientRect().top - main.getBoundingClientRect().top), cls: el.className, want: aid };
  }, other.aid);

  // 场景3：别的书（回归）
  await p.goto('http://127.0.0.1:8899/library/reader.html?book=lordship_gospel', { waitUntil: 'commit' }); await p.waitForTimeout(2500);
  const other_book = await p.evaluate(() => {
    const links = [...document.querySelectorAll('.rdr-toc-item')];
    return { book: new URLSearchParams(location.search).get('book'), tocItems: links.length, firstHref: links[0] ? links[0].getAttribute('href') : null };
  });
  await p.goto('http://127.0.0.1:8899/library/reader.html?book=lordship_gospel&ch=1', { waitUntil: 'commit' }); await p.waitForTimeout(2200);
  const other_book_ch = await p.evaluate(() => ({
    title: document.querySelector('.rdr-chapter-title')?.textContent?.slice(0, 24),
    heads: document.querySelectorAll('.rdr-chapter-body h2,.rdr-chapter-body h3').length,
    idsAssigned: [...document.querySelectorAll('.rdr-chapter-body h2,.rdr-chapter-body h3')].filter(h => h.id).length,
    bodyLen: (document.querySelector('.rdr-chapter-body')?.textContent || '').length,
  }));

  console.log(JSON.stringify({ target: { aid: target.aid, text: target.text }, savedPosBefore: before, jump: s1, hashchange: s2, otherBook: other_book, otherBookChapter: other_book_ch, errs }, null, 1));
  await b.close();
})();
