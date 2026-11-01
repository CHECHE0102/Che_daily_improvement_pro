"""Turn a lesson script (lessons/scripts/*.json) into an animated vertical mp4 (1080x1920, 25 fps).

Pipeline: edge-tts voices each line (with word timings for karaoke captions) ->
one HTML page per line with CSS animations -> tools/render_frames.js seeks the
animations frame by frame and pipes screenshots into ffmpeg -> numpy mixes the
voices with synthesised sound effects and a soft background loop -> mux.

usage: python tools/make_lesson_video.py lessons/scripts/L001-irish-phrases.json [--fake-tts] [--only N]
  --fake-tts  silence instead of real voices (layout check without network)
  --only N    render only slide N (0-based), for quick previews
Output: lessons/out/<id>.mp4 (not committed).
"""
import asyncio, html, json, math, os, random, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "assets", "art")
SR, FPS = 24000, 25
GAP, LEAD = 0.30, 0.45            # silence after each line; lead-in before a new slide's first line
RATE = {"T": "+10%", "A": "-4%", "B": "-4%"}
WHO = {"T": "BinBin 長老", "A": "Emily", "B": "Connor"}
AVATAR = {"T": "elder-talk", "A": "hero-f-idle", "B": "hero-m-idle"}


def esc(s):
    return html.escape(s or "")


def img(name):
    return "file://" + os.path.join(ART, name + ".webp")


def an(name, dur, delay, ease="cubic-bezier(.2,.9,.3,1.2)", fill="both", count="1"):
    return f"animation:{name} {dur}s {ease} {delay:.3f}s {count} normal {fill};"


CSS = r"""
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@500;700;900&family=Poppins:wght@600;800&display=block');
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
"""


def stage(s, ln, first, ts):
    """Slide body. ts = seconds since this slide started at the beginning of this line.
    Entrance animations play only on a slide's first line; later lines get a far-past delay (final state)."""
    D = (lambda d: LEAD * 0.6 + d) if first else (lambda d: -30)
    t = s["type"]
    pops = []           # (time from line start, sfx) for entrance moments

    def E(name, d, dur=0.6, **k):
        if first:
            pops.append(D(d))
        return an(name, dur, D(d), **k)

    kb = an("kb", 14, -ts, ease="linear")
    if t == "hook":
        a, b, c = s["big"]
        body = (f'<div class="big" style="margin-top:120px;{E("up", 0.1)}">{esc(a)}</div>'
                f'<div style="{E("pop", 0.7, 0.7)}"><div class="big hl" style="{an("shake", 0.8, D(1.3) if first else -30, ease="ease")}">{esc(b)}</div></div>'
                f'<div class="big" style="font-size:84px;{E("up", 1.6)}">{esc(c)}</div>'
                f'<div style="font-size:150px;margin-top:40px;{E("pop", 2.2)}">🤔</div>')
    elif t == "phrase":
        pron = f'<div class="pron" style="{E("up", 0.9)}">{esc(s["pron"])}</div>' if s.get("pron") else ""
        body = (f'<div class="num" style="{E("pop", 0.1)}">{esc(s["num"])}</div>'
                f'<div class="phrase" style="{E("pop", 0.4, 0.7)}">{esc(s["phrase"])}</div>{pron}'
                f'<div class="meaning" style="{E("up", 1.1)}">{esc(s["meaning"])}</div>'
                f'<div class="circle" style="width:470px;height:470px;margin-top:46px;{E("up", 1.5)}"><img src="{img(s["img"])}" style="{kb}"></div>')
    elif t == "grammar":
        pts = "".join(f'<div style="{E("fromL", 0.9 + i * 0.5, 0.6)}">✦ {esc(p)}</div>' for i, p in enumerate(s["points"]))
        body = (f'<div class="kicker" style="{E("up", 0.1)}">{esc(s["kicker"])}</div>'
                f'<div class="big" style="font-size:100px;font-family:Poppins;{E("pop", 0.4, 0.7)}">{esc(s["head"])}</div>'
                f'<div class="points">{pts}</div>'
                f'<div class="circle" style="width:380px;height:380px;{E("up", 2.0)}"><img src="{img(s["img"])}" style="{kb}"></div>')
    elif t == "quiz":
        rev = ln.get("reveal")
        opts = ""
        for i, o in enumerate(s["opts"]):
            ok = rev and i == s["ans"]
            st = E("fromL", 1.0 + i * 0.25, 0.55)
            if rev and not ok:
                st += "opacity:.35;"
            inner = f'<div style="{an("pulse", 0.6, 0, ease="ease", count="infinite") if ok else ""}">{"ABC"[i]}. {esc(o)}{" ✓" if ok else ""}</div>'
            opts += f'<div class="opt{" ok" if ok else ""}" style="{st}">{inner}</div>'
        body = (f'<div class="kicker" style="{E("pop", 0.1)}">🎯 小測驗</div><div class="q" style="{E("pop", 0.4, 0.7)}">“{esc(s["q"])}”</div>'
                f'<div class="ask" style="{E("up", 0.8)}">{esc(s["ask"])}</div>{opts}')
    elif t == "recap":
        cards = "".join(f'<div class="card" style="{E("fromR", 0.3 + i * 0.45, 0.6)}"><b>{esc(a)}</b><span>{esc(b)}</span></div>'
                        for i, (a, b) in enumerate(s["items"]))
        cta = (f'<div class="cta" style="{an("pop", 0.7, 0.5)}"><div style="{an("pulse", 0.9, 1.2, ease="ease", count="infinite")}">📲 打開 BinBin 一起練習</div></div>'
               if ln.get("end") else "")
        body = (f'<div class="kicker" style="{E("up", 0.1)}">✅ 今天學會了</div>{cards}'
                (cta or f'<div class="circle" style="width:340px;height:340px;margin-top:40px;{E("up", 1.8)}"><img src="{img(s["img"])}" style="{kb}"></div>'))
    else:
        raise ValueError("unknown slide type " + t)
    return body, pops


