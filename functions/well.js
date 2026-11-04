/* 許願池 · Wishing Well monthly draw (in-game gold only, never real money).
 *
 * Players toss gold in during a month: well/{YYYY-MM}_{uid} {uid, month, nick, coins, at} (written by the game).
 * On the 1st of each month (Irish time) we draw last month's winners: weighted by gold tossed, no one twice,
 * SPLIT.length winners (fewer if fewer players), and the whole pool is split by SPLIT (rounding leftovers go to 1st).
 * We write, in one transaction:
 *   wellDraw/{month}        {month, total, count, winners:[{uid, nick, gold, rank}], at}   (public result)
 *   wellWin/{month}_{uid}   {uid, month, gold, rank, status:"won", at}                     (the game sets status "claimed" once)
 * A month that already has a wellDraw doc is never drawn again, so retries are safe.
 */
import crypto from "node:crypto";

export const SPLIT = [50, 30, 20];

export function prevMonth(now = new Date()) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit" }).format(now); // "2026-11"
  let [y, m] = d.split("-").map(Number);
  m--; if (!m) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function shares(total, k, split = SPLIT) {
  const p = split.slice(0, k), sp = p.reduce((a, b) => a + b, 0) || 1;
  const out = p.map(x => Math.floor(total * x / sp));
  if (out.length) out[0] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

// weighted draw without repeats; rand(n) returns a whole number in [0, n)
export function pickWinners(list, split = SPLIT, rand = crypto.randomInt) {
  const pool = list.slice(), k = Math.min(split.length, pool.length), out = [];
  let sum = pool.reduce((a, b) => a + b.coins, 0);
  for (let j = 0; j < k; j++) {
    let r = rand(sum), i = 0;
    while (i < pool.length - 1 && r >= pool[i].coins) { r -= pool[i].coins; i++; }
    out.push(pool[i]); sum -= pool[i].coins; pool.splice(i, 1);
  }
  const total = list.reduce((a, b) => a + b.coins, 0), gold = shares(total, out.length, split);
  return out.map((w, i) => ({ uid: w.uid, nick: w.nick, gold: gold[i], rank: i + 1 }));
}

export async function runWellDraw(db, month, rand) {
  const drawRef = db.doc(`wellDraw/${month}`);
  return db.runTransaction(async tx => {
    const done = await tx.get(drawRef);
    if (done.exists) return { month, skipped: true };
    const q = await tx.get(db.collection("well").where("month", "==", month));
    const list = [];
    q.forEach(d => {
      const x = d.data(), c = Math.floor(Number(x.coins) || 0);
      if (x.uid && c > 0 && d.id === `${month}_${x.uid}`) list.push({ uid: String(x.uid), nick: String(x.nick || "").slice(0, 16), coins: c });
    });
    list.sort((a, b) => a.uid.localeCompare(b.uid));
    const total = list.reduce((a, b) => a + b.coins, 0);
    const winners = list.length ? pickWinners(list, SPLIT, rand) : [];
    const at = new Date().toISOString();
    tx.create(drawRef, { month, total, count: list.length, winners, at });
    for (const w of winners) tx.set(db.doc(`wellWin/${month}_${w.uid}`), { uid: w.uid, month, gold: w.gold, rank: w.rank, status: "won", at });
    return { month, total, count: list.length, winners: winners.map(w => `${w.rank}:${w.gold}`) };
  });
}
