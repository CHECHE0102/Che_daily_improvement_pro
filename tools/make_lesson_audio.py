"""Voice every lesson for the in-app 小教室 player.

For each lessons/scripts/*.json writes
  lessons/audio/<id>/<n>.mp3     one file per spoken line (n = line number across the whole lesson)
  lessons/audio/<id>/index.json  {"v": <script hash>, "lines": {"<n>": {"f": "<n>.mp3", "d": seconds, "b": [[offset, dur, token], ...]}}}
and lessons/index.json (the lesson list the app shows, newest first).
A lesson whose script hash is unchanged is skipped. Voices come from tools/make_lesson_video.py (edge-tts).
"""
import asyncio, glob, hashlib, json, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_lesson_video import ROOT, SR, voice_line  # noqa: E402


async def build(path):
    raw = open(path, "rb").read()
    lesson = json.loads(raw)
    # hash only what is voiced, so editing title / youtube link does not re-record the lesson
    h = hashlib.sha1(json.dumps([lesson["voices"], lesson["slides"]] + ([lesson["prosody"]] if lesson.get("prosody") else []), ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
    out = os.path.join(ROOT, "lessons", "audio", lesson["id"])
    idx_path = os.path.join(out, "index.json")
    entry = {"id": lesson["id"], "file": os.path.basename(path), "title": lesson["title"], "subtitle": lesson.get("subtitle", ""),
             "level": lesson.get("level", ""), "date": lesson.get("date", ""), "youtube": lesson.get("youtube", ""), "kind": lesson.get("kind", "phrase")}
    if os.path.exists(idx_path) and json.load(open(idx_path)).get("v") == h:
        print("unchanged", lesson["id"])
        return entry
    os.makedirs(out, exist_ok=True)
    work = os.path.join(ROOT, "lessons", "out", lesson["id"])
    os.makedirs(work, exist_ok=True)
    lines, n = {}, 0
    for s in lesson["slides"]:
        for ln in s["lines"]:
            if ln["say"] and not ln.get("pause"):
                clip, bounds = await voice_line(ln, lesson["voices"], os.path.join(work, f"a{n:03d}"), lesson.get("prosody"))
                mp3 = os.path.join(out, f"{n}.mp3")
                subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                                "-c:a", "libmp3lame", "-b:a", "48k", mp3], input=clip.astype("float32").tobytes(), check=True)
                lines[str(n)] = {"f": f"{n}.mp3", "d": round(len(clip) / SR, 3), "b": [[round(o, 3), round(d, 3), t] for o, d, t in bounds]}
                print(lesson["id"], n, lines[str(n)]["d"], ln["say"][:30])
            n += 1
    for old in glob.glob(os.path.join(out, "*.mp3")):       # drop files of lines that no longer exist
        if os.path.basename(old)[:-4] not in lines:
            os.remove(old)
    json.dump({"v": h, "lines": lines}, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False)
    return entry


async def main():
    entries, failed = [], []
    for p in sorted(glob.glob(os.path.join(ROOT, "lessons", "scripts", "*.json"))):
        try:
            entries.append(await build(p))
        except Exception as e:   # keep the lessons that worked; the next run tries this one again
            print("FAILED", os.path.basename(p), e)
            failed.append(p)
    # a lesson with no finished audio stays out of the app list until it is voiced
    entries = [e for e in entries if os.path.exists(os.path.join(ROOT, "lessons", "audio", e["id"], "index.json"))]
    entries.sort(key=lambda e: e["id"], reverse=True)
    json.dump({"lessons": entries}, open(os.path.join(ROOT, "lessons", "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if failed:
        print("::warning::lessons not voiced this run: " + ", ".join(map(os.path.basename, failed)))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
