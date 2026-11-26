#!/usr/bin/env python3
"""Daily news Story (picture) + voiced Story video from today's in-game news.

python3 tools/daily_story/build.py <date YYYY-MM-DD> <out_dir>
Reads articles/<date>*.json, writes tools/daily_story/day.json (read by page.html),
voices the script with edge-tts (host's gender), renders frames with shot.js (needs CAST_DIR)
and writes <out_dir>/story.jpg and <out_dir>/story.mp4.
"""
import asyncio, glob, hashlib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATE, OUT = sys.argv[1], os.path.abspath(sys.argv[2])
os.makedirs(OUT, exist_ok=True)

ZH = {"IE": "愛爾蘭", "TW": "台灣", "HK": "香港", "MO": "澳門", "CN": "中國", "JP": "日本", "KR": "韓國",
      "MY": "馬來西亞", "SG": "新加坡", "US": "美國", "GB": "英國", "UK": "英國", "AU": "澳洲", "NZ": "紐西蘭",
      "CA": "加拿大", "ES": "西班牙", "IN": "印度", "DE": "德國", "FR": "法國", "TH": "泰國", "VN": "越南", "PH": "菲律賓"}
EN = {"IE": "Ireland", "TW": "Taiwan", "HK": "Hong Kong", "MO": "Macau", "CN": "China", "JP": "Japan", "KR": "Korea",
      "MY": "Malaysia", "SG": "Singapore", "US": "the US", "GB": "the UK", "UK": "the UK", "AU": "Australia",
      "NZ": "New Zealand", "CA": "Canada", "ES": "Spain", "IN": "India", "DE": "Germany", "FR": "France",
      "TH": "Thailand", "VN": "Vietnam", "PH": "the Philippines"}
NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh",
       "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth",
       "twentieth"]
MONTH = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
         "November", "December"]


