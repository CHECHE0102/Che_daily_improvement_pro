"""Pre-record IELTS listening scripts as mp3 (Microsoft Edge neural voices via edge-tts).
Writes ielts/audio/<key>.mp3 and ielts/audio/index.json:
  {"tests": {"<testId>": {"v": {"F": voice, "M": voice}, "parts": [[key, ...], ...]}}}
The app plays these files line by line and falls back to the phone's own voice when a test has none."""
import asyncio, glob, hashlib, json, os, sys
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "ielts", "audio")
VOICES = [("en-GB-SoniaNeural", "en-GB-RyanNeural"), ("en-IE-EmilyNeural", "en-IE-ConnorNeural"),
          ("en-AU-NatashaNeural", "en-AU-WilliamNeural"), ("en-GB-LibbyNeural", "en-GB-ThomasNeural")]

def h(s): return hashlib.sha1(s.encode("utf-8")).hexdigest()

def load_tests():
    files = [os.path.join(ROOT, "ielts", "tests.json")] + sorted(glob.glob(os.path.join(ROOT, "ielts", "weeks", "*.json")))
    seen = {}
    for f in files:
        try: j = json.load(open(f, encoding="utf-8"))
        except Exception as e: print("skip", f, e); continue
        for t in (j.get("tests") or []) + (j.get("practice") or []):
            if t.get("id") and t.get("listening"): seen[t["id"]] = t
    return seen

async def say(text, voice, path):
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, voice, rate="-4%").save(path + ".tmp")
            if os.path.getsize(path + ".tmp") > 500: os.replace(path + ".tmp", path); return True
        except Exception as e:
            print("  retry", attempt, voice, e)
            await asyncio.sleep(3 + attempt * 5)
    if os.path.exists(path + ".tmp"): os.remove(path + ".tmp")
    return False

async def main():
    os.makedirs(OUT, exist_ok=True)
    tests = load_tests(); index = {}; keep = set(); made = 0
    for tid, t in tests.items():
        F, M = VOICES[int(h(tid)[:6], 16) % len(VOICES)]
        parts, ok = [], True
        for part in t["listening"]:
            keys = []
            for sp, text in part.get("script", []):
                v = F if sp == "F" else M
                key = h(v + "|" + text)[:16]; path = os.path.join(OUT, key + ".mp3")
                if not os.path.exists(path):
                    if not await say(text, v, path): ok = False; break
                    made += 1
                keys.append(key); keep.add(key)
            if not ok: break
            parts.append(keys)
        if ok: index[tid] = {"v": {"F": F, "M": M}, "parts": parts}
        else: print("FAILED", tid)
        print(tid, "ok" if ok else "failed", F, M)
    for f in glob.glob(os.path.join(OUT, "*.mp3")):
        if os.path.basename(f)[:-4] not in keep: os.remove(f)
    json.dump({"tests": index}, open(os.path.join(OUT, "index.json"), "w"), separators=(",", ":"), sort_keys=True)
    print("new files:", made, "tests with audio:", len(index), "/", len(tests))
    if not index and tests: sys.exit(1)

asyncio.run(main())
