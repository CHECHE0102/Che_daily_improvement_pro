"""Build assets/dict/<lang>.json: one small offline English dictionary for the in-app 字典 search ("look up any word").
Every word in every article glossary (6 languages, part of speech, level, example, synonyms, antonyms) plus the
game word meanings (games/meanings.json). Runs daily after the articles (word-audio workflow) so it keeps growing.

usage: python tools/make_dict_index.py
Format: {"v":2,"n":count,"w":{base:[pos,lvl,meaning in that language ("" for en),en,ex,syn,ant]},"f":{form:base}}
syn/ant are "|"-joined; "f" maps inflected forms seen in articles (e.g. "warnings") to their base ("warning").
"""
import collections, glob, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD = re.compile(r"^[a-z][a-z' -]{0,30}[a-z]$|^[a-z]$")
LANGS = ["zh", "en", "hi", "es", "ja", "ko"]

def norm(t): return (t or "").strip().lower().replace("’", "'")

def main():
    cands = collections.defaultdict(list)       # base -> [gloss entries]
    forms = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "articles", "*.json"))):
        try: x = json.load(open(f, encoding="utf-8"))
        except Exception: continue
        g = x.get("gloss") if isinstance(x, dict) else None
        if not isinstance(g, dict): continue
        for k, v in g.items():
            if not isinstance(v, dict) or not v.get("zh"): continue
            b, k = norm(v.get("base") or k), norm(k)
            if not WORD.match(b): continue
            cands[b].append(v)
            if k != b and WORD.match(k): forms[k] = b
    out = {}
    for b, vs in cands.items():
        gen = [v for v in vs if v.get("lvl") != "PN"]   # a general meaning beats a news proper noun (abbey 修道院, not Abbey Street)
        vs = gen or vs
        common = collections.Counter(v["zh"] for v in vs).most_common(1)[0][0]
        pick = max(vs, key=lambda v: (v["zh"] == common, bool(v.get("ex")), len(v.get("syn") or []) > 0))
        out[b] = [pick.get("pos") or "", pick.get("lvl") or ""] + [str(pick.get(l) or "") for l in LANGS] + [
            pick.get("ex") or "", "|".join(s for s in (pick.get("syn") or []) if s)[:120],
            "|".join(s for s in (pick.get("ant") or []) if s)[:120]]
    try:
        m = json.load(open(os.path.join(ROOT, "games", "meanings.json"), encoding="utf-8"))
        for w, a in m.items():          # [zh, hi, es, ja, ko, en]
            w = norm(w)
            if w in out or w in forms or not WORD.match(w) or len(a) < 6: continue
            out[w] = ["", "", a[0], a[5], a[1], a[2], a[3], a[4], "", "", ""]
    except Exception as e:
        print("meanings.json skipped:", e)
    forms = dict(sorted((k, v) for k, v in forms.items() if k not in out and v in out))
    os.makedirs(os.path.join(ROOT, "assets", "dict"), exist_ok=True)
    for i, l in enumerate(LANGS):        # one file per app language: only that language's meaning + English
        w = {b: [v[0], v[1], "" if l == "en" else v[2 + i], v[3], v[8], v[9], v[10]] for b, v in sorted(out.items())}
        path = os.path.join(ROOT, "assets", "dict", l + ".json")
        json.dump({"v": 2, "n": len(w), "w": w, "f": forms}, open(path, "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
    print(len(out), "words,", len(forms), "forms,", os.path.getsize(path) // 1024, "KB per language")

if __name__ == "__main__":
    main()
