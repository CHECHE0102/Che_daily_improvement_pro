"""Upload a daily Short with the YouTube Data API (no browser, no file dialog).
python tools/youtube_upload.py social/daily/<date>
Needs repo secrets YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (OAuth, scope youtube.upload, channel @binbin.daily.english).
Reads <dir>/meta.json {title, description, tags, privacy} and uploads <dir>/out/short.mp4; writes <dir>/youtube.json {id,url}."""
import json, os, sys, urllib.parse, urllib.request
d = sys.argv[1]
if os.path.exists(os.path.join(d, "youtube.json")): sys.exit(print("already uploaded", d))
meta = json.load(open(os.path.join(d, "meta.json"), encoding="utf-8"))
tok = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", urllib.parse.urlencode({
    "client_id": os.environ["YT_CLIENT_ID"], "client_secret": os.environ["YT_CLIENT_SECRET"],
    "refresh_token": os.environ["YT_REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()))["access_token"]
video = open(os.path.join(d, "out", "short.mp4"), "rb").read()
body = {"snippet": {"title": meta["title"], "description": meta["description"], "tags": meta.get("tags", []),
                    "categoryId": "27", "defaultLanguage": "zh-Hant", "defaultAudioLanguage": "en"},
        "status": {"privacyStatus": meta.get("privacy", "public"), "selfDeclaredMadeForKids": False}}
r = urllib.request.Request("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    data=json.dumps(body).encode(), method="POST", headers={"Authorization": "Bearer " + tok,
    "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(len(video))})
loc = urllib.request.urlopen(r).headers["Location"]
res = json.load(urllib.request.urlopen(urllib.request.Request(loc, data=video, method="PUT", headers={"Content-Type": "video/mp4"})))
out = {"id": res["id"], "url": "https://youtube.com/shorts/" + res["id"], "privacy": res["status"]["privacyStatus"]}
json.dump(out, open(os.path.join(d, "youtube.json"), "w")); print(out)
