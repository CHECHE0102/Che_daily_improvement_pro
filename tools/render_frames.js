// Screenshot lesson frames: node tools/render_frames.js frames.json  ([{html, png}, ...], 1080x1920)
const { chromium } = require('playwright');
const jobs = require(require('path').resolve(process.argv[2]));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  for (const j of jobs) {
    await p.goto('file://' + j.html);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    await p.screenshot({ path: j.png });
  }
  await b.close();
})();