def caption_spans(text, times, fallback_speech, en):
    """Wrap each char in a span that lights up at its spoken time (karaoke)."""
    n = len(text)
    if not times:
        times = [fallback_speech * i / max(n, 1) for i in range(n)]
    key = "litY" if en else "lit"
    out, word = [], []

    def sp(i, ch):
        return f'<span style="{an(key, 0.12, times[i], ease="linear")}">{esc(ch)}</span>'
    for i, ch in enumerate(text):
        if en and ch != " ":
            word.append(sp(i, ch))
            continue
        if word:
            out.append('<span class="w" style="opacity:1">' + "".join(word) + "</span>")
            word = []
        out.append(sp(i, ch) if ch != " " else " ")
    if word:
        out.append('<span class="w" style="opacity:1">' + "".join(word) + "</span>")
    return "".join(out)


def char_times(say, bounds, lead):
    """Map edge-tts word boundaries onto character start times."""
    if not bounds:
        return None
    times = [None] * len(say)
    pos = 0
    for off, d, tok in bounds:
        i = say.find(tok, pos)
        if i < 0:
            continue
        for k in range(len(tok)):
            times[i + k] = lead + off + d * k / max(len(tok), 1)
        pos = i + len(tok)
    nxt = None
    for k in range(len(times) - 1, -1, -1):        # punctuation takes the next token's time
        if times[k] is None:
            times[k] = nxt if nxt is not None else (times[k - 1] if k and times[k - 1] is not None else lead)
        nxt = times[k]
    return times


