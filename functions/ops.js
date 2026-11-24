/* BinBin daily — developer tools that run on the server.
 *
 *  runStats      the numbers for the developer panel (players, games, retention, new-player funnel), worked out here
 *                once instead of every phone downloading every player. Saved to stats/summary (admin-only).
 *  runErrWatch   every 15 minutes: new error reports from players → a push notification to the developer's phone
 *                (adminPush/{id}, written only by the admin), so a broken update is noticed the same day.
 */
import { sendPush, vapidKey } from "./push.js";

const DAY = 864e5;
const ymd = d => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pct = (a, b) => (b ? { n: a, of: b } : null);

export function retention(A, t) {
  const act = (a, d) => !!(a.d && a.d[d]);
  const ret = n => { const c = A.filter(a => a.f && a.f <= addDays(t, -n)); return pct(c.filter(a => act(a, addDays(a.f, n))).length, c.length); };
  const backC = A.filter(a => a.f && a.f < t);
  const kinds = L => { const c = {}; L.forEach(a => { const k = a.k || "?"; c[k] = (c[k] || 0) + 1; }); return c; };
  // new-player funnel: devices whose first day was in the last 30 days (today's newcomers have not had a chance to come back yet)
  const coh = A.filter(a => a.f && a.f > addDays(t, -31) && a.f < t);
  const funnel = [
    ["open", coh.length],
    ["intro", coh.filter(a => (a.o || 0) >= 4).length],
    ["read", coh.filter(a => a.r).length],
    ["quiz", coh.filter(a => a.q).length],
    ["signin", coh.filter(a => a.u).length],
    ["back", coh.filter(a => Object.keys(a.d || {}).some(d => d > a.f)).length],
    ["d7", coh.filter(a => Object.keys(a.d || {}).some(d => d >= addDays(a.f, 7))).length],
  ];
  // where new players stop during the intro (o = last intro page reached)
  const introStop = {}; coh.forEach(a => { const o = Math.min(4, a.o || 0); introStop[o] = (introStop[o] || 0) + 1; });
  return {
    devices: A.length, newToday: A.filter(a => a.f === t).length, dau: A.filter(a => act(a, t)).length,
    wau: A.filter(a => Object.keys(a.d || {}).some(d => d > addDays(t, -7))).length,
    d1: ret(1), d7: ret(7), d30: ret(30),
    back: pct(backC.filter(a => Object.keys(a.d || {}).some(d => d > a.f)).length, backC.length),
    intro: A.filter(a => (a.o || 0) >= 4).length, read: A.filter(a => a.r).length,
    kindsNew: kinds(A.filter(a => a.f === t)), kindsAll: kinds(A),
    once: A.filter(a => Object.keys(a.d || {}).length <= 1 && !(a.o > 0) && !a.r && a.f < t).length,
    funnel, introStop,
  };
}

