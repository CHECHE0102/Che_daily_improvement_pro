"""Record single English words (every glossary word, its base form, synonyms and antonyms) as small mp3 files with the
same neural voice as the news (edge-tts). Tapping 🔊 on a word in the app plays this recording; anything not recorded
falls back to the phone's own voice.

usage: python tools/make_word_audio.py <words dir>   (the checked-out "words" branch; files are only ever added)
Writes <dir>/w/<slug>.mp3 and <dir>/manifest.json {"voice": ..., "w": [slug, ...]}
slug = the word in lower case with apostrophes turned into "_" (don't -> don_t)
"""
import asyncio, glob, json, os, re, sys
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE, RATE = "en-IE-EmilyNeural", "-8%"
LIMIT = int(os.environ.get("WORD_LIMIT", "4000"))   # new recordings per run (the first runs fill the backlog)
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
    have = sorted(f[:-4] for f in os.listdir(wd) if f.endswith(".mp3"))
    json.dump({"voice": VOICE, "w": have}, open(os.path.join(d, "manifest.json"), "w"), separators=(",", ":"))
    print(f"recorded {made}, failed {failed}, total {len(have)}")
    if todo and not made: sys.exit(1)

asyncio.run(main())
