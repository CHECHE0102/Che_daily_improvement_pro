"""Record single English words (every glossary word, its base form, synonyms and antonyms) as small mp3 files with the
same neural voice as the news (edge-tts). Tapping 🔊 on a word in the app plays this recording; anything not recorded
falls back to the phone's own voice.

usage: python tools/make_word_audio.py <words dir>   (the checked-out "words" branch; files are only ever added)
Writes <dir>/w/<slug>.mp3 and <dir>/manifest.json {"voice": ..., "w": [slug, ...]}
slug = the word in lower case with apostrophes turned into "_" (don't -> don_t)
"""
import asyncio, glob, json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE, RATE = "en-IE-EmilyNeural", "-8%"
LIMIT = int(os.environ.get("WORD_LIMIT", "4000"))   # new recordings per run (the first runs fill the backlog)
# Loudness: edge-tts words come out around -22 LUFS, clearly quieter than the phone's own voice used for sentences.
# Every file is turned up with one fixed gain to about -16 LUFS, never letting the peak go above -1.5 dB (no clipping).
TARGET_I, PEAK_MAX, NORM_VER = -16.0, -1.5, "n1"
WORD = re.compile(r"^[a-z][a-z'-]{0,30}$")

def norm(t): return (t or "").strip().lower().replace("’", "'")
def slug(w): return w.replace("'", "_")

def collect():
    out = set()
    for f in glob.glob(os.path.join(ROOT, "articles", "*.json")):
        try: x = json.load(open(f, encoding="utf-8"))
        except Exception: continue
        g = x.get("gloss") if isinstance(x, dict) else None
        if not isinstance(g, dict): continue
        for k, v in g.items():
            for t in [k, (v or {}).get("base")] + list((v or {}).get("syn") or []) + list((v or {}).get("ant") or []):
                t = norm(t)
                if WORD.match(t): out.add(t)
    return out

def level(path):
    """integrated loudness (LUFS) and true peak (dB) of a file"""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    j = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
    return float(j["input_i"]), float(j["input_tp"])

def normalize(path):
    try:
        i, tp = level(path)
        if i < -70: return True                      # silence: leave it
        gain = min(TARGET_I - i, PEAK_MAX - tp)
        if abs(gain) < 0.5: return True
        r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-af", f"volume={gain:.2f}dB",
                            "-ac", "1", "-ar", "24000", "-b:a", "48k", path + ".n.mp3"], capture_output=True)
        if r.returncode or os.path.getsize(path + ".n.mp3") < 200: return False
        os.replace(path + ".n.mp3", path); return True
    except Exception as e:
        print("  normalize failed", path, e); return False

async def say(text, path):
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, VOICE, rate=RATE).save(path + ".tmp")
            if os.path.getsize(path + ".tmp") > 200: os.replace(path + ".tmp", path); return True
        except Exception as e:
            print("  retry", text, attempt, e)
            await asyncio.sleep(2 + attempt * 4)
    try: os.remove(path + ".tmp")
    except OSError: pass
    return False

async def main():
    d = sys.argv[1]; wd = os.path.join(d, "w"); os.makedirs(wd, exist_ok=True)
    have = {f[:-4] for f in os.listdir(wd) if f.endswith(".mp3")}
    want = collect()
    todo = sorted(w for w in want if slug(w) not in have)[:LIMIT]
    print(f"{len(want)} words, {len(have)} recorded, recording {len(todo)} now")
    sem = asyncio.Semaphore(8); made = failed = 0
    async def one(w):
        nonlocal made, failed
        async with sem:
            ok = await say(w, os.path.join(wd, slug(w) + ".mp3"))
            if ok: made += 1
            else: failed += 1
    await asyncio.gather(*[one(w) for w in todo])
    # bring every recording not yet levelled (new ones, and once the whole backlog) to the same loudness
    nf = os.path.join(d, "normalized.txt")
    done = set(open(nf).read().split()) if os.path.exists(nf) else set()
    done = {x for x in done if x.startswith(NORM_VER + ":")}   # a new NORM_VER levels everything again
    names = sorted(f[:-4] for f in os.listdir(wd) if f.endswith(".mp3"))
    lv = [n for n in names if f"{NORM_VER}:{n}" not in done]
    print(f"levelling {len(lv)} recordings")
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
        for n, ok in zip(lv, ex.map(lambda n: normalize(os.path.join(wd, n + ".mp3")), lv)):
            if ok: done.add(f"{NORM_VER}:{n}")
    open(nf, "w").write("\n".join(sorted(done)) + "\n")
    have = sorted(f[:-4] for f in os.listdir(wd) if f.endswith(".mp3"))
    json.dump({"voice": VOICE, "w": have}, open(os.path.join(d, "manifest.json"), "w"), separators=(",", ":"))
    print(f"recorded {made}, failed {failed}, total {len(have)}")
    if todo and not made: sys.exit(1)

asyncio.run(main())
