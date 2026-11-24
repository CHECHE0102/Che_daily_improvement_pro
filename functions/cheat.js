/* 防作弊 · daily cheat scan (runs from the wellExpire schedule, so no extra Cloud Scheduler job).
 *
 * Players keep their own save (users/{uid}.game) and Firestore rules can't check game maths, so someone who edits
 * requests by hand can give themselves gold or levels. Once a day we compare every save with yesterday's numbers and
 * the public boards with the save, and write what looks impossible to cheat/{uid} (only the admin can read it).
 * The admin then looks in Settings → dev panel → 防作弊 and either bans (banned/{uid}: the rules stop that player
 * writing to every public board and the plaza) or ignores. Nothing is banned automatically.
 *
 *   cheat/_snap  {d: {uid: [gold, lv]}, at}      yesterday's numbers
 *   cheat/{uid}  {uid, nick, flags: [{k, msg, at}], n, status: "new"|"ok"|"banned", at}
 */
export const LIMITS = {
  goldDay: 3000,  // more gold than this in one day (claimed well prizes are added to the allowance)
  lvDay: 8,       // more levels than this in one day
  lbLvSlack: 1,   // leaderboard level higher than the save's level by more than this
};

// yesterday [gold, lv], today {gold, lv}, extra allowed gold → list of {k, msg}
export function judge(prev, cur, allow = 0, lb = null, L = LIMITS) {
  const out = [];
  if (prev) {
    const dg = cur.gold - prev[0], dl = cur.lv - prev[1];
    if (dg > L.goldDay + allow) out.push({ k: "gold", msg: `一天多了 ${dg} 金幣（${prev[0]} → ${cur.gold}）` });
    if (dl > L.lvDay) out.push({ k: "lv", msg: `一天升了 ${dl} 級（${prev[1]} → ${cur.lv}）` });
  }
  if (!Number.isFinite(cur.gold) || cur.gold < 0) out.push({ k: "goldBad", msg: `金幣數字不正常：${cur.gold}` });
  if (lb && (lb.lv | 0) > cur.lv + L.lbLvSlack) out.push({ k: "lb", msg: `排行榜寫 Lv ${lb.lv}，存檔只有 Lv ${cur.lv}` });
  return out;
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : 0; };

export async function runCheatScan(db, now = new Date()) {
  const dayAgo = new Date(now.getTime() - 864e5).toISOString();
  const [users, lbs, snapDoc, wins] = await Promise.all([
    db.collection("users").select("game.gold", "game.lv", "game.nick").get(),
    db.collection("leaderboard").select("lv").get(),
    db.doc("cheat/_snap").get(),
    db.collection("wellWin").where("status", "==", "claimed").get(),
  ]);
  const prev = (snapDoc.exists && snapDoc.data().d) || {};
  const lb = new Map(lbs.docs.map(d => [d.id, d.data()]));
  // legit big gold: well prizes claimed in the last day (gifts carry gems/shards/charms, never gold)
  const allow = new Map();
  const add = (u, g) => allow.set(u, (allow.get(u) || 0) + Math.max(0, num(g)));
  for (const d of wins.docs) { const x = d.data(); if (String(x.claimedAt || x.at || "") >= dayAgo) add(x.uid, x.gold); }

  const next = {}, flagged = [];
  for (const d of users.docs) {
    const g = d.get("game") || {};
    const cur = { gold: Number(g.gold ?? 0), lv: num(g.lv) || 1 };
    next[d.id] = [num(cur.gold), cur.lv];
    const f = judge(prev[d.id], cur, allow.get(d.id) || 0, lb.get(d.id));
    if (f.length) flagged.push({ uid: d.id, nick: String(g.nick || "").slice(0, 16), f });
  }
  const at = now.toISOString();
  for (const x of flagged) {
    const ref = db.doc(`cheat/${x.uid}`);
    await db.runTransaction(async tx => {
      const s = await tx.get(ref), o = s.exists ? s.data() : {};
      const flags = [...(o.flags || []), ...x.f.map(f => ({ ...f, at }))].slice(-20);
      // a player already banned stays banned; one the admin cleared ("ok") is shown again because something new happened
      tx.set(ref, { uid: x.uid, nick: x.nick, flags, n: (o.n || 0) + x.f.length, status: o.status === "banned" ? "banned" : "new", at });
    });
  }
  await db.doc("cheat/_snap").set({ d: next, at });
  return { users: users.size, flagged: flagged.length };
}
