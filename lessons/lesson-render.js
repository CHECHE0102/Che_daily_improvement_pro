/* BinBin 小教室 — one renderer for both the in-app lesson player and the video generator.
   LessonRender.frame(lesson, slideIndex, lineIndex, info, opts) -> {html, pops, ticks}
   info: {idx, first, lead, speech, bounds, dur, t0, ts, p0, p1, prevV}
     lead   seconds before the voice starts; speech = voice length; bounds = [[offset, dur, token]] (edge-tts)
     t0     time of this line in the whole lesson; ts = time since the slide started; p0/p1 progress 0..1
   opts: {art: "assets/art/" or "file:///.../assets/art/", interactive: bool (app: quiz options are buttons)}
   The page is 1080x1920; the app scales it down. Every animation is CSS, so the video tool can
   pause and seek them frame by frame. */
(function (root) {
  const CSS = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@500;700;900&family=Poppins:wght@600;800&display=block');
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1920px;overflow:hidden;position:relative;color:#fff;
 font-family:'Poppins','Noto Sans TC',sans-serif;background:linear-gradient(170deg,#24806a 0%,#1c6a55 45%,#123f34 100%)}
.deco{position:absolute;opacity:.13;width:120px}
.scene{position:absolute;top:150px;left:-80px;right:-80px;height:1150px;background-size:cover;background-position:center;opacity:.16;filter:blur(2px)}
.brand{position:absolute;top:58px;left:64px;font-family:Poppins;font-weight:800;font-size:46px;letter-spacing:-1px}
.brand b{color:#f0be45;font-weight:600;font-size:30px;margin-left:8px}
.tag{position:absolute;top:66px;right:64px;font-size:28px;color:#1d2a26;font-weight:800;background:#f0be45;border-radius:999px;padding:6px 24px}
.prog{position:absolute;top:150px;left:64px;right:64px;height:10px;border-radius:5px;background:#ffffff25;overflow:hidden}
.prog i{display:block;height:100%;width:100%;background:#f0be45;transform-origin:left}
.stage{position:absolute;top:200px;left:60px;right:60px;height:1040px;display:flex;flex-direction:column;align-items:center;text-align:center}
.kicker{font-size:46px;color:#f0be45;font-weight:900;margin-top:30px}
.big{font-size:96px;font-weight:900;line-height:1.2;margin-top:20px}
.big.hl{font-size:230px;color:#f0be45;font-family:Poppins;text-shadow:0 10px 0 #0003}
.circle{border-radius:50%;background:#dcebe5;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;flex-shrink:0;box-shadow:0 14px 0 #0002}
.circle img{width:92%}
.num{width:110px;height:110px;border-radius:50%;background:#f0be45;color:#1d2a26;font-size:64px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:10px}
.phrase{font-size:190px;font-weight:800;line-height:1.05;margin-top:6px;text-shadow:0 10px 0 #0003}
.pron{font-size:42px;color:#cfe7de;font-weight:700}
.meaning{margin-top:22px;background:#f0be45;color:#1d2a26;border-radius:999px;padding:18px 54px;font-size:54px;font-weight:900}
.points{margin-top:44px;width:100%}
.points div{background:#ffffff1c;border-radius:28px;padding:28px 36px;margin:0 0 24px;font-size:52px;font-weight:700;text-align:left}
.q{margin-top:34px;font-size:64px;font-weight:800;line-height:1.25;background:#fff;color:#1d2a26;border-radius:32px;padding:34px 44px}
.ask{margin-top:30px;font-size:50px;font-weight:900;color:#f0be45}
.opt{width:100%;margin-top:24px;border-radius:28px;padding:26px 40px;font-size:56px;font-weight:800;text-align:left;background:#ffffff1c;border:5px solid transparent}
.opt.ok{background:#f0be45;color:#1d2a26;border-color:#fff}
.card{width:100%;display:flex;align-items:center;gap:36px;background:#ffffff1c;border-radius:30px;padding:28px 44px;margin-top:26px}
.card b{font-size:84px;font-weight:800;color:#f0be45;min-width:330px;text-align:left}
.card span{font-size:52px;font-weight:700}
.cta{margin-top:40px;background:#fff;color:#1c6a55;border-radius:999px;padding:22px 60px;font-size:54px;font-weight:900}
.cd{position:absolute;left:50%;top:820px;width:380px;height:380px;margin-left:-190px;border-radius:50%;background:#f0be45;color:#1d2a26;
 font-family:Poppins;font-size:250px;font-weight:800;display:flex;align-items:center;justify-content:center;opacity:0;box-shadow:0 0 0 24px #f0be4555}
.conf{position:absolute;top:-60px;width:22px;height:34px;border-radius:5px}
.av{position:absolute;top:1190px;width:330px;height:330px}
.av img{width:100%;filter:drop-shadow(0 12px 0 #0003)}
.av.l{left:40px}.av.r{right:40px}
.av.listen{opacity:.55}
.bub{position:absolute;left:44px;right:44px;top:1480px;bottom:90px;border-radius:44px;padding:38px 52px;display:flex;flex-direction:column;justify-content:center;
 background:#0b3329f2;border:5px solid #ffffff2a}
.bub.en{background:#fff;color:#1d2a26;border-color:#f0be45}
.bub:before{content:"";position:absolute;top:-34px;width:0;height:0;border:22px solid transparent;border-bottom:16px solid #0b3329f2}
.bub.en:before{border-bottom-color:#f0be45}
.bub.l:before{left:150px}.bub.r:before{right:150px}
.who{font-size:32px;font-weight:800;color:#f0be45;margin-bottom:10px}
.bub.en .who{color:#1c6a55}
.txt{font-size:56px;line-height:1.42;font-weight:700}
.bub.en .txt{font-size:66px;font-weight:800;line-height:1.28}
.txt span{opacity:.35}
.bub.en .txt span{opacity:.3}
.w{white-space:nowrap}
.zh{font-size:44px;font-weight:700;color:#5a6b66;margin-top:14px}
.wipe{position:absolute;top:0;bottom:0;left:0;width:1080px;background:#f0be45;z-index:9;transform:translateX(-110%)}
@keyframes pop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.14);opacity:1}80%{transform:scale(.96)}100%{transform:scale(1);opacity:1}}
@keyframes up{from{transform:translateY(90px);opacity:0}to{transform:none;opacity:1}}
@keyframes fromL{from{transform:translateX(-130%)}to{transform:none}}
@keyframes fromR{from{transform:translateX(130%)}to{transform:none}}
@keyframes wipe{0%{transform:translateX(-110%)}45%,55%{transform:translateX(0)}100%{transform:translateX(110%)}}
@keyframes kb{from{transform:scale(1)}to{transform:scale(1.18)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-16px)}}
@keyframes talk{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-22px) rotate(-3deg)}}
@keyframes drift{from{transform:translateY(0) rotate(0)}to{transform:translateY(-2200px) rotate(360deg)}}
@keyframes lit{to{opacity:1}}
@keyframes litY{to{opacity:1;color:#c98a00}}
@keyframes shake{0%,100%{transform:rotate(0)}20%{transform:rotate(-6deg)}40%{transform:rotate(5deg)}60%{transform:rotate(-3deg)}80%{transform:rotate(2deg)}}
@keyframes cd{0%{transform:scale(2.2);opacity:0}15%{transform:scale(1);opacity:1}80%{opacity:1}100%{transform:scale(.7);opacity:0}}
@keyframes fall{from{transform:translateY(0) rotate(0)}to{transform:translateY(2100px) rotate(900deg)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes grow{from{transform:scaleX(var(--a))}to{transform:scaleX(var(--b))}}
@keyframes fade{from{opacity:0}to{opacity:1}}
.opt.tap{display:block;color:#fff;font-family:inherit;cursor:pointer}
.opt.bad{background:#e8846b;color:#fff;border-color:#fff}
`;
  const LEAD_IN = 0.45;
  // one teacher per 10 lessons (CheChe): pick with the script's "teacher" field; art in assets/art/lesson/<prefix>-<pose>.webp
  const pose = (name, icon, pre) => ({ name, icon, talk: `lesson/${pre}-talk`, happy: `lesson/${pre}-yay`, hi: `lesson/${pre}-hi`, bye: `lesson/${pre}-bye`,
    think: `lesson/${pre}-think`, wow: `lesson/${pre}-wow`, point: `lesson/${pre}-point` });
  const TEACHERS = { cian: pose("Cian 老師", "👨‍🏫", "teacher"), aoife: pose("Aoife 老師", "👩‍🏫", "aoife"), declan: pose("Declan 老師", "🧔", "declan") };
  const CAST = {
    T: TEACHERS.cian,
    A: { name: "Emily", icon: "🗣", talk: "hero-f-idle" },
    B: { name: "Connor", icon: "🗣", talk: "hero-m-idle" }
  };
  // font size so the longest single word still fits the 960px stage (CheChe: big words must never be cut off)
  // em widths are rough upper bounds for Poppins bold; CJK characters are about 1em
  const fit = (text, base, maxW = 860) => {
    const w = t => [...t].reduce((a, ch) => a + (/[\u2e80-\uffff]/.test(ch) ? 1 : /[mwMW@]/.test(ch) ? 0.95 : /[A-Z0-9]/.test(ch) ? 0.75 : /[il.,'’!|]/.test(ch) ? 0.32 : 0.62), 0);
    const longest = Math.max(1, ...String(text).split(/\s+/).map(w));
    return Math.min(base, Math.floor(maxW / longest));
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const an = (name, dur, delay, ease = "cubic-bezier(.2,.9,.3,1.2)", fill = "both", count = "1") =>
    `animation:${name} ${dur}s ${ease} ${(+delay).toFixed(3)}s ${count} normal ${fill};`;
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function charTimes(say, bounds, lead) {
    if (!bounds || !bounds.length) return null;
    const t = new Array(say.length).fill(null); let pos = 0;
    for (const [off, d, tok] of bounds) {
      const i = say.indexOf(tok, pos); if (i < 0) continue;
      for (let k = 0; k < tok.length; k++) t[i + k] = lead + off + d * k / Math.max(tok.length, 1);
      pos = i + tok.length;
    }
    let nxt = null;
    for (let k = t.length - 1; k >= 0; k--) { if (t[k] == null) t[k] = nxt != null ? nxt : lead; nxt = t[k]; }
    return t;
  }
  function captionSpans(text, times, en) {
    const key = en ? "litY" : "lit"; const out = []; let word = [];
    const sp = (i, ch) => `<span style="${an(key, 0.12, times[i], "linear")}">${esc(ch)}</span>`;
    const flush = () => { if (word.length) { out.push(`<span class="w" style="opacity:1">${word.join("")}</span>`); word = []; } };
    [...text].forEach((ch, i) => {
      if (en && ch !== " ") { word.push(sp(i, ch)); return; }
      flush(); out.push(ch === " " ? " " : sp(i, ch));
    });
    flush(); return out.join("");
  }

  function stage(s, ln, first, ts, img, opts, pops) {
    const D = d => first ? LEAD_IN * 0.6 + d : -30;
    const E = (name, d, dur = 0.6) => { if (first) pops.push(D(d)); return an(name, dur, D(d)); };
    const kb = an("kb", 14, -ts, "linear");
    const circle = (w, d, extra = "") => `<div class="circle" style="width:${w}px;height:${w}px;${extra}${E("up", d)}"><img src="${img(s.img)}" style="${kb}"></div>`;
    switch (s.type) {
      case "hook": {
        const [a, b, c] = s.big;
        return `<div class="big" style="margin-top:120px;${E("up", 0.1)}">${esc(a)}</div>`
          + `<div style="${E("pop", 0.7, 0.7)}"><div class="big hl" style="font-size:${fit(b, 230)}px;${an("shake", 0.8, D(1.3), "ease")}">${esc(b)}</div></div>`
          + `<div class="big" style="font-size:84px;${E("up", 1.6)}">${esc(c)}</div>`
          + `<div style="font-size:150px;margin-top:40px;${E("pop", 2.2)}">${esc(s.emoji || "🤔")}</div>`;
      }
      case "phrase":
        return `<div class="num" style="${E("pop", 0.1)}">${esc(s.num)}</div>`
          + `<div class="phrase" style="font-size:${fit(s.phrase, [...s.phrase].length > 14 ? 130 : 190)}px;${E("pop", 0.4, 0.7)}">${esc(s.phrase)}</div>`
          + (s.pron ? `<div class="pron" style="${E("up", 0.9)}">${esc(s.pron)}</div>` : "")
          + `<div class="meaning" style="${E("up", 1.1)}">${esc(s.meaning)}</div>` + circle(470, 1.5, "margin-top:46px;");
      case "grammar":
        return `<div class="kicker" style="${E("up", 0.1)}">${esc(s.kicker)}</div>`
          + `<div class="big" style="font-size:${fit(s.head, 100)}px;font-family:Poppins;${E("pop", 0.4, 0.7)}">${esc(s.head)}</div>`
          + `<div class="points">${s.points.map((p, i) => `<div style="${E("fromL", 0.9 + i * 0.5)}">✦ ${esc(p)}</div>`).join("")}</div>` + circle(380, 2.0);
      case "quiz": {
        const rev = ln.reveal, pick = opts.picked, ask = opts.interactive && ln.countdown;
        const os = s.opts.map((o, i) => {
          const ok = rev && i === s.ans, wrong = rev && pick === i && i !== s.ans;
          let st = E("fromL", 1.0 + i * 0.25, 0.55); if (rev && !ok && !wrong) st += "opacity:.35;";
          const inner = `<div style="${ok ? an("pulse", 0.6, 0, "ease", "infinite") : ""}">${"ABC"[i]}. ${esc(o)}${ok ? " ✓" : wrong ? " ✗" : ""}</div>`;
          return ask ? `<button class="opt tap" data-i="${i}" style="${st}">${inner}</button>`
            : `<div class="opt${ok ? " ok" : ""}${wrong ? " bad" : ""}" style="${st}">${inner}</div>`;
        }).join("");
        return `<div class="kicker" style="${E("pop", 0.1)}">🎯 小測驗</div><div class="q" style="${E("pop", 0.4, 0.7)}">“${esc(s.q)}”</div>`
          + `<div class="ask" style="${E("up", 0.8)}">${esc(s.ask)}</div>${os}`;
      }
      case "recap": {
        const cards = s.items.map(([a, b], i) => `<div class="card" style="${E("fromR", 0.3 + i * 0.45)}"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join("");
        const cta = ln.end ? `<div class="cta" style="${an("pop", 0.7, 0.5)}"><div style="${an("pulse", 0.9, 1.2, "ease", "infinite")}">${esc(opts.cta || "📲 打開 BinBin 一起練習")}</div></div>` : "";
        return `<div class="kicker" style="${E("up", 0.1)}">✅ 今天學會了</div>${cards}` + (cta || circle(340, 1.8, "margin-top:40px;"));
      }
    }
    throw new Error("unknown slide type " + s.type);
  }

  function frame(lesson, si, li, info, opts = {}) {
    const s = lesson.slides[si], ln = s.lines[li], v = ln.v, en = v !== "T";
    const cast = Object.assign({}, CAST, { T: TEACHERS[lesson.teacher] || TEACHERS.cian }, lesson.cast || {});
    const art = opts.art || "assets/art/";
    const img = n => art + n + ".webp";
    const { lead, speech: sp, t0: tglob, ts, p0, p1, first } = info;
    const pops = [], ticks = [];
    const body = stage(s, ln, first, ts, img, opts, pops);
    const r = rng(7);
    let deco = "";
    for (let k = 0; k < 9; k++) {
      const left = Math.floor(r() * 1040) - 40, top = 1900 + Math.floor(r() * 2100), w = 70 + Math.floor(r() * 80), d = 40 + Math.floor(r() * 30);
      deco += `<img class="deco" src="${img("icon-shamrock")}" style="left:${left}px;top:${top}px;width:${w}px;${an("drift", d, -tglob - r() * 60, "linear", "both", "infinite")}">`;
    }
    const scene = s.scene ? `<div class="scene" style="background-image:url(${img(s.scene)});${an("kb", 20, -ts, "linear")}"></div>` : "";
    const wipe = first && info.idx > 0 ? `<div class="wipe" style="${an("wipe", 0.7, 0, "ease-in-out")}"></div>` : "";
    const prog = `<div class="prog"><i style="--a:${p0.toFixed(4)};--b:${p1.toFixed(4)};${an("grow", info.dur, 0, "linear")}"></i></div>`;

    const talkN = sp > 0 ? Math.max(1, Math.round(sp / 0.36)) : 0;
    const talk = talkN ? an("talk", 0.36, lead, "ease-in-out", "both", String(talkN)) : "";
    const idle = an("float", 2.4, -tglob, "ease-in-out", "both", "infinite");
    const avIn = first ? an("up", 0.5, 0.05) : "";
    let avs, side;
    if (en) {
      side = v === "A" ? "l" : "r"; const other = v === "A" ? "B" : "A", oside = side === "l" ? "r" : "l";
      avs = `<div class="av ${side}" style="${avIn}"><div style="${talk}"><img src="${img(cast[v].talk)}"></div></div>`
        + `<div class="av ${oside} listen" style="transform:scale(.85);"><div style="${idle}"><img src="${img(cast[other].talk)}"></div></div>`;
    } else {
      side = "l"; const c = cast.T;
      // pick a pose: hello at the start, wow on the hook, pointing when a phrase appears, thinking during the quiz, yay/bye at the end
      const face = (ln.end && c.bye) || (ln.reveal && c.happy) || (ln.countdown && c.think) || (info.idx === 0 && first && c.hi)
        || (s.type === "hook" && c.wow) || (first && ["phrase", "grammar"].includes(s.type) && c.point) || c.talk;
      avs = `<div class="av l" style="${avIn}"><div style="${talkN ? talk : idle}"><img src="${img(face)}"></div></div>`;
    }
    const cap = ln.cap || ln.say;
    let txt;
    if (ln.countdown) txt = esc(opts.interactive ? (opts.askCap || "點一個答案！") : cap);
    else {
      let times = cap === ln.say ? charTimes(cap, info.bounds, lead) : null;
      if (!times) { const n = Math.max([...cap].length, 1), span = Math.max(sp, 0.8) * 0.92; times = [...cap].map((_, i) => lead + span * i / n); }
      txt = captionSpans(cap, times, en);
    }
    const zh = en && ln.zh ? `<div class="zh" style="${an("fade", 0.4, lead + sp * 0.7, "ease")}">${esc(ln.zh)}</div>` : "";
    const bub = `<div class="bub ${side}${en ? " en" : ""}" style="${first || en || info.prevV !== v ? an("pop", 0.45, 0.02) : ""}">`
      + `<div class="who">${cast[v].icon || ""} ${esc(cast[v].name)}</div><div class="txt">${txt}</div>${zh}</div>`;
    let extra = "";
    if (ln.countdown && !opts.interactive) {
      const n = Math.round(ln.pause || 3);
      for (let i = 0; i < n; i++) { extra += `<div class="cd" style="${an("cd", 1.0, i, "ease-out", "none")}">${n - i}</div>`; ticks.push(i); }
    }
    if (ln.reveal ? (opts.picked == null || opts.picked === s.ans) : ln.end) {
      const colors = ["#f0be45", "#ffffff", "#ff7a7a", "#7ad7ff", "#b7ff7a"];
      for (let k = 0; k < 60; k++) extra += `<div class="conf" style="left:${Math.floor(r() * 1060)}px;background:${colors[Math.floor(r() * 5)]};${an("fall", 2.2 + r() * 1.4, r() * 0.6, "linear", "backwards")}"></div>`;
    }
    const html = `${deco}${scene}<div class="brand">BinBin<b>daily</b></div><div class="tag">${esc(lesson.id)} · ${esc(lesson.level)}</div>`
      + `${prog}<div class="stage">${body}</div>${avs}${bub}${extra}${wipe}`;
    return { html, pops, ticks };
  }
  const page = body => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
  const api = { CSS, LEAD_IN, frame, page, charTimes };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LessonRender = api;
})(typeof window !== "undefined" ? window : globalThis);
