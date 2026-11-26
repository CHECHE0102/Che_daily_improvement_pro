/* BinBin daily — delete a player's account and data (GDPR "right to erasure").
 *
 * The game calls deleteAccount (POST, Authorization: Bearer <Firebase ID token>).
 * The server removes everything tied to that uid with admin rights, so nothing is left behind because a
 * client-side security rule refused a delete. The Google sign-in itself is deleted LAST and only when every
 * step worked; otherwise the player keeps the account and can simply press the button again (each step is
 * safe to repeat).
 *
 * Kept on purpose:
 *  - purchases/{id}: payment records the tax rules require (no names in them; the privacy policy says so).
 *  - act/{deviceId}, push/{id}: tied to a device, not to the account (the game clears the current device itself).
 *  - wellCarry/*, stats/regions: totals only, no person in them.
 * Shared records that also belong to someone else (a gift you sent, a friend you invited, a winners list)
 * are kept for the other player but your uid and nickname are removed from them.
 */
import { FieldPath, FieldValue } from "firebase-admin/firestore";

const RTDB_URL = "https://che-daily-improvement-pro-default-rtdb.europe-west1.firebasedatabase.app";
const PLAZA_ZONES = ["fountain", "gate", "pond", "band", "lawn"], PLAZA_CHANNELS = 50;
const GONE = "";   // what a removed nickname becomes in records other players keep

// delete every doc a query returns, in batches of up to 400
async function delQuery(db, q) {
  let n = 0;
  for (;;) {
    const snap = await q.limit(400).get();
    if (snap.empty) return n;
    const b = db.batch(); snap.docs.forEach(d => b.delete(d.ref)); await b.commit();
    n += snap.size; if (snap.size < 400) return n;
  }
}
// update every doc a query returns (the update must make the doc stop matching, or it would loop)
async function updQuery(db, q, data) {
  const snap = await q.get(); if (snap.empty) return 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const b = db.batch(); snap.docs.slice(i, i + 400).forEach(d => b.update(d.ref, data)); await b.commit();
  }
  return snap.size;
}
// periodic boards stored as <top>/{period}/<sub>/{uid}: remove this uid from every period
async function delPerPeriod(db, top, sub, uid) {
  const periods = await db.collection(top).listDocuments();
  for (let i = 0; i < periods.length; i += 400) {
    const b = db.batch(); periods.slice(i, i + 400).forEach(p => b.delete(p.collection(sub).doc(uid))); await b.commit();
  }
  return periods.length;
}

