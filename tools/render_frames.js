// Render animated lesson frames into a silent mp4, using the same renderer as the app (lessons/lesson-render.js).
// node tools/render_frames.js frames.json out.mp4
//   frames.json = {fps, lesson: <script path>, art: <file:// art dir>, jobs:[{si, li, frames, html, info}]}
// Each page's CSS animations are paused and seeked to every frame time, then screenshotted.
// Writes frames-meta.json next to frames.json with the sound-effect moments ({pops, ticks}) of each line.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const LR = require(path.join(__dirname, '..', 'lessons', 'lesson-render.js'));
const cfgPath = path.resolve(process.argv[2]);
const { fps, lesson: lessonPath, art, jobs } = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const lesson = JSON.parse(fs.readFileSync(lessonPath, 'utf8'));
(async () => {
  const meta = jobs.map(j => {
    const f = LR.frame(lesson, j.si, j.li, j.info, { art });
    fs.writeFileSync(j.html, LR.page(f.html));
    return { pops: f.pops, ticks: f.ticks };
  });
  fs.writeFileSync(path.join(path.dirname(cfgPath), 'frames-meta.json'), JSON.stringify(meta));
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', process.argv[3]], { stdio: ['pipe', 'inherit', 'inherit'] });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  let n = 0;
  for (const j of jobs) {
    await p.goto('file://' + j.html, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
    for (let f = 0; f < j.frames; f++) {
      await p.evaluate(t => { for (const a of document.getAnimations()) a.currentTime = t; }, (f / fps) * 1000);
      const buf = await p.screenshot({ type: 'jpeg', quality: 88 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      n++;
    }
    // at the line's last frame: big words must never run off the screen (lesson-render.js shrinks them; this catches anything it misses)
    const cut = await p.evaluate(() => [...document.querySelectorAll('.stage *')].filter(e => {
      const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect();
      return b.width && (b.left < 0 || b.right > innerWidth); }).map(e => e.textContent.slice(0, 40)));
    if (cut.length) throw new Error('text runs off the screen: ' + cut.join(' | '));
    process.stdout.write(`frames ${n}\r`);
  }
  await b.close();
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  console.log(`\nrendered ${n} frames`);
})();
