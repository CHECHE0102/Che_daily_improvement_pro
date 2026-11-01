"""Turn a lesson script (lessons/scripts/*.json) into a vertical mp4 (1080x1920).

Each spoken line becomes one frame: the slide plus a caption bar. Lines are voiced
with edge-tts (Microsoft Edge neural voices), frames are drawn by Chromium
(tools/render_frames.js), and ffmpeg joins them.

usage: python tools/make_lesson_video.py lessons/scripts/L001-irish-phrases.json [--fake-tts]
--fake-tts uses silence instead of real voices (for checking the layout offline).
Output: lessons/out/<id>.mp4 (not committed; the workflow uploads it as an artifact).
"""
import asyncio, html, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "assets", "art")
GAP = 0.45          # silence after each line (seconds)
RATE = {"T": "+0%", "A": "-8%", "B": "-8%"}
WHO = {"A": "Emily", "B": "Connor"}


def esc(s):
    return html.escape(s or "")


def img(name):
    return "file://" + os.path.join(ART, name + ".webp")


CSS = """
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@500;700;900&family=Poppins:wght@600;800&display=block');
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1920px;overflow:hidden;position:relative;color:#fff;
 font-family:'Poppins','Noto Sans TC',sans-serif;
 background:radial-gradient(circle at 50% 38%,#23785f 0%,#1c6a55 55%,#154f40 100%)}
.brand{position:absolute;top:70px;left:70px;font-family:Poppins;font-weight:800;font-size:48px;letter-spacing:-1px}
.brand b{color:#f0be45;font-weight:600;font-size:32px;margin-left:8px}
.tag{position:absolute;top:80px;right:70px;font-size:30px;color:#cfe7de;font-weight:700;
 border:3px solid #cfe7de55;border-radius:999px;padding:6px 26px}
.stage{position:absolute;top:190px;left:60px;right:60px;height:1250px;display:flex;flex-direction:column;align-items:center;text-align:center}
.kicker{font-size:44px;color:#f0be45;font-weight:900;margin-top:40px}
.head{font-size:110px;line-height:1.15;font-weight:900;margin-top:24px}
.sub{font-size:48px;color:#e8f3ef;font-weight:700;margin-top:28px}
.circle{border-radius:50%;background:#dcebe5;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;flex-shrink:0}
.circle img{width:92%}
.num{width:110px;height:110px;border-radius:50%;background:#f0be45;color:#1d2a26;font-size:64px;font-weight:800;
 display:flex;align-items:center;justify-content:center;margin-top:30px}
.phrase{font-size:170px;font-weight:800;line-height:1.1;margin-top:10px;color:#fff}
.pron{font-size:40px;color:#cfe7de;font-weight:700}
.meaning{margin-top:24px;background:#f0be45;color:#1d2a26;border-radius:999px;padding:20px 56px;font-size:54px;font-weight:900}
.points{margin-top:50px;width:100%}
.points div{background:#ffffff18;border-radius:28px;padding:28px 36px;margin:0 0 24px;font-size:50px;font-weight:700;text-align:left}
.q{margin-top:40px;font-size:66px;font-weight:800;line-height:1.25;background:#ffffff18;border-radius:32px;padding:36px 44px}
.ask{margin-top:36px;font-size:50px;font-weight:900;color:#f0be45}
.opt{width:100%;margin-top:26px;border-radius:28px;padding:28px 40px;font-size:54px;font-weight:700;text-align:left;background:#ffffff18;border:5px solid transparent}
.opt.ok{background:#f0be45;color:#1d2a26;border-color:#fff}
.opt.dim{opacity:.4}
.card{width:100%;display:flex;align-items:center;gap:36px;background:#ffffff18;border-radius:30px;padding:30px 44px;margin-top:28px}
.card b{font-size:80px;font-weight:800;color:#f0be45;min-width:330px;text-align:left}
.card span{font-size:50px;font-weight:700}
.cap{position:absolute;left:50px;right:50px;bottom:110px;min-height:330px;border-radius:40px;padding:44px 54px;
 display:flex;flex-direction:column;justify-content:center;background:#0d3a2fe6;border:4px solid #ffffff22}
.cap.en{background:#fff;color:#1d2a26;border-color:#f0be45}
.who{font-size:34px;font-weight:800;color:#f0be45;margin-bottom:12px}
.cap.en .who{color:#1c6a55}
.txt{font-size:52px;line-height:1.45;font-weight:700}
.cap.en .txt{font-size:64px;font-weight:800;line-height:1.3}
.bar{position:absolute;left:50px;right:50px;bottom:60px;height:12px;border-radius:6px;background:#ffffff22;overflow:hidden}
.bar i{display:block;height:100%;background:#f0be45}
"""