def frame_html(lesson, s, ln, first, info):
    v = ln["v"]
    en = v != "T"
    lead, sp, tglob, ts, p0, p1 = info["lead"], info["speech"], info["t0"], info["ts"], info["p0"], info["p1"]
    body, pops = stage(s, ln, first, ts)
    info["pops"] = pops
    rnd = random.Random(7)
    deco = "".join(f'<img class="deco" src="{img("icon-shamrock")}" style="left:{rnd.randint(-40, 1000)}px;top:{rnd.randint(1900, 4000)}px;'
                   f'width:{rnd.randint(70, 150)}px;{an("drift", rnd.randint(40, 70), -tglob - rnd.random() * 60, ease="linear", count="infinite")}">'
                   for _ in range(9))
    scene = f'<div class="scene" style="background-image:url({img(s["scene"])});{an("kb", 20, -ts, ease="linear")}"></div>' if s.get("scene") else ""
    wipe = f'<div class="wipe" style="{an("wipe", 0.7, 0, ease="ease-in-out")}"></div>' if first and info["idx"] > 0 else ""
    prog = f'<div class="prog"><i style="--a:{p0:.4f};--b:{p1:.4f};{an("grow", info["dur"], 0, ease="linear")}"></i></div>'

    # speaker(s)
    talk_n = max(1, round(sp / 0.36)) if sp > 0 else 0
    talk = an("talk", 0.36, lead, ease="ease-in-out", count=str(talk_n)) if talk_n else ""
    idle = an("float", 2.4, -tglob, ease="ease-in-out", count="infinite")
    av_in = an("up", 0.5, 0.05) if first else ""
    if en:
        side = "l" if v == "A" else "r"
        other = "B" if v == "A" else "A"
        oside = "r" if side == "l" else "l"
        avs = (f'<div class="av {side}" style="{av_in}"><div style="{talk}"><img src="{img(AVATAR[v])}"></div></div>'
               f'<div class="av {oside} listen" style="transform:scale(.85);"><div style="{idle}"><img src="{img(AVATAR[other])}"></div></div>')
    else:
        side = "l"
        face = "elder-happy" if ln.get("reveal") or ln.get("end") else ("elder-wave" if info["idx"] == 0 and first else AVATAR["T"])
        avs = f'<div class="av l" style="{av_in}"><div style="{talk if talk_n else idle}"><img src="{img(face)}"></div></div>'

    cap = ln.get("cap") or ln["say"]
    times = char_times(cap, info["bounds"], lead) if cap == ln["say"] else None
    txt = caption_spans(cap, times, max(sp, 0.8) * 0.92 + lead if not times else 0, en) if not ln.get("countdown") else esc(cap)
    if not times and not ln.get("countdown"):     # proportional reveal starts at the lead-in
        txt = caption_spans(cap, [lead + max(sp, 0.8) * 0.92 * i / max(len(cap), 1) for i in range(len(cap))], 0, en)
    zh = f'<div class="zh" style="{an("fade", 0.4, lead + sp * 0.7, ease="ease")}">{esc(ln["zh"])}</div>' if en and ln.get("zh") else ""
    bub = (f'<div class="bub {side}{" en" if en else ""}" style="{an("pop", 0.45, 0.02) if (first or en or info["prev_v"] != v) else ""}">'
           f'<div class="who">{"🗣 " if en else "🧙 "}{esc(WHO[v])}</div><div class="txt">{txt}</div>{zh}</div>')

    extra = ""
    if ln.get("countdown"):
        n = int(ln.get("pause", 3))
        extra = "".join(f'<div class="cd" style="{an("cd", 1.0, i, ease="ease-out", fill="none")}">{n - i}</div>' for i in range(n))
        info["ticks"] = list(range(n))
    if ln.get("reveal") or ln.get("end"):
        colors = ["#f0be45", "#ffffff", "#ff7a7a", "#7ad7ff", "#b7ff7a"]
        extra += "".join(f'<div class="conf" style="left:{rnd.randint(0, 1060)}px;background:{rnd.choice(colors)};'
                         f'{an("fall", rnd.uniform(2.2, 3.6), rnd.uniform(0, 0.6), ease="linear", fill="backwards")}"></div>' for _ in range(60))
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>'
            f'{deco}{scene}<div class="brand">BinBin<b>daily</b></div><div class="tag">{esc(lesson["id"])} · {esc(lesson["level"])}</div>'
            f'{prog}<div class="stage">{body}</div>{avs}{bub}{extra}{wipe}</body></html>')