def ordinal(n):
    if n <= 20: return ORD[n]
    tens = {2: "twenty", 3: "thirty"}[n // 10]
    return tens + ("-" + ORD[n % 10] if n % 10 else "ieth")


# ---------- news ----------
arts = []
for f in sorted(glob.glob(f"articles/{DATE}*.json")):
    a = json.load(open(f, encoding="utf-8"))
    if a.get("date") != DATE or not a.get("title"): continue
    a["region"] = a.get("region") or "IE"
    arts.append(a)
if not arts: sys.exit(f"no articles for {DATE} yet")
nat = sorted([a for a in arts if a["region"] == "IE"], key=lambda a: a.get("rank", 9))
reg = sorted([a for a in arts if a["region"] != "IE"], key=lambda a: (a.get("rank", 9), a["region"]))
pick = nat[:2] + reg[:1]
for a in nat[2:] + reg[1:]:
    if len(pick) >= 3: break
    pick.append(a)
if len(pick) < 3: sys.exit(f"only {len(pick)} articles for {DATE}; need 3")
rest = [a for a in nat + reg if a not in pick]


def word(a):
    """A B1+ word from the headline, with its Chinese gloss."""
    g = a.get("gloss") or {}
    toks = [t.lower() for t in re.findall(r"[A-Za-z][A-Za-z'-]+", a["title"])]
    best = None
    for t in toks:
        e = g.get(t)
        if e and e.get("zh") and e.get("lvl", "A1") >= "B1" and (not best or len(t) > len(best[0])):
            best = (t, e)
    if not best:
        return {"word": "", "wordZh": "", "lvl": ""}
    t, e = best
    return {"word": t, "wordZh": re.split(r"[；;（(]", e["zh"])[0], "lvl": e.get("lvl", "")}


def zh_short(a):
    return (a.get("summaryZh") or "").rstrip("。")


news = [dict(region=a["region"], topic=a.get("topic", ""), en=a["title"], zh=zh_short(a), **word(a)) for a in pick]
counts = {}
for a in arts: counts[a["region"]] = counts.get(a["region"], 0) + 1
regions = [dict(code=c, name=ZH.get(c, c), count=n) for c, n in sorted(counts.items(), key=lambda x: (x[0] != "IE", -x[1]))]

# ---------- host (same pick per date as the first samples) ----------
cast = [dict(key=k, name=n.split("（")[0], country=c, g="f" if s == "女" else "m")
        for k, _, n, c, s, *_ in json.load(open(os.path.join(HERE, "cast.json"), encoding="utf-8"))]
cast.append(dict(key="niamh", name="Niamh", country="愛爾蘭", g="f"))
BG = ["cafe", "office", "pub", "kitchen", "livingroom", "airport", "canteen", "event"]
hsh = int(hashlib.sha1(DATE.encode()).hexdigest(), 16)
host = cast[hsh % len(cast)]; host["bg"] = BG[(hsh // 97) % len(BG)]
k = host["key"]
host["poses"] = ({"base": "niamh-hi", "hi": "niamh-hi", "talk": "niamh-talk", "think": "niamh-point", "happy": "niamh-cheer"}
                 if k == "niamh" else {"base": k, "hi": k + "-happy", "talk": k + "-talk", "think": k + "-think", "happy": k + "-happy"})

y, m, d = map(int, DATE.split("-"))
day = dict(date=DATE, dateZh=f"{m}月{d}日", news=news, regions=regions, host=host,
           more=[dict(region=a["region"], zh=zh_short(a)) for a in rest[:3]],
           rn={c: ZH.get(c, c) for c in counts})
json.dump(day, open(os.path.join(HERE, "day.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---------- script ----------
parts = [f"{NUM[n] if n < len(NUM) else n} {'story' if n == 1 else 'stories'} from {EN.get(c, c)}" for c, n in
         [(r["code"], r["count"]) for r in regions]]
said = parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]
lines = [["s1", "en", f"Hi, I'm {host['name']}! Here's today's news from the BinBin game, {MONTH[m]} the {ordinal(d)}."]]
for i, n in enumerate(news):
    lines += [[f"s{i + 2}e", "en", n["en"] + "."], [f"s{i + 2}z", "zh", n["zh"] + "。"]]
lines += [["s5", "en", f"Today, the game has {said}. Can't see your area? Pick it in the game, and your local news starts the next morning!"],
          ["s6", "en", "One news story a day, to learn English. Come and play at BinBin daily dot com!"]]
json.dump(dict(date=DATE, lines=lines), open(os.path.join(OUT, "script.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---------- voice ----------
import edge_tts
VOICE = {"f": {"zh": "zh-TW-HsiaoChenNeural", "en": "en-IE-EmilyNeural"},
         "m": {"zh": "zh-TW-YunJheNeural", "en": "en-IE-ConnorNeural"}}
RATE = {"zh": "+22%", "en": "+4%"}
AUD = os.path.join(OUT, "audio"); os.makedirs(AUD, exist_ok=True)


async def tts():
    for key, lang, text in lines:
        p = os.path.join(AUD, key + ".mp3")
        for a in range(6):
            voice = VOICE[host["g"]][lang] if a < 3 else VOICE["f"][lang]  # male zh voice sometimes returns nothing
            try:
                await edge_tts.Communicate(text, voice, rate=RATE[lang]).save(p)
                if os.path.getsize(p) > 500: break
            except Exception as e:
                print("retry", key, e); await asyncio.sleep(3 + a * 5)
        else:
            sys.exit("voice failed " + key)
asyncio.run(tts())

# ---------- pictures + video ----------
FR = os.path.join(OUT, "frames")
subprocess.run(["node", os.path.join(HERE, "shot.js"), FR, "story", "intro", "n0", "n1", "n2", "regions", "cta"], check=True)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(FR, "story.png"), "-q:v", "2", os.path.join(OUT, "story.jpg")], check=True)
subprocess.run([sys.executable, os.path.join(HERE, "make_short.py"), FR, AUD, os.path.join(OUT, "story.mp4")], check=True)
print("built", DATE, [n["en"] for n in news], "host", host["name"])