def stage(s, line):
    t = s["type"]
    if t == "title":
        return (f'<div class="kicker">{esc(s["kicker"])}</div><div class="head">{esc(s["head"])}</div>'
                f'<div class="sub">{esc(s["sub"])}</div>'
                f'<div class="circle" style="width:640px;height:640px;margin-top:70px"><img src="{img(s["img"])}"></div>')
    if t == "phrase":
        pron = f'<div class="pron">{esc(s["pron"])}</div>' if s.get("pron") else ""
        return (f'<div class="num">{esc(s["num"])}</div><div class="phrase">{esc(s["phrase"])}</div>{pron}'
                f'<div class="meaning">{esc(s["meaning"])}</div>'
                f'<div class="circle" style="width:560px;height:560px;margin-top:60px"><img src="{img(s["img"])}"></div>')
    if t == "grammar":
        pts = "".join(f"<div>✦ {esc(p)}</div>" for p in s["points"])
        return (f'<div class="kicker">{esc(s["kicker"])}</div><div class="head" style="font-size:96px">{esc(s["head"])}</div>'
                f'<div class="points">{pts}</div>'
                f'<div class="circle" style="width:380px;height:380px;margin-top:10px"><img src="{img(s["img"])}"></div>')
    if t == "quiz":
        rev = line.get("reveal")
        opts = "".join(
            f'<div class="opt {"ok" if rev and i == s["ans"] else "dim" if rev else ""}">{"ABC"[i]}. {esc(o)}{" ✓" if rev and i == s["ans"] else ""}</div>'
            for i, o in enumerate(s["opts"]))
        return (f'<div class="kicker">🎯 小測驗</div><div class="q">“{esc(s["q"])}”</div>'
                f'<div class="ask">{esc(s["ask"])}</div>{opts}')
    if t == "recap":
        cards = "".join(f'<div class="card"><b>{esc(a)}</b><span>{esc(b)}</span></div>' for a, b in s["items"])
        return (f'<div class="kicker">今天學到的</div>{cards}'
                f'<div class="circle" style="width:420px;height:420px;margin-top:50px"><img src="{img(s["img"])}"></div>')
    raise ValueError("unknown slide type " + t)


def frame_html(lesson, s, line, progress):
    v = line["v"]
    en = v != "T"
    who = WHO.get(v, "BinBin 老師")
    cap = line.get("cap") or line["say"]
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>'
            f'<div class="brand">BinBin<b>daily</b></div><div class="tag">{esc(lesson["id"])} · {esc(lesson["level"])}</div>'
            f'<div class="stage">{stage(s, line)}</div>'
            f'<div class="cap{" en" if en else ""}"><div class="who">{"🗣 " if en else "👩‍🏫 "}{esc(who)}</div>'
            f'<div class="txt">{esc(cap)}</div></div>'
            f'<div class="bar"><i style="width:{progress*100:.1f}%"></i></div></body></html>')


def dur(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.strip())


def silence(path, secs):
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                           "-t", f"{secs:.3f}", path])


async def tts(text, voice, rate, path):
    import edge_tts
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, voice, rate=rate).save(path + ".tmp")
            os.replace(path + ".tmp", path)
            return
        except Exception as e:  # network hiccups: retry
            print("  retry", attempt, voice, e)
            await asyncio.sleep(3 * (attempt + 1))
    raise RuntimeError("tts failed: " + text)


async def main():
    src = sys.argv[1]
    fake = "--fake-tts" in sys.argv
    lesson = json.load(open(src, encoding="utf-8"))
    work = os.path.join(ROOT, "lessons", "out", lesson["id"])
    os.makedirs(work, exist_ok=True)
    lines = [(s, ln) for s in lesson["slides"] for ln in s["lines"]]

    # 1) voice every line, pad with a short gap, normalise to 24 kHz mono wav
    wavs, durs = [], []
    for i, (s, ln) in enumerate(lines):
        wav = os.path.join(work, f"a{i:03d}.wav")
        if ln.get("pause") or not ln["say"]:
            silence(wav, ln.get("pause", 1))
        else:
            if fake:
                n = len(ln["say"])
                silence(os.path.join(work, "raw.wav"), n * (0.07 if ln["v"] != "T" else 0.2))
                raw = os.path.join(work, "raw.wav")
            else:
                raw = os.path.join(work, f"a{i:03d}.mp3")
                if not os.path.exists(raw):
                    await tts(ln["say"], lesson["voices"][ln["v"]], RATE[ln["v"]], raw)
            subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-i", raw, "-af", f"apad=pad_dur={GAP}",
                                   "-ar", "24000", "-ac", "1", wav])
        wavs.append(wav)
        durs.append(dur(wav))
        print(f"line {i:02d} {durs[-1]:5.2f}s {ln['say'][:40]}")

    # 2) one frame per line
    total, acc, jobs = sum(durs), 0.0, []
    for i, (s, ln) in enumerate(lines):
        acc += durs[i]
        h = os.path.join(work, f"f{i:03d}.html")
        open(h, "w", encoding="utf-8").write(frame_html(lesson, s, ln, acc / total))
        jobs.append({"html": h, "png": os.path.join(work, f"f{i:03d}.png")})
    json.dump(jobs, open(os.path.join(work, "frames.json"), "w"))
    subprocess.check_call(["node", os.path.join(ROOT, "tools", "render_frames.js"), os.path.join(work, "frames.json")])

    # 3) join: image list with durations + concatenated audio
    with open(os.path.join(work, "frames.txt"), "w") as f:
        for j, d in zip(jobs, durs):
            f.write(f"file '{j['png']}'\nduration {d:.3f}\n")
        f.write(f"file '{jobs[-1]['png']}'\n")
    with open(os.path.join(work, "audio.txt"), "w") as f:
        for w in wavs:
            f.write(f"file '{w}'\n")
    audio = os.path.join(work, "audio.wav")
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", os.path.join(work, "audio.txt"), audio])
    out = os.path.join(ROOT, "lessons", "out", lesson["id"] + ".mp4")
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", os.path.join(work, "frames.txt"),
                           "-i", audio, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "23",
                           "-tune", "stillimage", "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", out])
    print(f"done {out} ({total:.0f}s, {os.path.getsize(out)/1e6:.1f} MB)")


if __name__ == "__main__":
    asyncio.run(main())
