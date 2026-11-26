#!/usr/bin/env python3
"""Upload a video to the BinBin YouTube channel with the YouTube Data API (no browser).

python tools/youtube_upload.py <video.mp4> <meta.json>
meta.json: {"title", "description", "tags": [...], "privacy": "private|unlisted|public",
            "publishAt": optional RFC3339 time (needs privacy private), "lang": "zh-Hant"}
Env (GitHub secrets): YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (scope youtube.upload).
Prints and writes <video>.youtube.json {id, url, privacy}.
Note: until the API project passes Google's audit, YouTube forces uploads to private.
"""
import json, os, sys, urllib.parse, urllib.request

video_path, meta_path = sys.argv[1], sys.argv[2]
meta = json.load(open(meta_path, encoding="utf-8"))
tok = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", urllib.parse.urlencode({
    "client_id": os.environ["YT_CLIENT_ID"], "client_secret": os.environ["YT_CLIENT_SECRET"],
    "refresh_token": os.environ["YT_REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()))["access_token"]
video = open(video_path, "rb").read()
status = {"privacyStatus": meta.get("privacy", "public"), "selfDeclaredMadeForKids": False}
if meta.get("publishAt"):
    status.update(privacyStatus="private", publishAt=meta["publishAt"])
body = {"snippet": {"title": meta["title"][:100], "description": meta.get("description", ""),
                    "tags": meta.get("tags", []), "categoryId": "27",
                    "defaultLanguage": meta.get("lang", "zh-Hant"), "defaultAudioLanguage": "en"},
        "status": status}
req = urllib.request.Request(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    data=json.dumps(body).encode(), method="POST",
    headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json; charset=UTF-8",
             "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(len(video))})
try:
    loc = urllib.request.urlopen(req).headers["Location"]
    res = json.load(urllib.request.urlopen(urllib.request.Request(loc, data=video, method="PUT",
                                                                  headers={"Content-Type": "video/mp4"})))
except urllib.error.HTTPError as e:
    sys.exit(f"YouTube upload failed {e.code}: {e.read().decode(errors='replace')[:800]}")
out = {"id": res["id"], "url": "https://youtube.com/shorts/" + res["id"], "privacy": res["status"]["privacyStatus"]}
json.dump(out, open(video_path + ".youtube.json", "w"))
print(json.dumps(out))
