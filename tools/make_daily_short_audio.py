"""Voice lines for the daily news Short (social/daily/<date>/script.json -> social/daily/<date>/audio/<key>.mp3).
zh = Taiwanese Mandarin narrator, en = Irish English voice (same as the in-app news audio)."""
import asyncio, json, os, sys
import edge_tts
VOICE = {"f": {"zh": "zh-TW-HsiaoChenNeural", "en": "en-IE-EmilyNeural"},
         "m": {"zh": "zh-TW-YunJheNeural", "en": "en-IE-ConnorNeural"}}  # host's gender picks the set
RATE = {"zh": "+22%", "en": "+4%"}
async def main(path):
    j = json.load(open(path, encoding="utf-8"))
    for g in VOICE:
      out = os.path.join(os.path.dirname(path), "audio", g); os.makedirs(out, exist_ok=True)
      for key, lang, text in j["lines"]:
        p = os.path.join(out, key + ".mp3")
        for a in range(5):
            try:
                await edge_tts.Communicate(text, VOICE[g][lang], rate=RATE[lang]).save(p)
                if os.path.getsize(p) > 500: break
            except Exception as e: print("retry", key, e); await asyncio.sleep(5 + a * 10)
        else: sys.exit("failed " + key)
        print("ok", g, key)
for f in sys.argv[1:]: asyncio.run(main(f))
