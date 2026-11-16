/* BinBin 小教室 長課 (5–10 minute lessons, 1920x1080 for YouTube).
   page(lesson, si, li, info, opts) -> html of one spoken line.
   info: {first, lead, speech, bounds, dur, echo, ts, p0, p1, prevPose, chapterStart}
     lead = seconds before the voice starts; speech = voice length; echo = seconds left for the viewer to repeat
     ts = seconds since the scene started; p0/p1 = progress through the whole lesson (0..1)
   opts: {art: "file:///.../assets/art/lesson/niamh/", has: name => bool}
   Every animation is CSS so tools/render_long_frames.js can pause and seek it frame by frame.
   Text that could be too long carries class "fit": the page shrinks it until it fits (big words are never cut off). */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@500;700;900&family=Poppins:wght@600;800&display=block');
*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;height:1080px;overflow:hidden;position:relative;color:#fff;font-family:'Poppins','Noto Sans TC','Noto Sans CJK TC',sans-serif;
 background:linear-gradient(160deg,#2a8a72 0%,#1c6a55 50%,#123f34 100%)}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,#0b332900 0%,#0b332955 45%,#0b3329aa 100%)}
.shade.skit{background:linear-gradient(180deg,#0b332933 0%,#0b332900 40%,#0b3329aa 100%)}
.top{position:absolute;top:0;left:0;right:0;height:130px;background:linear-gradient(180deg,#0b3329e6 0%,#0b332999 55%,#0b332900 100%);z-index:4}
.brand{position:absolute;top:26px;left:44px;font-weight:800;font-size:34px;letter-spacing:-.5px;text-shadow:0 3px 0 #0004;z-index:5}
.brand b{color:#f0be45;font-weight:700;font-size:24px;margin-left:10px}
.chips{position:absolute;top:28px;right:44px;display:flex;gap:10px;z-index:5}
.chip{font-size:22px;font-weight:700;padding:6px 18px;border-radius:999px;background:#0b3329b0;color:#ffffffa0;white-space:nowrap}
.chip.on{background:#f0be45;color:#1d2a26}
.chip.done{color:#fff}
.prog{position:absolute;top:0;left:0;right:0;height:8px;background:#ffffff25;z-index:6}
.prog i{display:block;height:100%;width:100%;background:#f0be45;transform-origin:left}
.teacher{position:absolute;left:30px;bottom:-6px;width:680px;height:985px;z-index:2;transform-origin:50% 100%}
.teacher img,.actor img{width:100%;height:100%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 10px 18px #0006)}
.ph{width:100%;height:100%;border-radius:340px 340px 40px 40px;background:#ffffff22;border:6px dashed #ffffff66;display:flex;align-items:center;justify-content:center;
 font-size:44px;font-weight:800;color:#ffffffcc;text-align:center}
.board{position:absolute;left:740px;top:100px;width:1120px;height:670px;border-radius:40px;background:#0f3a2ff2;border:10px solid #c8a27a;
 box-shadow:0 18px 0 #0003,inset 0 0 0 4px #0003;padding:36px 56px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;z-index:3;overflow:hidden}
.kicker{font-size:40px;color:#f0be45;font-weight:900;margin-bottom:14px;white-space:nowrap}
.big{font-size:104px;font-weight:900;line-height:1.18;white-space:nowrap}
.big.hl{color:#f0be45;font-size:150px;text-shadow:0 8px 0 #0004}
.emoji{font-size:120px;line-height:1;margin-bottom:8px}
.num{min-width:96px;height:96px;padding:0 26px;border-radius:999px;background:#f0be45;color:#1d2a26;font-size:46px;font-weight:900;display:flex;align-items:center;justify-content:center;margin-bottom:22px;white-space:nowrap}
.phrase{font-size:124px;font-weight:800;line-height:1.12;text-shadow:0 8px 0 #0004;white-space:nowrap;max-width:100%}
.meaning{margin-top:30px;background:#f0be45;color:#1d2a26;border-radius:999px;padding:14px 48px;font-size:50px;font-weight:900;white-space:nowrap}
.note{margin-top:24px;font-size:38px;font-weight:700;color:#cfe7de;white-space:nowrap}
.items{width:100%;display:flex;flex-direction:column;gap:20px}
.item{background:#ffffff1c;border-radius:26px;padding:24px 36px;font-size:60px;font-weight:800;text-align:left;white-space:nowrap;display:flex;gap:22px;align-items:center}
.item.bad{background:#b3402e;text-decoration:line-through;text-decoration-thickness:5px}
.item.good{background:#f0be45;color:#1d2a26}
.grid{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px 20px}
.cell{background:#ffffff1c;border-radius:20px;padding:10px 20px;font-size:29px;line-height:1.14;font-weight:800;text-align:left;display:flex;gap:14px;align-items:center;min-height:72px}
.cell b{color:#1d2a26;background:#f0be45;border-radius:999px;min-width:46px;height:46px;font-size:26px;display:flex;align-items:center;justify-content:center;flex:none}
.cta{margin-top:30px;background:#fff;color:#1c6a55;border-radius:999px;padding:18px 54px;font-size:46px;font-weight:900;white-space:nowrap}
.cap{position:absolute;left:740px;top:800px;width:1120px;height:240px;border-radius:36px;padding:26px 44px;display:flex;flex-direction:column;justify-content:center;
 background:#0b3329f2;border:5px solid #ffffff2a;z-index:4;overflow:hidden}
.cap.en{background:#fff;color:#1d2a26;border-color:#f0be45}
.cap.wide{left:330px;width:1260px;top:810px;height:230px}
.cap .who{font-size:26px;font-weight:800;color:#f0be45;margin-bottom:6px}
.cap.en .who{color:#1c6a55}
.txt{font-size:50px;line-height:1.36;font-weight:700}
.cap.en .txt{font-size:62px;font-weight:800;line-height:1.2}
.txt span{opacity:.38}
.w{white-space:nowrap;display:inline-block}
.zh{font-size:36px;font-weight:700;color:#5a6b66;margin-top:8px}
.cap.t{top:786px;height:262px;padding:18px 40px}
.cap.t.wide{top:800px;height:250px}
.cap.t .txt{font-size:48px;line-height:1.24}
.cap.t .zh{color:#1c6a55;font-size:35px;line-height:1.3}
.echo{position:absolute;left:740px;top:800px;width:1120px;height:240px;border-radius:36px;background:#f0be45;color:#1d2a26;z-index:5;display:flex;flex-direction:column;
 align-items:center;justify-content:center;font-size:66px;font-weight:900;opacity:0}
.echo i{display:block;width:80%;height:16px;border-radius:8px;background:#1d2a2633;margin-top:22px;overflow:hidden}
.echo i u{display:block;height:100%;background:#1d2a26;transform-origin:left}
.actor{position:absolute;bottom:-6px;width:640px;height:960px;z-index:2;transform-origin:50% 100%}
.actor.l{left:60px}.actor.r{right:60px}
.actor.r img{transform:scaleX(-1)}
.actor.listen{filter:brightness(.72)}
.tail{position:absolute;top:786px;width:0;height:0;border:26px solid transparent;border-bottom-color:#f0be45;border-top:0;z-index:4}
.tail.dark{border-bottom-color:#2a5a4d}
.chap{position:absolute;inset:60px 0 290px 0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:3;padding-left:560px}
.chap .n{width:200px;height:200px;border-radius:50%;background:#f0be45;color:#1d2a26;font-size:120px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 22px #f0be4544}
.chap .t{font-size:136px;font-weight:900;margin-top:40px;white-space:nowrap;text-shadow:0 8px 0 #0004}
.chap .s{font-size:50px;font-weight:700;color:#fff;text-shadow:0 3px 8px #000a;margin-top:14px;white-space:nowrap}
.wipe{position:absolute;inset:0;background:#f0be45;z-index:9;transform:translateX(-110%)}
.stick{position:absolute;font-size:110px;z-index:6;filter:drop-shadow(0 6px 0 #0003)}
.conf{position:absolute;top:-60px;width:20px;height:32px;border-radius:5px;z-index:8}
@keyframes pop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.12);opacity:1}80%{transform:scale(.97)}100%{transform:scale(1);opacity:1}}
@keyframes up{from{transform:translateY(70px);opacity:0}to{transform:none;opacity:1}}
@keyframes inL{from{transform:translateX(-120%)}to{transform:none}}
@keyframes inR{from{transform:translateX(120%)}to{transform:none}}
@keyframes swap{0%{transform:scale(.9) rotate(-2deg);opacity:.3}60%{transform:scale(1.03) rotate(.6deg);opacity:1}100%{transform:none;opacity:1}}
@keyframes bob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-10px) rotate(.5deg)}}
@keyframes wipe{0%{transform:translateX(-110%)}45%,55%{transform:translateX(0)}100%{transform:translateX(110%)}}
@keyframes kb{from{transform:scale(1)}to{transform:scale(1.12)}}
@keyframes grow{from{transform:scaleX(var(--a))}to{transform:scaleX(var(--b))}}
@keyframes lit{to{opacity:1}}
@keyframes show{0%{opacity:0;transform:scale(.8)}12%,100%{opacity:1;transform:none}}
@keyframes drain{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@keyframes wob{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg) scale(1.08)}}
@keyframes fall{to{transform:translateY(1250px) rotate(720deg)}}`;

// shrink .fit elements until they fit their box (width, and height for the caption)
const FIT = `window.__fit=function(){
 document.querySelectorAll('.fit').forEach(function(e){var box=e.closest('.board,.chap,.cap')||e.parentElement;
  var max=(e.classList.contains('cell')||e.classList.contains('item')?e.clientWidth:box.clientWidth-parseFloat(getComputedStyle(box).paddingLeft)*2);
  var fs=parseFloat(getComputedStyle(e).fontSize),n=0;
  while(e.scrollWidth>max&&fs>16&&n++<80){fs*=.95;e.style.fontSize=fs+'px';}});
 document.querySelectorAll('.board').forEach(function(b){var e=b.querySelector('.phrase,.big.hl,.grid');if(!e)return;
  var fs=parseFloat(getComputedStyle(e).fontSize),n=0;
  var need=function(){var h=0;[].forEach.call(b.children,function(c){var m=getComputedStyle(c);h+=c.offsetHeight+parseFloat(m.marginTop)+parseFloat(m.marginBottom);});return h>b.clientHeight-72;};
  while(need()&&fs>20&&n++<60){fs*=.95;e.style.fontSize=fs+'px';e.querySelectorAll('.cell').forEach(function(c){c.style.fontSize=fs+'px';c.style.minHeight='0';});}});
 document.querySelectorAll('.cap').forEach(function(c){var t=c.querySelector('.txt'),z=c.querySelector('.zh');if(!t)return;
  var fs=parseFloat(getComputedStyle(t).fontSize),n=0;
  while(c.scrollHeight>c.clientHeight+1&&fs>20&&n++<60){fs*=.95;t.style.fontSize=fs+'px';if(z)z.style.fontSize=Math.max(26,fs*.72)+'px';}});
};`;

function twoLines(t) {
  if (t.length < 24) return esc(t);
  const sp = [...t.matchAll(/ /g)].map(m => m.index);
  const cut = sp.reduce((a, b) => Math.abs(b - t.length / 2) < Math.abs(a - t.length / 2) ? b : a);
  return esc(t.slice(0, cut)) + '<br>' + esc(t.slice(cut + 1));
}

const anim = (name, dur, delay, extra) => `animation:${name} ${dur}s ${extra || 'cubic-bezier(.2,.8,.2,1)'} ${delay}s both`;

function person(opts, pose, label) {
  const f = 'niamh-' + pose;
  return opts.has(f) ? `<img src="${opts.art}${f}.webp">` : `<div class="ph">${esc(label)}<br>${esc(pose)}</div>`;
}

// caption words light up while the voice speaks (word timings from edge-tts when they match, else spread evenly)
function karaoke(text, info, isEn) {
  const toks = isEn ? text.split(/(\s+)/) : (text.match(/[A-Za-z0-9'’\-]+|\s+|[^\sA-Za-z0-9'’\-]/g) || []);
  const real = toks.filter(t => t.trim());
  const b = info.bounds || [];
  const useB = isEn && b.length === real.length;
  let k = 0, acc = 0;
  const total = real.reduce((n, t) => n + (/[A-Za-z]/.test(t) ? t.length * .5 + 1 : 1), 0) || 1;
  return toks.map(t => {
    if (!t.trim()) return ' ';
    const wgt = /[A-Za-z]/.test(t) ? t.length * .5 + 1 : 1;
    const at = info.lead + (useB ? b[k][0] : info.speech * acc / total);
    k++; acc += wgt;
    return `<span class="w" style="animation:lit .12s linear ${at.toFixed(2)}s both">${esc(t)}</span>`;
  }).join('');
}

function board(sc, li, lines, info) {
  const b = sc.board || {};
  const step = lines.slice(0, li + 1).reduce((m, l) => Math.max(m, l.step || 0), 0);
  const isNew = n => n > 0 && (lines[li].step || 0) === n && !lines.slice(0, li).some(l => (l.step || 0) >= n);
  const vis = (n, i) => n > step ? 'visibility:hidden' : isNew(n) ? anim('pop', .5, info.lead * .5 + (i || 0) * .12) : (info.first && n === 0 ? anim('up', .5, .25 + (i || 0) * .1) : '');
  let h = '';
  if (sc.type === 'phrase') {
    h += `<div class="num" style="${vis(0)}">${esc(sc.label || '第 ' + sc.num + ' 句')}</div>`;
    h += `<div class="phrase fit" style="${vis(sc.phraseStep || 0, 1)}${info.echo ? ';' + anim('pulse', .9, info.lead + info.speech, 'ease-in-out') + ';animation-iteration-count:infinite' : ''}">${twoLines(sc.phrase)}</div>`;
    if (sc.meaning) h += `<div class="meaning fit" style="${vis(1)}">${esc(sc.meaning)}</div>`;
    if (sc.note) h += `<div class="note fit" style="${vis(2)}">${esc(sc.note)}</div>`;
  } else if (sc.type === 'recap') {
    h += `<div class="kicker">${esc(b.kicker || '今天的 12 句')}</div><div class="grid">` +
      b.items.map((t, i) => `<div class="cell" style="${info.first ? anim('pop', .4, .3 + i * .12) : ''}"><b>${i + 1}</b>${esc(t)}</div>`).join('') + '</div>';
  } else {
    if (b.emoji) h += `<div class="emoji" style="${vis(0)}">${b.emoji}</div>`;
    if (b.kicker) h += `<div class="kicker fit" style="${vis(0)}">${esc(b.kicker)}</div>`;
    (b.big || []).forEach((t, i) => {
      const hl = t.startsWith('*');
      h += `<div class="big fit${hl ? ' hl' : ''}" style="${vis(b.bigStep ? b.bigStep[i] : 0, i)}">${esc(hl ? t.slice(1) : t)}</div>`;
    });
    if (b.items) h += '<div class="items">' + b.items.map((t, i) => {
      const cls = t.startsWith('✗') ? ' bad' : t.startsWith('✓') ? ' good' : '';
      return `<div class="item fit${cls}" style="${vis(i + 1)}">${esc(t)}</div>`;
    }).join('') + '</div>';
    if (b.cta) h += `<div class="cta fit" style="${vis(b.ctaStep || 0, 3)}">${esc(b.cta)}</div>`;
  }
  return `<div class="board">${h}</div>`;
}

function caption(ln, info, cls, who) {
  const isEn = ln.v !== 'T';
  const text = ln.cap || ln.say;
  if (ln.cap) info = Object.assign({}, info, { bounds: [] });   // caption differs from the spoken words: spread the highlight evenly
  if (!text) return '';
  return `<div class="cap ${isEn ? 'en ' : ''}${ln.v === 'E' ? 't ' : ''}${cls || ''}">${who ? `<div class="who">${esc(who)}</div>` : ''}<div class="txt">${karaoke(text, info, isEn)}</div>` +
    (ln.zh ? `<div class="zh">${esc(ln.zh)}</div>` : '') + '</div>';
}

function page(lesson, si, li, info, opts) {
  const sc = lesson.scenes[si], lines = sc.lines, ln = lines[li];
  const chapters = lesson.chapters || [];
  let h = '';
  const bgName = sc.type === 'skit' ? 'bg-cafe' : 'bg-studio';
  if (opts.has(bgName)) h += `<div class="bg" style="background-image:url('${opts.art}${bgName}.webp')"></div>`;
  h += `<div class="shade${sc.type === 'skit' ? ' skit' : ''}"></div>`;
  h += '<div class="top"></div>';
  h += `<div class="prog"><i style="--a:${info.p0.toFixed(4)};--b:${info.p1.toFixed(4)};animation:grow ${info.dur}s linear both"></i></div>`;
  h += `<div class="brand">BinBin 小教室<b>${esc(lesson.id)}・${esc(lesson.title)}</b></div>`;
  h += '<div class="chips">' + chapters.map((c, i) => `<div class="chip${i === sc.ch ? ' on' : i < sc.ch ? ' done' : ''}">${esc(c)}</div>`).join('') + '</div>';

  const pose = ln.pose || 'talk';
  const speaking = ln.say && !ln.pause;
  const bob = speaking ? `;animation:bob .62s ease-in-out ${info.lead.toFixed(2)}s ${Math.max(1, Math.round(info.speech / .62))} both` : '';
  if (sc.type === 'skit') {
    // one teacher plays both parts: L = staff (left), R = customer (right, mirrored)
    const L = ln.L || lines.slice(0, li).reverse().map(l => l.L).find(Boolean) || sc.L;
    const R = ln.R || lines.slice(0, li).reverse().map(l => l.R).find(Boolean) || sc.R;
    const side = ln.v === 'A' ? 'l' : ln.v === 'B' ? 'r' : '';
    const ent = info.first;
    h += `<div class="actor l${side === 'r' ? ' listen' : ''}" style="${ent ? anim('inL', .6, .1) : ln.L ? anim('swap', .35, 0) : ''}"><div style="width:100%;height:100%${side === 'l' ? bob : ''}">${person(opts, L, '店員')}</div></div>`;
    h += `<div class="actor r${side === 'l' ? ' listen' : ''}" style="${ent ? anim('inR', .6, .25) : ln.R ? anim('swap', .35, 0) : ''}"><div style="width:100%;height:100%${side === 'r' ? bob : ''}">${person(opts, R, '客人')}</div></div>`;
    if (side) h += `<div class="tail" style="${side === 'l' ? 'left:600px' : 'right:600px'};top:786px"></div>`;
    h += caption(ln, info, 'wide', ln.v === 'A' ? 'Staff 店員' : ln.v === 'B' ? 'Customer 客人' : 'Niamh');
  } else if (sc.type === 'chapter') {
    h += `<div class="teacher" style="${anim('inL', .6, .35)}"><div style="width:100%;height:100%${bob}">${person(opts, pose, 'Niamh')}</div></div>`;
    h += `<div class="chap"><div class="n" style="${info.first ? anim('pop', .6, .45) : ''}">${esc(sc.num)}</div><div class="t fit" style="${info.first ? anim('up', .5, .7) : ''}">${esc(sc.title)}</div>` +
      (sc.sub ? `<div class="s fit" style="${info.first ? anim('up', .5, .9) : ''}">${esc(sc.sub)}</div>` : '') + '</div>';
    h += caption(ln, info);
  } else {
    const changed = info.prevPose !== pose;
    h += `<div class="teacher" style="${info.first && info.sceneEnter ? anim('inL', .6, .2) : changed ? anim('swap', .35, 0) : ''}"><div style="width:100%;height:100%${bob}">${person(opts, pose, 'Niamh')}</div></div>`;
    h += board(sc, li, lines, info);
    h += caption(ln, info, '', ln.v === 'A' ? '🔊 Listen' : '');
    if (info.echo) {
      const at = info.lead + info.speech + .15;
      h += `<div class="echo" style="animation:show ${(info.echo).toFixed(2)}s ease-out ${at.toFixed(2)}s both">🎤 Your turn!<i><u style="animation:drain ${(info.echo - .3).toFixed(2)}s linear ${(at + .2).toFixed(2)}s both"></u></i></div>`;
    }
  }
  if (ln.sticker) h += `<div class="stick" style="left:${ln.stickerX || 620}px;top:${ln.stickerY || 150}px;${anim('pop', .5, info.lead)}"><div style="animation:wob 1s ease-in-out ${(info.lead + .5).toFixed(2)}s infinite">${ln.sticker}</div></div>`;
  if (ln.end) {
    const cols = ['#f0be45', '#fff', '#ff8a65', '#7fd6b6'];
    for (let i = 0; i < 46; i++) h += `<div class="conf" style="left:${(i * 41.7) % 1900}px;background:${cols[i % 4]};animation:fall ${2 + (i % 5) * .35}s linear ${(.4 + (i % 9) * .16).toFixed(2)}s both"></div>`;
  }
  if (info.wipe) h += `<div class="wipe" style="animation:wipe .7s ease-in-out 0s both"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${h}<script>${FIT}</script></body></html>`;
}

module.exports = { page };
