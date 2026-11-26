#!/usr/bin/env python3
"""Post BinBin's scheduled social content to the Facebook Page and Instagram via the Meta Graph API.

Data lives on the `social` branch (checked out to SOCIAL_DIR):
  schedule.json  list of items, each:
      {"id": "P11", "when": "2026-11-26 08:00",          # Europe/Dublin local time
       "type": "post" | "reel" | "story",
       "to": ["fb", "ig"],                                  # where to publish
       "media": ["posts/P11/1.jpg", "posts/P11/2.jpg"],     # paths on the social branch
       "caption": "..."}
  posted.json    {"P11:fb": {"at": "...", "id": "..."}, ...}  written back by the workflow

Media is passed to Meta as public raw.githubusercontent.com URLs of the social branch
(Instagram only accepts media by URL). The branch only holds media for the next few days:
once an item is posted everywhere its files are deleted here, and the workflow squashes the
branch to a single commit so old media does not stay in git history.

Env: META_TOKEN (system-user or page token, GitHub secret), FB_PAGE_ID, IG_USER_ID,
     SOCIAL_DIR, MEDIA_BASE (raw URL prefix), ONLY (optional item id to post now), DRY_RUN=1.
"""
import json, os, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime
from zoneinfo import ZoneInfo

GRAPH = "https://graph.facebook.com/v23.0"
DUBLIN = ZoneInfo("Europe/Dublin")
SOCIAL_DIR = os.environ.get("SOCIAL_DIR", "social")
MEDIA_BASE = os.environ.get("MEDIA_BASE", "").rstrip("/")
PAGE_ID = os.environ.get("FB_PAGE_ID", "")
IG_ID = os.environ.get("IG_USER_ID", "")
DRY = os.environ.get("DRY_RUN") == "1"
ONLY = os.environ.get("ONLY", "").strip()
MAX_LATE_H = float(os.environ.get("MAX_LATE_HOURS", "20"))  # skip items this late (e.g. Action was off for days)


class GraphError(Exception):
    pass