export async function eraseUser(db, uid, { rtdb = null, log = () => {} } = {}) {
  if (!uid || typeof uid !== "string") throw new Error("uid");
  const col = n => db.collection(n);
  const steps = [
    // own documents (recursiveDelete also removes users/{uid}/words/*)
    ["users", () => db.recursiveDelete(col("users").doc(uid))],
    ["own docs", async () => { const b = db.batch();
      for (const c of ["leaderboard", "allies", "referrals", "memberReq", "members", "supporters", "cheat", "banned", "cvUse"]) b.delete(col(c).doc(uid));
      await b.commit(); }],
    ["nicks", () => delQuery(db, col("nicks").where("uid", "==", uid))],
    ["inviteCodes", () => delQuery(db, col("inviteCodes").where("uid", "==", uid))],
    // every month / week of every board, not only the recent ones
    ["readMonths", () => delPerPeriod(db, "readMonths", "u", uid)],
    ["ieltsMonths", () => delPerPeriod(db, "ieltsMonths", "scores", uid)],
    ["ieltsWeeks", () => delPerPeriod(db, "ieltsWeeks", "scores", uid)],
    ["toeicMonths", () => delPerPeriod(db, "toeicMonths", "scores", uid)],
    ["likeWeeks", () => delPerPeriod(db, "likeWeeks", "u", uid)],
    ["likeGiven", async () => { await delQuery(db, col("likeGiven").where("from", "==", uid)); await delQuery(db, col("likeGiven").where("to", "==", uid)); }],
    // wishing well: own entries and prizes; the public winners list keeps the gold amounts but not who it was
    ["well", () => delQuery(db, col("well").where("uid", "==", uid))],
    ["wellWin", () => delQuery(db, col("wellWin").where("uid", "==", uid))],
    ["wellSum", async () => { for (const d of await col("wellSum").listDocuments())
      await d.update(new FieldPath("e", uid), FieldValue.delete()).catch(e => { if (e && e.code !== 5) throw e; }); }],   // 5 = no such month
    // closed-beta list: the number is the player's own; the spot itself stays taken (n is not lowered)
    ["beta", () => col("beta").doc("list").update(new FieldPath("e", uid), FieldValue.delete()).catch(e => { if (e && e.code !== 5) throw e; })],
    ["wellDraw", async () => { const snap = await col("wellDraw").get();
      for (const d of snap.docs) { const w = d.data().winners;
        if (Array.isArray(w) && w.some(x => x && x.uid === uid)) await d.ref.update({ winners: w.map(x => x && x.uid === uid ? { ...x, uid: GONE, nick: GONE } : x) }); } }],
    // gifts: ones sent to you go; ones you sent stay with the other player, without your name
    ["gifts to", () => delQuery(db, col("gifts").where("to", "==", uid))],
    ["gifts from", () => updQuery(db, col("gifts").where("from", "==", uid), { from: GONE, fromName: GONE })],
    // friends you invited keep their progress, without the link back to you
    ["referrals by", () => updQuery(db, col("referrals").where("by", "==", uid), { by: GONE, code: GONE })],
    // other players' ally docs that point at you
    ["allies bond", () => updQuery(db, col("allies").where("bond.with", "==", uid), { bond: FieldValue.delete() })],
    ["allies req", () => updQuery(db, col("allies").where("req.from", "==", uid), { req: FieldValue.delete() })],
    // multiplayer rooms you were in
    ["rooms host", () => delQuery(db, col("rooms").where("host", "==", uid))],
    ["rooms guest", () => delQuery(db, col("rooms").where("guest", "==", uid))],
    ["parties", async () => { const snap = await col("parties").where(new FieldPath("players", uid), "!=", null).get();
      for (const d of snap.docs) await db.recursiveDelete(d.ref); }],
    // piano high scores: keep the score, drop the name
    ["pianoTop", async () => { const snap = await col("pianoTop").get();
      for (const d of snap.docs) { const x = d.data(), up = {};
        if (x.a_u === uid) Object.assign(up, { a_u: GONE, a_n: GONE });
        if (x.m_u === uid) Object.assign(up, { m_u: GONE, m_n: GONE });
        if (Object.keys(up).length) await d.ref.update(up); } }],
    // news emoji: your reaction on each article goes and its count is lowered by one (safe to repeat: no doc, no change)
    ["newsReact", async () => { const arts = await col("newsReact").listDocuments();
      for (let i = 0; i < arts.length; i += 100) {
        const mine = await db.getAll(...arts.slice(i, i + 100).map(a => a.collection("u").doc(uid)));
        for (const d of mine) if (d.exists) await db.runTransaction(async tx => { const s = await tx.get(d.ref); if (!s.exists) return;
          const k = s.data().e, top = d.ref.parent.parent;
          if (typeof k === "string" && /^[a-z]{2,5}$/.test(k)) { const t = await tx.get(top); const v = t.exists ? (+t.data()[k] || 0) : 0; if (v > 1) tx.update(top, { [k]: FieldValue.increment(-1) }); else if (t.exists) tx.update(top, { [k]: FieldValue.delete() }); }
          tx.delete(d.ref); });
      } }],
    // messages you sent us and error reports from your account
    ["feedback", () => delQuery(db, col("feedback").where("uid", "==", uid))],
    ["inbox", () => db.recursiveDelete(col("inbox").doc(uid))],   // our replies to the player's feedback
    ["errors", () => delQuery(db, col("errors").where("uid", "==", uid))],
  ];
  if (rtdb) steps.push(["realtime", async () => {
    const up = { [`banned/${uid}`]: null };
    for (const z of PLAZA_ZONES) for (let c = 1; c <= PLAZA_CHANNELS; c++) up[`plaza/${z}-${c}/${uid}`] = null;
    await rtdb.ref().update(up);
  }]);

  const failed = [];
  for (const [name, fn] of steps) {
    try { await fn(); } catch (e) { failed.push(name); log(name, e && (e.code || e.message)); }
  }
  // the player's own data must be gone before the sign-in is deleted; a leftover name in someone else's record
  // must not keep the player locked into an account they asked to delete (it is written down and finished later)
  const blocking = failed.filter(n => CORE.has(n));
  return { failed, blocking };
}
const CORE = new Set(["users", "own docs", "nicks", "inviteCodes", "readMonths", "ieltsMonths", "ieltsWeeks", "toeicMonths",
  "likeWeeks", "likeGiven", "well", "wellWin", "wellSum", "gifts to", "feedback", "inbox", "newsReact"]);

export { RTDB_URL };

// Keep only what the privacy policy promises: error reports 90 days, feedback 2 years (runs once a day).
// errors.at is a number (ms); feedback.at is an ISO date string.
export async function runCleanup(db, now = Date.now()) {
  const errCut = now - 90 * 864e5, fbCut = new Date(now - 730 * 864e5).toISOString();
  const errors = await delQuery(db, db.collection("errors").where("at", "<", errCut));
  const feedback = await delQuery(db, db.collection("feedback").where("at", "<", fbCut));
  return { errors, feedback };
}