# ---------------------------------------------------------------- audio
def decode(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"])
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


async def tts(text, voice, rate, path):
    import edge_tts
    for attempt in range(4):
        try:
            com = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
            audio, bounds = bytearray(), []
            async for ch in com.stream():
                if ch["type"] == "audio":
                    audio += ch["data"]
                elif ch["type"] == "WordBoundary":
                    bounds.append([ch["offset"] / 1e7, ch["duration"] / 1e7, ch["text"]])
            open(path, "wb").write(audio)
            json.dump(bounds, open(path + ".json", "w"), ensure_ascii=False)
            return
        except Exception as e:  # network hiccups
            print("  retry", attempt, voice, e)
            await asyncio.sleep(3 * (attempt + 1))
    raise RuntimeError("tts failed: " + text)


def env(n, a=0.005, decay=6.0):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t * decay)


def sfx(kind):
    t = lambda d: np.arange(int(d * SR)) / SR
    if kind == "pop":
        x = t(0.12); f = 500 + 1400 * x / 0.12
        return 0.5 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.002, 30)
    if kind == "whoosh":
        x = t(0.55); n = np.random.default_rng(1).standard_normal(len(x))
        n = np.convolve(n, np.ones(18) / 18, "same")
        return 0.9 * n * np.sin(np.pi * x / 0.55) ** 2
    if kind == "tick":
        x = t(0.08)
        return 0.45 * np.sin(2 * np.pi * 1200 * x) * env(len(x), 0.001, 50)
    if kind == "ding":
        x = t(1.0)
        return 0.35 * (np.sin(2 * np.pi * 1318.5 * x) + 0.6 * np.sin(2 * np.pi * 1975.5 * x)) * env(len(x), 0.003, 4)
    if kind == "tada":
        out = np.zeros(int(1.4 * SR))
        for i, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
            x = t(1.0); s = 0.25 * (np.sin(2 * np.pi * f * x) + 0.4 * np.sin(4 * np.pi * f * x)) * env(len(x), 0.004, 4)
            o = int(i * 0.09 * SR); out[o:o + len(s)] += s
        return out
    raise ValueError(kind)


def bgm(total):
    """Soft marimba-like loop, C-G-Am-F at 100 bpm."""
    beat = 60 / 100
    chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
    out = np.zeros(int(total * SR) + SR)
    cache = {}

    def note(m, dur=0.9, vol=0.12):
        if m not in cache:
            f = 440 * 2 ** ((m - 69) / 12); x = np.arange(int(dur * SR)) / SR
            cache[m] = (np.sin(2 * np.pi * f * x) + 0.25 * np.sin(2 * np.pi * 4 * f * x) * np.exp(-x * 20)) * env(len(x), 0.004, 5)
        return cache[m] * vol
    pattern = [0, 1, 2, 1, 0, 2, 1, 2]                           # eighth-note arpeggio, 2 bars per chord... 1 bar each
    t, bar = 0.0, 0
    while t < total:
        ch = chords[bar % 4]
        b = note(ch[0] - 24, 1.6, 0.16); o = int(t * SR); out[o:o + len(b)] += b[:len(out) - o]
        for k, pi in enumerate(pattern):
            s = note(ch[pi] + 12, 0.7, 0.07 if k % 2 else 0.09); o = int((t + k * beat / 2) * SR)
            out[o:o + len(s)] += s[:max(0, len(out) - o)]
        t += 4 * beat; bar += 1
    return out[:int(total * SR)]


