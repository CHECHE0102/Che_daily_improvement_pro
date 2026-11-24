/* 許願池 · Wishing Well monthly draw (in-game gold only, never real money).
 *
 * Players toss gold in during a month: well/{YYYY-MM}_{uid} {uid, month, nick, coins, at} (written by the game).
 * On the 1st of each month (Irish time) we draw last month's winners: weighted by gold tossed, no one twice,
 * SPLIT.length winners (fewer if fewer players), and the whole pool is split by SPLIT (rounding leftovers go to 1st).
 * We write, in one transaction:
 *   wellDraw/{month}        {month, total, count, winners:[{uid, nick, gold, rank}], at}   (public result)
 *   wellWin/{month}_{uid}   {uid, month, gold, rank, status:"won", at, expires}            (the winner taps 領獎: status "claimed")
 * Winners must claim within CLAIM_DAYS days (expires, a Timestamp; Firestore rules also block a late claim).
 * Every day runWellExpire marks late wins "expired" and adds their gold to wellCarry/{this Irish month} {month, gold},
 * and the draw adds that carry to the pool, so unclaimed prizes go back into the well. A month nobody tossed into
 * passes its carry on to the next month. The draw runs runWellExpire first, so nothing is missed if a daily run failed.
 * A month that already has a wellDraw doc is never drawn again, so retries are safe.
 */
import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

export const CLAIM_DAYS = 7;

export function irishMonth(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}
export function nextMonth(m) {
  let [y, mo] = m.split("-").map(Number); mo++; if (mo > 12) { mo = 1; y++; }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

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
export function pickWinners(list, split = SPLIT, rand = crypto.randomInt, carry = 0) {
  const pool = list.slice(), k = Math.min(split.length, pool.length), out = [];
  let sum = pool.reduce((a, b) => a + b.coins, 0);
  for (let j = 0; j < k; j++) {
    let r = rand(sum), i = 0;
    while (i < pool.length - 1 && r >= pool[i].coins) { r -= pool[i].coins; i++; }
    out.push(pool[i]); sum -= pool[i].coins; pool.splice(i, 1);
  }
  const total = list.reduce((a, b) => a + b.coins, 0) + carry, gold = shares(total, out.length, split);
  return out.map((w, i) => ({ uid: w.uid, nick: w.nick, gold: gold[i], rank: i + 1 }));
}

// late, unclaimed wins go back into the well: status "won" -> "expired", gold added to this month's carry
export async function runWellExpire(db, now = new Date()) {
  const q = await db.collection("wellWin").where("expires", "<=", now).get();
  const out = [];
  for (const d of q.docs) {
    if (d.data().status !== "won") continue;
    const r = await db.runTransaction(async tx => {
      const sn = await tx.get(d.ref), x = sn.exists ? sn.data() : null;
      if (!x || x.status !== "won" || !x.expires || x.expires.toMillis() > now.getTime()) return null;
      const gold = Math.max(0, Math.floor(Number(x.gold) || 0)), cm = irishMonth(now);
      tx.update(d.ref, { status: "expired", expiredAt: now.toISOString(), carryTo: cm });
      if (gold) tx.set(db.doc(`wellCarry/${cm}`), { month: cm, gold: FieldValue.increment(gold) }, { merge: true });
      return `${d.id}:${gold}->${cm}`;
    });
    if (r) out.push(r);
  }
  return out;
}

export async function runWellDraw(db, month, rand, now = new Date()) {
  const expired = await runWellExpire(db, now);
  const drawRef = db.doc(`wellDraw/${month}`), carryRef = db.doc(`wellCarry/${month}`), nextRef = db.doc(`wellCarry/${nextMonth(month)}`);
  return db.runTransaction(async tx => {
    const done = await tx.get(drawRef);
    if (done.exists) return { month, skipped: true, expired };
    const cs = await tx.get(carryRef), carry = cs.exists ? Math.max(0, Math.floor(Number(cs.data().gold) || 0)) : 0;
    const q = await tx.get(db.collection("well").where("month", "==", month));
    const list = [];
    q.forEach(d => {
      const x = d.data(), c = Math.floor(Number(x.coins) || 0);
      if (x.uid && c > 0 && d.id === `${month}_${x.uid}`) list.push({ uid: String(x.uid), nick: String(x.nick || "").slice(0, 16), coins: c });
    });
    list.sort((a, b) => a.uid.localeCompare(b.uid));
    const total = list.reduce((a, b) => a + b.coins, 0) + carry;
    const winners = list.length ? pickWinners(list, SPLIT, rand, carry) : [];
    const at = now.toISOString(), expires = new Date(now.getTime() + CLAIM_DAYS * 864e5);
    tx.create(drawRef, { month, total, carry, count: list.length, winners, at, expires });
    for (const w of winners) tx.set(db.doc(`wellWin/${month}_${w.uid}`), { uid: w.uid, month, gold: w.gold, rank: w.rank, status: "won", at, expires });
    // nobody tossed in: the carried gold waits for next month
    if (!winners.length && carry) tx.set(nextRef, { month: nextMonth(month), gold: FieldValue.increment(carry) }, { merge: true });
    return { month, total, carry, count: list.length, winners: winners.map(w => `${w.rank}:${w.gold}`), expired };
  });
}
