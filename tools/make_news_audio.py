"""Record the recent news articles as mp3 (Microsoft Edge neural voice via edge-tts), one file per article and level.

Each sentence is synthesised on its own and the pieces are joined, so the exact start time of every sentence is
known; the app uses those times to highlight the sentence being read. Sentences are split exactly like the app does.

usage: python tools/make_news_audio.py <previous audio dir or ""> <output dir>
Writes <output dir>/news/<id>-<level>.mp3 and <output dir>/manifest.json:
  {"voice": ..., "items": {"<articleId>|<level>": {"f": "news/<file>.mp3", "h": hash, "t": [sentence start seconds], "d": seconds}}}
The workflow pushes <output dir> as the orphan branch `audio` and writes news-audio.json (manifest + commit sha) to main.
"""
import asyncio, datetime, hashlib, json, os, re, shutil, sys
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "articles")
VOICE, RATE = "en-IE-EmilyNeural", "-6%"
BYTES_PER_SEC = 48000 / 8          # edge-tts default output: audio-24khz-48kbitrate-mono-mp3 (CBR)
KEEP_DAYS = 2                      # newest day + the day before (older articles fall back to the phone's voice)
SPLIT = re.compile(r'(?<=[.!?…])\s+(?=["“‘(]?[A-Z0-9])')

def h(s): return hashlib.sha1(s.encode("utf-8")).hexdigest()[:16]

def sentences(paragraphs):
    out = []
    for p in paragraphs:
        for s in SPLIT.split(p):
            s = s.strip()
            if s: out.append(s)
    return out

def load_index():
    arts = []
    for name in ("index.json", "regional.json"):
        try: arts += json.load(open(os.path.join(ART, name), encoding="utf-8")).get("articles", [])
        except FileNotFoundError: pass
    return arts

async def say(text, path):
    for attempt in range(5):
        try:
            await edge_tts.Communicate(text, VOICE, rate=RATE).save(path + ".tmp")
            if os.path.getsize(path + ".tmp") > 300: os.replace(path + ".tmp", path); return True
        except Exception as e:
            print("  retry", attempt, e)
            await asyncio.sleep(3 + attempt * 5)
    return False

async def record(key, sents, out_path, sem):
    tmpdir = out_path + ".parts"; os.makedirs(tmpdir, exist_ok=True)
    async def one(i, s):
        async with sem:
            return await say(s, os.path.join(tmpdir, f"{i:03d}.mp3"))
    ok = await asyncio.gather(*[one(i, s) for i, s in enumerate(sents)])
    if not all(ok): shutil.rmtree(tmpdir, ignore_errors=True); return None
    times, t = [], 0.0
    with open(out_path, "wb") as f:
        for i in range(len(sents)):
            b = open(os.path.join(tmpdir, f"{i:03d}.mp3"), "rb").read()
            times.append(round(t, 2)); t += len(b) / BYTES_PER_SEC; f.write(b)
    shutil.rmtree(tmpdir, ignore_errors=True)
    return times, round(t, 2)

async def main():
    prev_dir, out_dir = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2]
    os.makedirs(os.path.join(out_dir, "news"), exist_ok=True)
    prev = {}
    if prev_dir and os.path.exists(os.path.join(prev_dir, "manifest.json")):
        prev = json.load(open(os.path.join(prev_dir, "manifest.json"))).get("items", {})
    arts = load_index()
    if not arts: print("no articles"); return
    newest = max(a["date"] for a in arts)
    cutoff = (datetime.date.fromisoformat(newest) - datetime.timedelta(days=KEEP_DAYS - 1)).isoformat()
    sem = asyncio.Semaphore(4); items = {}; made = reused = failed = 0
    for meta in sorted(arts, key=lambda a: (a["date"], a.get("rank", 1))):
        if meta["date"] < cutoff: continue
        try: art = json.load(open(os.path.join(ART, meta["id"] + ".json"), encoding="utf-8"))
        except FileNotFoundError: print("missing", meta["id"]); continue
        levels = art.get("levels") or {}
        variants = [(lv, levels[lv]["paragraphs"]) for lv in levels if levels[lv].get("paragraphs")] or [("base", art.get("paragraphs", []))]
        for lv, paras in variants:
            sents = sentences(paras)
            if not sents: continue
            key, hh = f"{meta['id']}|{lv}", h(VOICE + RATE + "\n".join(sents))
            fname = f"news/{meta['id']}-{lv}.mp3"; dst = os.path.join(out_dir, fname)
            old = prev.get(key)
            if old and old.get("h") == hh and os.path.exists(os.path.join(prev_dir, old["f"])):
                shutil.copyfile(os.path.join(prev_dir, old["f"]), dst); items[key] = {**old, "f": fname}; reused += 1; continue
            r = await record(key, sents, dst, sem)
            if not r: failed += 1; print("FAILED", key); continue
            items[key] = {"f": fname, "h": hh, "t": r[0], "d": r[1]}; made += 1
            print("recorded", key, len(sents), "sentences", r[1], "s")
    json.dump({"voice": VOICE, "items": items}, open(os.path.join(out_dir, "manifest.json"), "w"), separators=(",", ":"), sort_keys=True)
    print(f"recorded {made}, reused {reused}, failed {failed}, total {len(items)}")
    if failed and not items: sys.exit(1)

asyncio.run(main())
