// YouTube thumbnail (1280x720 png) for a long lesson, from the "thumb" block of its script.
// node tools/make_long_thumb.js lessons/long/V001-cafe-first-day.json out.png
//   thumb: {pose: "barista-panic", bg: "bg-cafe", line1: "咖啡店打工", line2: "第一天就當機？", tag: "12 句英文救你", sticker: "❓"}
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const lesson = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const t = lesson.thumb || {};
const art = 'file://' + path.join(__dirname, '..', 'assets', 'art', 'lesson', lesson.teacher || 'niamh') + '/';
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = `<!doctype html><meta charset=utf-8><style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@900&family=Poppins:wght@800&display=block');
*{margin:0;box-sizing:border-box}body{width:1280px;height:720px;overflow:hidden;position:relative;font-family:Poppins,'Noto Sans TC','Noto Sans CJK TC',sans-serif;color:#fff;background:url(${art}${t.bg || 'bg-cafe'}.webp) center/cover}
.sh{position:absolute;inset:0;background:linear-gradient(90deg,#0b3329f2 0%,#0b3329d0 52%,#0b332920 80%)}
img{position:absolute;right:20px;bottom:-330px;height:1080px;filter:drop-shadow(0 10px 20px #000a)}
.t{position:absolute;left:56px;top:60px;width:760px}
.k{display:inline-block;background:#f0be45;color:#1d2a26;font-size:40px;font-weight:900;border-radius:999px;padding:6px 30px}
.a{white-space:nowrap;font-size:120px;font-weight:900;line-height:1.12;margin-top:22px;text-shadow:0 6px 0 #0006}
.b{white-space:nowrap;font-size:104px;font-weight:900;line-height:1.1;color:#f0be45;text-shadow:0 6px 0 #0006}
.c{margin-top:26px;font-size:50px;font-weight:900;background:#fff;color:#1c6a55;border-radius:22px;padding:10px 28px;display:inline-block;white-space:nowrap}
.q{position:absolute;right:30px;top:250px;font-size:120px}
</style><div class=sh></div><img src="${art}niamh-${t.pose || 'hi'}.webp"><div class=q>${t.sticker || ''}</div>
<div class=t><div class=k>BinBin 小教室</div><div class="a fit">${esc(t.line1)}</div><div class="b fit">${esc(t.line2)}</div>${t.tag ? `<div class="c fit">${esc(t.tag)}</div>` : ''}</div>
<script>document.fonts.ready.then(()=>{document.querySelectorAll('.fit').forEach(e=>{let fs=parseFloat(getComputedStyle(e).fontSize),n=0;while(e.scrollWidth>760&&n++<60){fs*=.95;e.style.fontSize=fs+'px'}});document.title='ok'})</script>`;
(async () => {
  const tmp = path.resolve(process.argv[3] + '.html');
  fs.writeFileSync(tmp, html);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('file://' + tmp);
  await p.waitForFunction(() => document.title === 'ok');
  await p.screenshot({ path: process.argv[3] });
  await b.close();
  fs.unlinkSync(tmp);
})();
