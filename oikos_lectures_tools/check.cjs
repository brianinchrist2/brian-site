// Layout checker: overflow beyond slide/safe area, small text, clipped text.
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
(async () => {
  const files = process.argv.slice(2);
  const b = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  let totalIssues = 0;
  for (const file of files) {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('requestfailed', r => errs.push('REQFAIL ' + r.url()));
    await p.goto('file://' + file + '#1'); await p.waitForTimeout(400);
    const n = await p.evaluate(() => document.querySelectorAll('.stage > .slide').length);
    const issues = [];
    for (let k = 1; k <= n; k++) {
      await p.evaluate(k => { location.hash = '#' + k; }, k);
      await p.waitForTimeout(120);
      const r = await p.evaluate((k) => {
        const s = document.querySelectorAll('.stage > .slide')[k - 1];
        s.querySelectorAll('.step').forEach(x => x.classList.add('on'));
        const sr = s.getBoundingClientRect();
        const out = [];
        const skip = el => el.closest('.notes, .veil, .veil-v, .cover-num, .q-mark');
        // HTML text elements
        const all = s.querySelectorAll('*');
        for (const el of all) {
          if (skip(el)) continue;
          if (el instanceof SVGElement && el.tagName !== 'svg') continue;
          const hasText = Array.from(el.childNodes).some(c => c.nodeType === 3 && c.textContent.trim());
          const rc = el.getBoundingClientRect();
          if (!rc.width || !rc.height) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          const label = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) + ' ' + (el.textContent || '').trim().slice(0, 18);
          if (rc.left < sr.left - 2 || rc.right > sr.right + 2 || rc.top < sr.top - 2 || rc.bottom > sr.bottom + 2)
            out.push(`OUT-OF-SLIDE <${el.tagName.toLowerCase()} ${label}> [${Math.round(rc.left)},${Math.round(rc.top)},${Math.round(rc.right)},${Math.round(rc.bottom)}]`);
          if (hasText) {
            const fs = parseFloat(cs.fontSize);
            if (fs < 27.5) out.push(`SMALL-TEXT ${fs}px <${el.tagName.toLowerCase()} ${label}>`);
            if (rc.bottom > sr.top + 962 && !el.closest('.chrome-foot')) out.push(`IN-FOOTER-ZONE bottom=${Math.round(rc.bottom)} <${label}>`);
            if (rc.top < sr.top + 60) out.push(`TOO-HIGH top=${Math.round(rc.top)} <${label}>`);
            if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible') out.push(`CLIPPED <${label}>`);
          }
        }
        // SVG text effective size
        for (const t of s.querySelectorAll('svg text')) {
          if (skip(t)) continue;
          const svg = t.ownerSVGElement; const m = t.getScreenCTM(); if (!m) continue;
          const fs = parseFloat(getComputedStyle(t).fontSize) * Math.hypot(m.a, m.b);
          if (fs < 27.5) out.push(`SVG-SMALL-TEXT ${fs.toFixed(1)}px "${t.textContent.slice(0, 16)}"`);
          const rc = t.getBoundingClientRect();
          if (rc.left < sr.left - 2 || rc.right > sr.right + 2 || rc.bottom > sr.top + 966 || rc.top < sr.top + 50) out.push(`SVG-TEXT-OUT "${t.textContent.slice(0, 16)}" [${Math.round(rc.left)},${Math.round(rc.top)},${Math.round(rc.right)},${Math.round(rc.bottom)}]`);
        }
        // svg figures out of safe area
        for (const g of s.querySelectorAll('svg')) {
          if (skip(g) || g.closest('.timer') ) continue;
          const rc = g.getBoundingClientRect();
          if (rc.bottom > sr.top + 975) out.push(`SVG-BOX-LOW bottom=${Math.round(rc.bottom)} (${g.getAttribute('aria-label') || ''})`);
        }
        return out;
      }, k);
      for (const x of r) issues.push(`#${k}: ${x}`);
    }
    // chars per slide
    const counts = await p.evaluate(() => Array.from(document.querySelectorAll('.stage > .slide')).map((s, i) => {
      const c = s.cloneNode(true); c.querySelectorAll('.notes, svg').forEach(x => x.remove());
      const txt = c.textContent.replace(/\s+/g, '');
      const han = (txt.match(/[一-鿿]/g) || []).length;
      return [i + 1, han, txt.length];
    }));
    const heavy = counts.filter(c => c[1] > 180).map(c => `#${c[0]}(${c[1]}字)`);
    console.log(`\n== ${file.split('/').pop()} : ${n} slides; max 汉字/页 = ${Math.max(...counts.map(c => c[1]))}; >180字: ${heavy.join(' ') || '无'}`);
    if (errs.length) console.log('ERRORS:', errs);
    console.log(issues.length ? issues.join('\n') : 'no layout issues');
    totalIssues += issues.length + errs.length;
    await p.close();
  }
  await b.close();
  console.log('\nTOTAL ISSUES', totalIssues);
})();
