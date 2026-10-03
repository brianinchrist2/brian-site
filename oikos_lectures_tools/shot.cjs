// usage: node shot.cjs <url> <out.png> [w h]
const { chromium } = require('/Users/brianw/.hermes/hermes-agent/node_modules/playwright-core');
(async () => {
  const [url, out, w, h] = process.argv.slice(2);
  const b = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const p = await b.newPage({ viewport: { width: +(w||1600), height: +(h||900) } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()) });
  await p.goto(url); await p.waitForTimeout(800);
  await p.screenshot({ path: out });
  if (errs.length) console.log('ERRORS', errs);
  await b.close();
})();