# ---------------------------------------------------------------- main
async def main():
    args = sys.argv[1:]
    src = args[0]
    fake = "--fake-tts" in args
    only = int(args[args.index("--only") + 1]) if "--only" in args else None
    lesson = json.load(open(src, encoding="utf-8"))
    work = os.path.join(ROOT, "lessons", "out", lesson["id"])
    os.makedirs(work, exist_ok=True)

    lines = []
    for si, s in enumerate(lesson["slides"]):
        if only is not None and si != only:
            continue
        for li, ln in enumerate(s["lines"]):
            lines.append((s, ln, li == 0))

    # 1) voices
    clips, infos = [], []
    for i, (s, ln, first) in enumerate(lines):
        bounds, clip = [], np.zeros(0, np.float32)
        if ln["say"] and not ln.get("pause"):
            if fake:
                clip = np.zeros(int(len(ln["say"]) * (0.065 if ln["v"] != "T" else 0.18) * SR), np.float32)
            else:
                mp3 = os.path.join(work, f"a{i:03d}.mp3")
                if not os.path.exists(mp3 + ".json"):
                    await tts(ln["say"], lesson["voices"][ln["v"]], RATE[ln["v"]], mp3)
                clip = decode(mp3)
                bounds = json.load(open(mp3 + ".json", encoding="utf-8"))
        speech = len(clip) / SR
        lead = LEAD if first and i > 0 else 0.15
        dur = lead + (speech + GAP if speech else float(ln.get("pause", 1)))
        clips.append(clip)
        infos.append({"idx": i, "lead": lead, "speech": speech, "bounds": bounds, "dur": dur})
        print(f"line {i:02d} {dur:5.2f}s {ln['say'][:40]}")

    # timeline (frame-aligned so audio and video never drift)
    t, slide_t0, prev_v = 0.0, 0.0, None
    total = sum(x["dur"] for x in infos)
    for (s, ln, first), info in zip(lines, infos):
        f0, f1 = round(t * FPS), round((t + info["dur"]) * FPS)
        info["dur"] = (f1 - f0) / FPS
        t = f0 / FPS
        if first:
            slide_t0 = t
        info.update(t0=t, ts=t - slide_t0, frames=f1 - f0, p0=t / total, p1=(t + info["dur"]) / total, prev_v=prev_v)
        prev_v = ln["v"]
        t += info["dur"]
    total = t

    # 2) frames
    jobs = []
    for i, ((s, ln, first), info) in enumerate(zip(lines, infos)):
        h = os.path.join(work, f"f{i:03d}.html")
        open(h, "w", encoding="utf-8").write(frame_html(lesson, s, ln, first, info))
        jobs.append({"html": h, "frames": info["frames"]})
    json.dump({"fps": FPS, "jobs": jobs}, open(os.path.join(work, "frames.json"), "w"))
    video = os.path.join(work, "video.mp4")
    subprocess.check_call(["node", os.path.join(ROOT, "tools", "render_frames.js"), os.path.join(work, "frames.json"), video])

    # 3) audio: voices + sfx + ducked background music
    mix = np.zeros(int(total * SR) + SR, np.float32)
    voice_mask = np.zeros_like(mix)
    fx = {k: sfx(k) for k in ["pop", "whoosh", "tick", "ding", "tada"]}

    def put(sig, at, gain=1.0):
        o = int(at * SR)
        n = min(len(sig), len(mix) - o)
        if n > 0:
            mix[o:o + n] += sig[:n] * gain
    for (s, ln, first), info, clip in zip(lines, infos, clips):
        a = info["t0"] + info["lead"]
        put(clip, a)
        voice_mask[int(a * SR):int((a + info["speech"]) * SR)] = 1
        if first and info["idx"] > 0:
            put(fx["whoosh"], info["t0"], 0.5)
        for p in info.get("pops", []):
            put(fx["pop"], info["t0"] + p, 0.6)
        for k in info.get("ticks", []):
            put(fx["tick"], info["t0"] + info["lead"] + k)
        if ln.get("reveal"):
            put(fx["ding"], info["t0"] + 0.05)
        if ln.get("end"):
            put(fx["tada"], info["t0"] + 0.5, 0.8)
    m = bgm(total)
    duck = np.convolve(voice_mask[:len(m)], np.ones(SR // 5) / (SR // 5), "same")   # smooth 200 ms
    put(m * (1 - 0.6 * duck), 0, 0.9)
    mix = np.clip(mix / max(1.0, np.abs(mix).max() / 0.95), -1, 1)
    wav = os.path.join(work, "audio.raw")
    (mix * 32767).astype(np.int16).tofile(wav)

    out = os.path.join(ROOT, "lessons", "out", lesson["id"] + (f"-s{only}" if only is not None else "") + ".mp4")
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-i", video, "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", wav,
                           "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out])
    print(f"done {out} ({total:.0f}s, {os.path.getsize(out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    asyncio.run(main())
