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
import asyncio, json, os, re, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "assets", "art")
SR, FPS = 24000, 25
GAP, LEAD = 0.30, 0.45            # silence after each line; lead-in before a new slide's first line
# (rate, pitch) per voice key; "TE" = the English words inside the teacher's Chinese lines
PROSODY = {"T": ("+6%", "-4Hz"), "TE": ("-6%", "-6Hz"), "A": ("-4%", "+0Hz"), "B": ("-4%", "+0Hz")}
EN_RUN = re.compile(r"[A-Za-z][A-Za-z0-9'’\- ,.?!]*")
SEG_GAP = 0.06      # pause between a Chinese and an English segment


# ---------------------------------------------------------------- audio
def decode(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"])
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def segments(say):
    """Split a teacher line into Chinese and English runs: [(key, text)], key "T" or "TE"."""
    out, pos = [], 0
    for m in EN_RUN.finditer(say):
        en = m.group().rstrip(" ,")
        if pos < m.start():
            out.append(("T", say[pos:m.start()]))
        out.append(("TE", en))
        pos = m.start() + len(en)
    if pos < len(say):
        out.append(("T", say[pos:]))
    # punctuation-only pieces (e.g. the 、 in "A、B") become a short pause
    return [(k if re.search(r"[\w\u4e00-\u9fff]", t) else "P", t) for k, t in out if t.strip()]


async def voice_line(ln, voices, base):
    """Voice one line; teacher lines switch to a native English voice for English words.
    Returns (float32 clip, word boundaries [offset, dur, text])."""
    segs = segments(ln["say"]) if ln["v"] == "T" else [(ln["v"], ln["say"])]
    clip, bounds, gap = [], [], np.zeros(int(SEG_GAP * SR), np.float32)
    t = 0.0
    for j, (k, text) in enumerate(segs):
        if k == "P":
            clip.append(np.zeros(int(0.22 * SR), np.float32)); t += 0.22
            continue
        mp3 = f"{base}-{j}.mp3"
        if not os.path.exists(mp3 + ".json"):
            await tts(text, voices[k], *PROSODY[k], mp3)
        c, cut = trim(decode(mp3))
        if j and segs[j - 1][0] not in (k, "P"):
            clip.append(gap); t += SEG_GAP
        for off, d, tok in json.load(open(mp3 + ".json", encoding="utf-8")):
            bounds.append([t + off - cut, d, tok])
        clip.append(c); t += len(c) / SR
    return (np.concatenate(clip) if clip else np.zeros(0, np.float32)), bounds


def trim(c, thr=0.01):
    """Cut leading/trailing silence edge-tts adds around each clip (keeps segment joins tight)."""
    idx = np.where(np.abs(c) > thr)[0]
    if not len(idx):
        return c, 0.0
    a, b = max(0, idx[0] - int(0.02 * SR)), min(len(c), idx[-1] + int(0.06 * SR))
    return c[a:b], a / SR


async def tts(text, voice, rate, pitch, path):
    import edge_tts
    # the service sometimes returns no audio for a voice + prosody pair; fall back to plainer settings
    tries = [(rate, pitch), (rate, pitch), (rate, "+0Hz"), ("+0%", "+0Hz"), ("+0%", "+0Hz")]
    for attempt, (r, p) in enumerate(tries):
        try:
            com = edge_tts.Communicate(text, voice, rate=r, pitch=p, boundary="WordBoundary")
            audio, bounds = bytearray(), []
            async for ch in com.stream():
                if ch["type"] == "audio":
                    audio += ch["data"]
                elif ch["type"] == "WordBoundary":
                    bounds.append([ch["offset"] / 1e7, ch["duration"] / 1e7, ch["text"]])
            if not audio:
                raise RuntimeError("empty audio")
            open(path, "wb").write(audio)
            json.dump(bounds, open(path + ".json", "w"), ensure_ascii=False)
            return
        except Exception as e:  # network hiccups
            print("  retry", attempt, voice, r, p, e)
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
            lines.append((s, ln, li == 0, si, li))

    # 1) voices
    clips, infos = [], []
    for i, (s, ln, first, _, _) in enumerate(lines):
        bounds, clip = [], np.zeros(0, np.float32)
        if ln["say"] and not ln.get("pause"):
            if fake:
                clip = np.zeros(int(len(ln["say"]) * (0.065 if ln["v"] != "T" else 0.18) * SR), np.float32)
            else:
                clip, bounds = await voice_line(ln, lesson["voices"], os.path.join(work, f"a{i:03d}"))
        speech = len(clip) / SR
        lead = LEAD if first and i > 0 else 0.15
        dur = lead + (speech + GAP if speech else float(ln.get("pause", 1)))
        clips.append(clip)
        infos.append({"idx": i, "lead": lead, "speech": speech, "bounds": bounds, "dur": dur})
        print(f"line {i:02d} {dur:5.2f}s {ln['say'][:40]}")

    # timeline (frame-aligned so audio and video never drift)
    t, slide_t0, prev_v = 0.0, 0.0, None
    total = sum(x["dur"] for x in infos)
    for (s, ln, first, _, _), info in zip(lines, infos):
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
    for (s, ln, first, si, li), info in zip(lines, infos):
        jobs.append({"si": si, "li": li, "frames": info["frames"], "html": os.path.join(work, f"f{info['idx']:03d}.html"),
                     "info": {"idx": info["idx"], "first": first, "lead": info["lead"], "speech": info["speech"], "bounds": info["bounds"],
                              "dur": info["dur"], "t0": info["t0"], "ts": info["ts"], "p0": info["p0"], "p1": info["p1"], "prevV": info["prev_v"]}})
    json.dump({"fps": FPS, "lesson": os.path.abspath(src), "art": "file://" + ART + "/", "jobs": jobs}, open(os.path.join(work, "frames.json"), "w"))
    video = os.path.join(work, "video.mp4")
    subprocess.check_call(["node", os.path.join(ROOT, "tools", "render_frames.js"), os.path.join(work, "frames.json"), video])
    for info, m in zip(infos, json.load(open(os.path.join(work, "frames-meta.json")))):   # sfx moments from the renderer
        info["pops"], info["ticks"] = m["pops"], m["ticks"]

    # 3) audio: voices + sfx + ducked background music
    mix = np.zeros(int(total * SR) + SR, np.float32)
    voice_mask = np.zeros_like(mix)
    fx = {k: sfx(k) for k in ["pop", "whoosh", "tick", "ding", "tada"]}

    def put(sig, at, gain=1.0):
        o = int(at * SR)
        n = min(len(sig), len(mix) - o)
        if n > 0:
            mix[o:o + n] += sig[:n] * gain
    for (s, ln, first, _, _), info, clip in zip(lines, infos, clips):
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
