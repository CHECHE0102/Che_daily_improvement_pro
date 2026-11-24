// BinBin daily service worker: push notifications + offline copies.
// - The page itself: network first (so an update shows at once), the last good copy when offline or the network is very slow.
// - Article / quiz JSON from this site: network first, cached copy offline (so stories you already opened still work).
// - Pictures, icons and fonts: served from the cache at once and refreshed in the background.
// Nothing from Firebase or other sites is touched.
const PAGE = "binbin-page", DATA = "binbin-data", ART = "binbin-art";
const MAX = { [DATA]: 250, [ART]: 400 };
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (![PAGE, DATA, ART].includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

async function trim(name) {
  const c = await caches.open(name), keys = await c.keys(), max = MAX[name] || 200;
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}
async function put(name, req, res) {
  if (!res || !res.ok || res.type === "opaque") return;
  try { const c = await caches.open(name); await c.put(req, res); trim(name); } catch (_) {}
}
const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("slow")), ms))]);

async function page(req) {
  const key = new URL("./", self.registration.scope).href;   // one copy of the app, whatever ?query the link had
  const net = fetch(req).then(r => { if (r.ok) put(PAGE, key, r.clone()); return r; });
  try { return await timeout(net, 6000); }
  catch (_) { const hit = await caches.match(key, { cacheName: PAGE }); return hit || net; }
}
async function netFirst(req) {
  const u = new URL(req.url), key = u.origin + u.pathname;   // ?t= cache-busters share one copy
  try { const r = await fetch(req); put(DATA, key, r.clone()); return r; }
  catch (e) { const hit = await caches.match(key, { cacheName: DATA }); if (hit) return hit; throw e; }
}
async function cacheFirst(req) {
  const hit = await caches.match(req, { cacheName: ART });
  const net = fetch(req).then(r => { put(ART, req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET" || req.headers.has("range")) return;
  const u = new URL(req.url), same = u.origin === self.location.origin;
  if (req.mode === "navigate" && same) return e.respondWith(page(req));
  if (same && /\.json$/.test(u.pathname) && !/\/version\.json$/.test(u.pathname)) return e.respondWith(netFirst(req));
  if ((same && /\.(png|jpe?g|webp|svg|gif|ico|woff2?)$/.test(u.pathname)) || u.host === "fonts.gstatic.com" || u.host === "fonts.googleapis.com") return e.respondWith(cacheFirst(req));
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "BinBin daily", {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || "news",
    data: { url: d.url || "./" },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope) && "focus" in w) return w.focus();
    return self.clients.openWindow(url);
  }));
});