def call(method, path, params=None, url=None, headers=None):
    params = {k: (json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in (params or {}).items()}
    target = url or f"{GRAPH}/{path}"
    data = None
    if method == "GET":
        target += "?" + urllib.parse.urlencode(params)
    else:
        data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(target, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise GraphError(f"{method} {path or url} -> {e.code}: {body[:600]}") from None


def media_url(p):
    return f"{MEDIA_BASE}/{urllib.parse.quote(p)}"


def is_video(p):
    return p.lower().endswith((".mp4", ".mov"))


# ---------- Facebook ----------
def page_token(token):
    """A system-user token must be swapped for the Page's own token; a page token works as is."""
    try:
        r = call("GET", PAGE_ID, {"fields": "access_token", "access_token": token})
        return r.get("access_token") or token
    except GraphError:
        return token


def fb_post(tok, item):
    photos = [p for p in item["media"] if not is_video(p)]
    ids = []
    for p in photos:
        r = call("POST", f"{PAGE_ID}/photos", {"url": media_url(p), "published": "false", "access_token": tok})
        ids.append(r["id"])
    params = {"message": item.get("caption", ""), "access_token": tok}
    if ids:
        params["attached_media"] = [{"media_fbid": i} for i in ids]
    return call("POST", f"{PAGE_ID}/feed", params)["id"]


def fb_upload_video(tok, edge, p, finish):
    start = call("POST", f"{PAGE_ID}/{edge}", {"upload_phase": "start", "access_token": tok})
    vid = start["video_id"]
    up = start.get("upload_url") or f"https://rupload.facebook.com/video-upload/v23.0/{vid}"
    call("POST", None, url=up, headers={"Authorization": f"OAuth {tok}", "file_url": media_url(p)})
    params = {"upload_phase": "finish", "video_id": vid, "access_token": tok}
    params.update(finish)
    call("POST", f"{PAGE_ID}/{edge}", params)
    return vid


def fb_reel(tok, item):
    return fb_upload_video(tok, "video_reels", item["media"][0],
                           {"video_state": "PUBLISHED", "description": item.get("caption", "")})


def fb_story(tok, item):
    p = item["media"][0]
    if is_video(p):
        return fb_upload_video(tok, "video_stories", p, {})
    photo = call("POST", f"{PAGE_ID}/photos", {"url": media_url(p), "published": "false", "access_token": tok})
    return call("POST", f"{PAGE_ID}/photo_stories", {"photo_id": photo["id"], "access_token": tok}).get("post_id", photo["id"])


# ---------- Instagram ----------
def ig_wait(tok, cid, minutes=10):
    for _ in range(minutes * 6):
        st = call("GET", cid, {"fields": "status_code,status", "access_token": tok})
        code = st.get("status_code")
        if code == "FINISHED":
            return
        if code in ("ERROR", "EXPIRED"):
            raise GraphError(f"Instagram container {cid} {code}: {st.get('status')}")
        time.sleep(10)
    raise GraphError(f"Instagram container {cid} not ready after {minutes} min")


def ig_container(tok, p, extra):
    params = {"access_token": tok, **extra}
    params["video_url" if is_video(p) else "image_url"] = media_url(p)
    return call("POST", f"{IG_ID}/media", params)["id"]


def ig_publish(tok, cid):
    ig_wait(tok, cid)
    return call("POST", f"{IG_ID}/media_publish", {"creation_id": cid, "access_token": tok})["id"]


def ig_post(tok, item):
    media, cap = item["media"], item.get("caption", "")
    if len(media) == 1:
        extra = {"caption": cap}
        if is_video(media[0]):
            extra["media_type"] = "REELS"
        return ig_publish(tok, ig_container(tok, media[0], extra))
    kids = []
    for p in media[:10]:
        extra = {"is_carousel_item": "true"}
        if is_video(p):
            extra["media_type"] = "VIDEO"
        kid = ig_container(tok, p, extra)
        ig_wait(tok, kid)
        kids.append(kid)
    cid = call("POST", f"{IG_ID}/media", {"media_type": "CAROUSEL", "children": ",".join(kids),
                                           "caption": cap, "access_token": tok})["id"]
    return ig_publish(tok, cid)


def ig_reel(tok, item):
    return ig_publish(tok, ig_container(tok, item["media"][0], {"media_type": "REELS", "caption": item.get("caption", "")}))


def ig_story(tok, item):
    return ig_publish(tok, ig_container(tok, item["media"][0], {"media_type": "STORIES"}))


DO = {("fb", "post"): fb_post, ("fb", "reel"): fb_reel, ("fb", "story"): fb_story,
      ("ig", "post"): ig_post, ("ig", "reel"): ig_reel, ("ig", "story"): ig_story}


def main():
    sched = json.load(open(os.path.join(SOCIAL_DIR, "schedule.json"), encoding="utf-8"))
    posted_path = os.path.join(SOCIAL_DIR, "posted.json")
    posted = json.load(open(posted_path, encoding="utf-8")) if os.path.exists(posted_path) else {}
    now = datetime.now(DUBLIN)
    due = []
    for it in sched:
        when = datetime.strptime(it["when"], "%Y-%m-%d %H:%M").replace(tzinfo=DUBLIN)
        if ONLY:
            if it["id"] != ONLY:
                continue
        elif when > now or (now - when).total_seconds() > MAX_LATE_H * 3600:
            continue
        for dest in it.get("to", ["fb", "ig"]):
            if f"{it['id']}:{dest}" not in posted:
                due.append((it, dest))
    if not due:
        print("Nothing due at", now.strftime("%Y-%m-%d %H:%M"), "Dublin")
        return 0
    if DRY:
        for it, dest in due:
            print("[dry run] would post", it["id"], it["type"], "to", dest, [media_url(p) for p in it["media"]])
        return 0
    missing = {p for it, _ in due for p in it["media"] if not os.path.exists(os.path.join(SOCIAL_DIR, p))}
    if missing:
        print("::warning::media not uploaded yet:", ", ".join(sorted(missing)))
    due = [(it, d) for it, d in due if not any(p in missing for p in it["media"])]
    if not due:
        return 1 if missing else 0
    token = os.environ["META_TOKEN"]
    ptok = page_token(token)
    failed = 0
    for it, dest in due:
        key = f"{it['id']}:{dest}"
        try:
            pid = DO[(dest, it["type"])](ptok if dest == "fb" else token, it)
            posted[key] = {"at": datetime.now(DUBLIN).isoformat(timespec="minutes"), "id": str(pid)}
            print("posted", key, pid)
        except Exception as e:  # keep going with the rest; the item is retried next run
            failed += 1
            print(f"::error::{key} failed: {e}")
        with open(posted_path, "w", encoding="utf-8") as f:
            json.dump(posted, f, ensure_ascii=False, indent=1, sort_keys=True)
    prune(sched, posted)
    return 1 if failed or missing else 0


def prune(sched, posted):
    """Delete media of items already posted to every destination (CheChe: delete after upload)."""
    for it in sched:
        if all(f"{it['id']}:{d}" in posted for d in it.get("to", ["fb", "ig"])):
            for p in it["media"]:
                fp = os.path.join(SOCIAL_DIR, p)
                if os.path.exists(fp):
                    os.remove(fp)
                    print("deleted", p)


if __name__ == "__main__":
    sys.exit(main())
