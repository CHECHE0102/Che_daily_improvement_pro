"""Turn a long lesson script (lessons/long/*.json) into a 1920x1080 mp4 for YouTube (5-10 minutes, 25 fps).

Same idea as tools/make_lesson_video.py (whose voices, sound effects and music it reuses):
edge-tts voices each line -> one HTML page per line (lessons/long/long-render.js) ->
tools/render_long_frames.js seeks the CSS animations frame by frame into ffmpeg -> voices + effects + music are mixed in.

usage: python tools/make_long_lesson.py lessons/long/L031-cafe-first-day.json [--fake-tts] [--scenes 3,4] [--shots DIR] [--stills]
  --fake-tts   silence instead of real voices (layout and length check without network)
  --scenes     render only these scenes (0-based, comma separated)
  --shots DIR  also save a png of every line's last frame
  --stills     one frame per line only (fast layout check; no usable video)
Output: lessons/out/<id>.mp4 (not committed).
"""
import asyncio, json, os, subprocess, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_lesson_video import ROOT, SR, FPS, voice_line, sfx, bgm  # noqa: E402

GAP, LEAD = 0.35, 0.55


def fake_len(ln):
    en = sum(c.isascii() and c.isalpha() for c in ln["say"])
    zh = sum("一" <= c <= "鿿" for c in ln["say"])
    return en * 0.068 + zh * 0.21 + 0.2


async def main():
    args = sys.argv[1:]
    src = args[0]
    fake, stills = "--fake-tts" in args, "--stills" in args
    only = [int(x) for x in args[args.index("--scenes") + 1].split(",")] if "--scenes" in args else None
    shots = args[args.index("--shots") + 1] if "--shots" in args else None
    lesson = json.load(open(src, encoding="utf-8"))
    work = os.path.join(ROOT, "lessons", "out", lesson["id"])
    os.makedirs(work, exist_ok=True)
    art_dir = os.path.join(ROOT, "assets", "art", "lesson", lesson.get("teacher", "niamh"))

    lines = []
    for si, s in enumerate(lesson["scenes"]):
        if only is not None and si not in only:
            continue
        for li, ln in enumerate(s["lines"]):
            lines.append((s, ln, li == 0, si, li))

    # 1) voices
    clips, infos = [], []
    for i, (s, ln, first, si, li) in enumerate(lines):
        bounds, clip = [], np.zeros(0, np.float32)
        if ln.get("say") and not ln.get("pause"):
            if fake:
                clip = np.zeros(int(fake_len(ln) * SR), np.float32)
            else:
                # file names carry scene/line so clips cached by an earlier run are found again
                clip, bounds = await voice_line(ln, lesson["voices"], os.path.join(work, f"a{si:02d}-{li:02d}"), lesson.get("prosody"))
        speech = len(clip) / SR
        lead = LEAD if first else 0.18
        echo = max(1.8, speech * 1.25 + 0.6) if ln.get("echo") else 0.0     # time for the viewer to say it
        dur = lead + (speech + GAP + echo if speech else float(ln.get("pause", 1)))
        clips.append(clip)
        infos.append({"idx": i, "lead": lead, "speech": speech, "bounds": bounds, "dur": dur, "echo": echo})
        print(f"line {i:03d} {dur:5.2f}s {ln.get('say', '')[:44]}")

    # timeline, frame-aligned so audio and video never drift
    t, scene_t0, prev_pose, prev_type = 0.0, 0.0, None, None
    total = sum(x["dur"] for x in infos)
    for (s, ln, first, si, li), info in zip(lines, infos):
        f0, f1 = round(t * FPS), round((t + info["dur"]) * FPS)
        info["dur"] = (f1 - f0) / FPS
        t = f0 / FPS
        if first:
            scene_t0 = t
        board_types = ("talk", "phrase", "recap")
        info.update(t0=t, ts=t - scene_t0, frames=f1 - f0, p0=t / total, p1=(t + info["dur"]) / total, first=first,
                    prevPose=None if first and not (prev_type in board_types and s["type"] in board_types) else prev_pose,
                    sceneEnter=first and not (prev_type in board_types and s["type"] in board_types),
                    wipe=first and info["idx"] > 0 and (s["type"] in ("chapter", "skit") or prev_type in ("chapter", "skit")))
        prev_pose = ln.get("pose", "talk") if s["type"] != "skit" else None
        if li == len(s["lines"]) - 1:
            prev_type = s["type"]
        t += info["dur"]
    total = t
    print(f"total {total:.0f}s = {total / 60:.1f} min")

    # 2) frames
    jobs = [{"si": si, "li": li, "frames": 1 if stills else info["frames"], "html": os.path.join(work, f"f{info['idx']:03d}.html"),
             "info": {k: info[k] for k in ("first", "lead", "speech", "bounds", "dur", "echo", "ts", "p0", "p1", "prevPose", "sceneEnter", "wipe")}}
            for (s, ln, first, si, li), info in zip(lines, infos)]
    if stills:   # show each line as it looks at its end
        for j in jobs:
            j["info"] = dict(j["info"], wipe=False)
    json.dump({"fps": FPS, "lesson": os.path.abspath(src), "art": "file://" + art_dir + "/", "artDir": art_dir, "jobs": jobs},
              open(os.path.join(work, "frames.json"), "w"))
    video = os.path.join(work, "video.mp4")
    cmd = ["node", os.path.join(ROOT, "tools", "render_long_frames.js"), os.path.join(work, "frames.json"), video]
    subprocess.check_call(cmd + (["--shots", shots] if shots else []))
    if stills:
        return

    # 3) audio: voices + effects + ducked background music
    mix = np.zeros(int(total * SR) + SR, np.float32)
    voice_mask = np.zeros_like(mix)
    fx = {k: sfx(k) for k in ["pop", "whoosh", "ding", "tada"]}

    def put(sig, at, gain=1.0):
        o = int(at * SR)
        n = min(len(sig), len(mix) - o)
        if n > 0:
            mix[o:o + n] += sig[:n] * gain
    seen = {}
    for (s, ln, first, si, li), info, clip in zip(lines, infos, clips):
        a = info["t0"] + info["lead"]
        put(clip, a)
        voice_mask[int(a * SR):int((a + info["speech"]) * SR)] = 1
        if info["wipe"]:
            put(fx["whoosh"], info["t0"], 0.5)
        if ln.get("step", 0) > seen.get(si, 0):            # something new pops onto the board
            seen[si] = ln["step"]
            put(fx["pop"], info["t0"] + info["lead"] * 0.5, 0.6)
        if ln.get("sticker"):
            put(fx["pop"], a, 0.5)
        if info["echo"]:
            put(fx["ding"], a + info["speech"] + 0.15, 0.7)
        if ln.get("end"):
            put(fx["tada"], info["t0"] + 0.4, 0.8)
    m = bgm(total)
    duck = np.convolve(voice_mask[:len(m)], np.ones(SR // 5) / (SR // 5), "same")
    put(m * (1 - 0.65 * duck), 0, 0.7)
    fade = int(2 * SR)
    mix[int(total * SR) - fade:int(total * SR)] *= np.linspace(1, 0, fade)
    mix = np.clip(mix / max(1.0, np.abs(mix).max() / 0.95), -1, 1)
    raw = os.path.join(work, "audio.raw")
    (mix * 32767).astype(np.int16).tofile(raw)

    out = os.path.join(ROOT, "lessons", "out", lesson["id"] + ("-part" if only is not None else "") + ".mp4")
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-i", video, "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", raw,
                           "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out])
    print(f"done {out} ({total:.0f}s, {os.path.getsize(out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    asyncio.run(main())