export async function runStats(db, now = new Date()) {
  const t = ymd(now), since = n => addDays(t, -n), day = s => String(s || "").slice(0, 10);
  const us = await db.collection("users").get();
  const users = us.docs.map(d => ({ id: d.id, ...d.data() }));
  let words = null; try { words = (await db.collectionGroup("words").count().get()).data().count; } catch (e) {}
  let lbN = null; try { lbN = (await db.collection("leaderboard").count().get()).data().count; } catch (e) {}
  const lv = users.map(u => (u.game && u.game.lv) || 1);
  const days = u => Object.values(u.days || {});
  const sum = {
    users: users.length,
    today: users.filter(u => day(u.updatedAt) === t).length,
    week: users.filter(u => day(u.updatedAt) >= since(6)).length,
    avgLv: users.length ? +(lv.reduce((a, b) => a + b, 0) / users.length).toFixed(1) : 0,
    words, lbN,
    daysPlayed: users.reduce((a, u) => a + Object.keys(u.days || {}).length, 0),
    quizzes: users.reduce((a, u) => a + days(u).reduce((b, d) => b + (d && d.preDone ? 1 : 0) + (d && d.postDone ? 1 : 0) + Object.keys((d && d.postBy) || {}).length, 0), 0),
    conqAll: users.filter(u => u.game && Object.keys(u.game.conq || {}).length >= 23).length,
  };
  // games: per-player counters + finished party / co-op rooms
  const per = {}; const bump = (u, k, n) => { per[k] = per[k] || {}; per[k][u] = Math.max(per[k][u] || 0, n); };
  users.forEach(u => { const g = u.game || {}; for (const [k, n] of Object.entries(g.plays || {})) bump(u.id, k, +n || 0);
    if (g.ielts && g.ielts.days) bump(u.id, "ielts", Object.keys(g.ielts.days).length); if (g.battles) bump(u.id, "battle", +g.battles || 0); });
  let rooms = 0;
  try { const ps = await db.collection("parties").where("state", "==", "done").get(); const c = {};
    ps.forEach(d => { const x = d.data(); for (const u of Object.keys(x.players || {})) { const k = x.game + "|" + u; c[k] = (c[k] || 0) + 1; } });
    for (const [k, n] of Object.entries(c)) { const [g, u] = k.split("|"); bump(u, g, n); } } catch (e) {}
  try { const rs = await db.collection("rooms").get(); const c = {};
    rs.forEach(d => { const x = d.data(); if (x.state !== "done") { if (Date.now() - (x.created || 0) < 3600e3) rooms++; return; } [x.host, x.guest].filter(Boolean).forEach(u => c[u] = (c[u] || 0) + 1); });
    for (const [u, n] of Object.entries(c)) bump(u, "coop", n); } catch (e) {}
  const games = Object.fromEntries(Object.entries(per).map(([k, m]) => [k, { players: Object.keys(m).length, plays: Object.values(m).reduce((a, b) => a + b, 0) }]));
  // the 100 most recently active players for the table (the panel no longer downloads everyone)
  const players = users.slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 100).map(u => { const g = u.game || {};
    return { nick: String(g.nick || "").slice(0, 16), name: String(u.name || "").slice(0, 40), lv: +g.lv || 1, gold: +g.gold || 0, days: Object.keys(u.days || {}).length, conq: Object.keys(g.conq || {}).length, region: String(u.region || "").slice(0, 8), last: day(u.updatedAt) }; });
  const act = (await db.collection("act").get()).docs.map(d => d.data());
  let errors24 = null; try { errors24 = (await db.collection("errors").where("at", ">", now.getTime() - DAY).count().get()).data().count; } catch (e) {}
  const out = { at: now.getTime(), day: t, ...sum, rooms, games, players, ret: act.length ? retention(act, t) : null, errors24 };
  await db.doc("stats/summary").set(out);
  return out;
}

// short label for an error report, so the same bug counts once
const errKey = e => (String(e.msg || "").slice(0, 80) + "|" + String(e.where || "").replace(/:\d+$/, "")).slice(0, 120);

export async function runErrWatch(db, vapidPrivate, log = () => {}, now = Date.now()) {
  const ref = db.doc("stats/errWatch"), st = (await ref.get()).data() || {};
  const last = st.last || now - 15 * 60e3, seen = new Set(st.seen || []);
  const snap = await db.collection("errors").where("at", ">", last).orderBy("at").limit(300).get();
  if (snap.empty) { if (!st.last) await ref.set({ last: now, seen: [...seen] }); return { n: 0 }; }
  const L = snap.docs.map(d => d.data()), fresh = new Map();
  for (const e of L) { const k = errKey(e); if (!seen.has(k) && !fresh.has(k)) fresh.set(k, e); }
  const users = new Set(L.map(e => e.uid || e.ua)).size;
  // tell the developer: a kind of error never seen before, or many errors at once; at most once an hour
  const loud = fresh.size > 0 || L.length >= 20, quiet = now - (st.alertAt || 0) < 3600e3;
  let sent = 0;
  if (loud && !quiet) {
    const first = fresh.size ? [...fresh.values()][0] : L[L.length - 1];
    const msg = { title: "⚠️ BinBin 有新的錯誤", body: `${L.length} 個錯誤（${users} 位玩家）${fresh.size ? `，${fresh.size} 種是新的` : ""}：${String(first.msg || "").slice(0, 80)}（v${first.v || "?"}）`, url: "./?dev=errors", tag: "binbin-errors" };
    const key = vapidKey(String(vapidPrivate).trim());
    for (const d of (await db.collection("adminPush").get()).docs) {
      try { const r = await sendPush(d.data(), msg, key); if (r === 404 || r === 410) await d.ref.delete(); else if (r >= 200 && r < 300) sent++; } catch (e) { log("adminPush", e.message); }
    }
  }
  const seenList = [...seen, ...fresh.keys()].slice(-300);
  await ref.set({ last: L[L.length - 1].at || now, seen: seenList, ...(loud && !quiet ? { alertAt: now } : { alertAt: st.alertAt || 0 }) });
  return { n: L.length, fresh: fresh.size, sent };
}
