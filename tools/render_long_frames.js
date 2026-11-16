// Render a long lesson's frames (1920x1080) into a silent mp4 with lessons/long/long-render.js.
// node tools/render_long_frames.js frames.json out.mp4 [--shots dir]
//   frames.json = {fps, lesson, art: <file:// dir of the teacher art, with trailing slash>, artDir, jobs:[{si, li, frames, html, info}]}
//   --shots dir  also save a png of each line's last frame (layout check)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const LR = require(path.join(__dirname, '..', 'lessons', 'long', 'long-render.js'));
const cfgPath = path.resolve(process.argv[2]);
const { fps, lesson: lessonPath, art, artDir, jobs } = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const lesson = JSON.parse(fs.readFileSync(lessonPath, 'utf8'));
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const has = n => fs.existsSync(path.join(artDir, n + '.webp'));
(async () => {
  if (shots) fs.mkdirSync(shots, { recursive: true });
  for (const j of jobs) fs.writeFileSync(j.html, LR.page(lesson, j.si, j.li, j.info, { art, has }));
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', process.argv[3]], { stdio: ['pipe', 'inherit', 'inherit'] });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  let n = 0;
  for (const [k, j] of jobs.entries()) {
    await p.goto('file://' + j.html, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => { window.__fit(); for (const a of document.getAnimations()) a.pause(); });
    for (let f = 0; f < j.frames; f++) {
      await p.evaluate(t => { for (const a of document.getAnimations()) a.currentTime = t; }, (f / fps) * 1000);
      const buf = await p.screenshot({ type: 'jpeg', quality: 90 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      n++;
    }
    if (shots) await p.evaluate(t => { for (const a of document.getAnimations()) a.currentTime = t; }, (j.info.dur - 0.04) * 1000);
    if (shots) await p.screenshot({ path: path.join(shots, `line-${String(k).padStart(3, '0')}.png`) });
    // big words must never be cut off: nothing inside the board, chapter card or caption may be wider or taller than its box
    const bad = await p.evaluate(() => {
      const out = [];
      for (const box of document.querySelectorAll('.board,.cap,.chap')) {
        const B = box.getBoundingClientRect();
        for (const e of box.querySelectorAll('*')) {
          if (getComputedStyle(e).visibility === 'hidden' || !e.textContent.trim()) continue;
          const r = document.createRange(); r.selectNodeContents(e); const q = r.getBoundingClientRect();
          if (q.width && (q.left < B.left - 1 || q.right > B.right + 1 || q.top < B.top - 1 || q.bottom > B.bottom + 1 || q.right > innerWidth)) out.push(e.textContent.slice(0, 40));
        }
      }
      return out;
    });
    if (bad.length) throw new Error(`line ${k}: text leaves its box: ` + bad.join(' | '));
    process.stdout.write(`frames ${n}\r`);
  }
  await b.close();
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  console.log(`\nrendered ${n} frames`);
})().catch(e => { console.error(e); process.exit(1); });
