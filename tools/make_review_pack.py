"""Build a plain-text "proofreading pack" of the latest days' news for an outside checker (ChatGPT).

Usage: python tools/make_review_pack.py OUT_DIR [DAYS]

Writes, for each of the last DAYS news dates (default 3):
  OUT_DIR/DATE/index.md        list of that day's articles with links
  OUT_DIR/DATE/<id>.md         title, summaries, every level's text (numbered P/S), sentZh, questions
  OUT_DIR/DATE/<id>-words-N.md the word glossary in parts (all 6 languages, one line per word)
and OUT_DIR/latest.md = copy of the newest DATE/index.md.
The workflow news-review.yml copies OUT_DIR to review/ on main (served at https://binbindaily.com/review/).
"""
import json, os, re, sys, glob

REPO = "CHECHE0102/Che_daily_improvement_pro"
# served by GitHub Pages from main/review/ (ChatGPT can't open raw.githubusercontent.com)
RAW = "https://binbindaily.com/review"
LEVELS = ["A2", "B1", "B2", "C1", "IELTS"]
SPLIT = re.compile(r"(?<=[.!?])\s+")


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def article_files(date):
    out = []
    for p in sorted(glob.glob(f"articles/{date}*.json")):
        name = os.path.basename(p)[:-5]
        if re.fullmatch(rf"{date}(-\d+|-wx|-[a-z]{{2}}-\d+|-[a-z]{{2}}-wx)?", name):
            out.append(p)
    # national first (rank order), then regions
    def key(p):
        a = load(p)
        return (1 if a.get("region") else 0, a.get("region") or "", a.get("rank") or 99, p)
    return sorted(out, key=key)


def text_pack(a, questions):
    L = []
    aid = a.get("id")
    L.append(f"# {aid}  ({'region ' + a['region'] if a.get('region') else 'Ireland national'})")
    L.append(f"date: {a.get('date')} | rank: {a.get('rank')} | topic: {a.get('topic')} | main level: {a.get('level')}")
    L.append(f"file: articles/{aid}.json")
    L.append("")
    L.append(f"## title\n{a.get('title')}")
    L.append("\n## summaries")
    for k in ["summaryEn", "summaryZh", "summaryJa", "summaryKo", "summaryEs", "summaryHi"]:
        if a.get(k):
            L.append(f"- {k}: {a[k]}")
    L.append("\n## sources")
    for s in a.get("sources", []):
        L.append(f"- {s.get('name')}: {s.get('url')}")
    if a.get("paragraphs"):
        L.append("\n## top-level paragraphs (field \"paragraphs\", shown when no level is chosen)")
        for i, p in enumerate(a["paragraphs"], 1):
            L.append(f"P{i}: {p}")
    for lv in LEVELS:
        d = (a.get("levels") or {}).get(lv)
        if not d:
            continue
        L.append(f"\n## level {lv}")
        zh = d.get("sentZh") or []
        for i, p in enumerate(d.get("paragraphs", []), 1):
            sents = SPLIT.split(p.strip())
            zs = zh[i - 1] if i - 1 < len(zh) else []
            for j, s in enumerate(sents, 1):
                L.append(f"{lv} P{i} S{j}: {s}")
                if j - 1 < len(zs):
                    L.append(f"    zh: {zs[j - 1]}")
            if len(zs) != len(sents):
                L.append(f"    (note: {len(sents)} English sentences but {len(zs)} zh sentences in this paragraph)")
    if questions:
        L.append("\n## reading questions (file reason/" + a.get("date") + ".json)")
        for n, q in enumerate(questions, 1):
            L.append(f"Q{n} [{q.get('type')}]: {q.get('q')}")
            for k, o in enumerate(q.get("opts", [])):
                mark = "  <- answer" if k == q.get("a") else ""
                L.append(f"   {'ABCD'[k]}. {o}{mark}")
            L.append(f"   explanation: {q.get('exp')}")
    return "\n".join(L) + "\n"


WORDS_PER_PART = 130


def words_packs(a):
    """The glossary split into parts of WORDS_PER_PART words, so each page stays small enough to read whole."""
    items = list((a.get("gloss") or {}).items())
    parts = [items[i:i + WORDS_PER_PART] for i in range(0, len(items), WORDS_PER_PART)] or [[]]
    return [words_pack(a, part, n + 1, len(parts)) for n, part in enumerate(parts)]


def words_pack(a, items, n, total):
    L = [f"# {a.get('id')} word glossary part {n} of {total} (field \"gloss\" in articles/{a.get('id')}.json)",
         "format: key | base | pos | lvl | en | zh | ja | ko | es | hi | ex | syn | ant | col", ""]
    for k, g in items:
        def j(x):
            return ", ".join(x) if isinstance(x, list) else (x or "")
        L.append(" | ".join([k] + [j(g.get(f)) for f in ["base", "pos", "lvl", "en", "zh", "ja", "ko", "es", "hi", "ex", "syn", "ant", "col"]]))
    return "\n".join(L) + "\n"


def main():
    out = sys.argv[1]
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    dates = sorted({m.group(1) for p in glob.glob("articles/*.json")
                    for m in [re.match(r"(\d{4}-\d{2}-\d{2})", os.path.basename(p))] if m})[-days:]
    newest = None
    for date in dates:
        files = article_files(date)
        if not files:
            continue
        rq = {}
        if os.path.exists(f"reason/{date}.json"):
            rq = load(f"reason/{date}.json").get("items", {})
        os.makedirs(f"{out}/{date}", exist_ok=True)
        idx = [f"# BinBin news proofreading pack — {date}", "",
               f"{len(files)} articles. For each article read ALL its files (text, then every words part).",
               f"Paths are files on the main branch of GitHub repo {REPO} (read them with the GitHub connector); the same files are also at {RAW}/<path after review/>.", ""]
        for p in files:
            a = load(p)
            aid = a.get("id") or os.path.basename(p)[:-5]
            a["id"] = aid
            with open(f"{out}/{date}/{aid}.md", "w", encoding="utf-8") as f:
                f.write(text_pack(a, rq.get(aid)))
            wp = words_packs(a)
            for n, w in enumerate(wp, 1):
                with open(f"{out}/{date}/{aid}-words-{n}.md", "w", encoding="utf-8") as f:
                    f.write(w)
            where = f"region {a['region']}" if a.get("region") else "Ireland national"
            idx.append(f"- {aid} ({where}, {a.get('topic')}): {a.get('title')}")
            idx.append(f"  - text:  review/{date}/{aid}.md")
            for n in range(1, len(wp) + 1):
                idx.append(f"  - words part {n}/{len(wp)}: review/{date}/{aid}-words-{n}.md")
        body = "\n".join(idx) + "\n"
        with open(f"{out}/{date}/index.md", "w", encoding="utf-8") as f:
            f.write(body)
        newest = body
    if newest:
        with open(f"{out}/latest.md", "w", encoding="utf-8") as f:
            f.write(newest)


if __name__ == "__main__":
    main()
