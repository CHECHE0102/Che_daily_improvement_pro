"""Build a plain-text "proofreading pack" of the latest days' news for an outside checker (ChatGPT).

Usage: python tools/make_review_pack.py OUT_DIR [DAYS]

Writes, for each of the last DAYS news dates (default 3):
  OUT_DIR/DATE/index.md        list of that day's articles with links
  OUT_DIR/DATE/<id>.md         title, summaries, every level's text (numbered P/S), sentZh, questions
  OUT_DIR/DATE/words-new-N.md  the day's NEW glossary entries (deduplicated, all 6 languages), in parts
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
    b2 = ((a.get("levels") or {}).get("B2") or {}).get("paragraphs")
    if a.get("paragraphs") and a["paragraphs"] == b2:
        L.append("\n## top-level paragraphs: same text as level B2 (a fix in B2 also fixes them)")
    elif a.get("paragraphs"):
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


GLOSS_FIELDS = ["base", "pos", "lvl", "en", "zh", "ja", "ko", "es", "hi", "ex", "syn", "ant", "col"]
WORDS_PER_PART = 110


def gloss_key(g):
    return json.dumps([g.get(f) for f in GLOSS_FIELDS], ensure_ascii=False)


def gloss_line(ids, g):
    def j(x):
        return ", ".join(x) if isinstance(x, list) else (x or "")
    return " | ".join([" ".join(ids)] + [j(g.get(f)) for f in GLOSS_FIELDS])


def seen_before(date):
    """Glossary entries (exact, all fields) already published on an earlier day: those were proofread then."""
    old = set()
    for p in glob.glob("articles/*.json"):
        m = re.match(r"(\d{4}-\d{2}-\d{2})", os.path.basename(p))
        if not m or m.group(1) >= date:
            continue
        try:
            for g in (load(p).get("gloss") or {}).values():
                old.add(gloss_key(g))
        except Exception:
            pass
    return old


def new_words_parts(date, arts):
    """One deduplicated list of the day's glossary entries that never appeared before, split into parts."""
    old = seen_before(date)
    entries = {}
    for a in arts:
        for k, g in (a.get("gloss") or {}).items():
            gk = gloss_key(g)
            if gk in old:
                continue
            entries.setdefault(gk, ([], g))[0].append(f"{a['id']}:{k}")
    items = list(entries.values())
    parts = [items[i:i + WORDS_PER_PART] for i in range(0, len(items), WORDS_PER_PART)]
    out = []
    for n, part in enumerate(parts, 1):
        L = [f"# {date} NEW glossary entries, part {n} of {len(parts)}",
             "Only entries that are new today (older identical entries were checked on earlier days).",
             "format: article:key (one or more) | base | pos | lvl | en | zh | ja | ko | es | hi | ex | syn | ant | col",
             "In a report use article = the first article id of the line and where = \"gloss:<key>.<field>\".", ""]
        L += [gloss_line(ids, g) for ids, g in part]
        out.append("\n".join(L) + "\n")
    return out, len(items)


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
        arts = []
        for p in files:
            a = load(p)
            a["id"] = a.get("id") or os.path.basename(p)[:-5]
            arts.append(a)
        idx[2:4] = [f"{len(arts)} articles. Two jobs: (1) TEXT job = read every text file below; (2) WORDS job = read every words part below.",
                    f"Paths are files on the main branch of GitHub repo {REPO} (read them with the GitHub connector); the same files are also at {RAW}/<path after review/>."]
        idx.append("## TEXT job: one file per article (all 5 levels, zh lines, summaries, questions)")
        for a in arts:
            aid = a["id"]
            with open(f"{out}/{date}/{aid}.md", "w", encoding="utf-8") as f:
                f.write(text_pack(a, rq.get(aid)))
            where = f"region {a['region']}" if a.get("region") else "Ireland national"
            idx.append(f"- {aid} ({where}, {a.get('topic')}): {a.get('title')}")
            idx.append(f"  - review/{date}/{aid}.md")
        wp, nw = new_words_parts(date, arts)
        idx.append("")
        idx.append(f"## WORDS job: {nw} new glossary entries today, in {len(wp)} part(s)")
        for n, w in enumerate(wp, 1):
            with open(f"{out}/{date}/words-new-{n}.md", "w", encoding="utf-8") as f:
                f.write(w)
            idx.append(f"- review/{date}/words-new-{n}.md")
        if not wp:
            idx.append("- (none: every glossary entry today was already checked on an earlier day)")
        body = "\n".join(idx) + "\n"
        with open(f"{out}/{date}/index.md", "w", encoding="utf-8") as f:
            f.write(body)
        newest = body
        # one fixed-name file per job for the newest day, so a scheduled ChatGPT run needs a single read
        head = (f"# BinBin {{job}} — {date}\n"
                f"date: {date} | {len(arts)} articles | read this WHOLE file, it is the complete job for today\n\n")
        today_text = head.format(job="TEXT proofreading") + "\n\n".join(
            text_pack(a, rq.get(a["id"])) for a in arts)
        today_words = head.format(job=f"WORDS proofreading ({nw} new entries)") + (
            "".join(w.split("\n", 1)[1] if n == 0 else w.split("\n", 5)[5] for n, w in enumerate(wp))
            if wp else "(none: every glossary entry today was already checked on an earlier day)\n")
    if newest:
        with open(f"{out}/latest.md", "w", encoding="utf-8") as f:
            f.write(newest)
        with open(f"{out}/today-text.md", "w", encoding="utf-8") as f:
            f.write(today_text)
        with open(f"{out}/today-words.md", "w", encoding="utf-8") as f:
            f.write(today_words)


if __name__ == "__main__":
    main()
