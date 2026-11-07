/* 廣場 · Plaza: who the game shows standing in the town square.
 *
 * Every player's leaderboard/{uid} doc carries their look and an updatedAt that the game refreshes at least once a day
 * they play. Every 15 minutes (from the newsPush schedule, so no extra Cloud Scheduler job) we take the most recently
 * active players who have a look and write one public doc, plaza/now {rows, at}. Each player opening the plaza then
 * costs a single read, however many players there are.
 */
export const PLAZA_SCAN = 40, PLAZA_SHOW = 16;

export function pickPlaza(docs, show = PLAZA_SHOW) {
  const rows = [];
  for (const d of docs) {
    const x = d.data ? d.data() : d;
    if (!x || typeof x.look !== "string" || !x.look || !x.name) continue;
    rows.push({ id: d.id, name: String(x.name).slice(0, 16), look: x.look.slice(0, 100), lv: x.lv | 0, power: x.power | 0,
      conq: x.conq | 0, flag: typeof x.flag === "string" ? x.flag.slice(0, 2) : "", at: String(x.updatedAt || "") });
    if (rows.length >= show) break;
  }
  return rows;
}

// same week id as the game: ISO week, e.g. "2026-W45"
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)), w = Math.ceil(((t - y0) / 864e5 + 1) / 7);
  return t.getUTCFullYear() + "-W" + String(w).padStart(2, "0");
}

export async function runPlaza(db, now = new Date()) {
  const [recent, best, liked] = await Promise.all([
    db.collection("leaderboard").orderBy("updatedAt", "desc").limit(PLAZA_SCAN).get(),
    db.collection("leaderboard").orderBy("power", "desc").limit(3).get(),
    db.collection("likeWeeks").doc(isoWeek(new Date(now.getTime() - 7 * 864e5))).collection("u").orderBy("n", "desc").limit(1).get(),
  ]);
  const rows = pickPlaza(recent.docs), top = pickPlaza(best.docs, 3);
  const s = liked.docs[0], star = s && (s.data().n | 0) > 0 ? { id: s.id, name: String(s.data().name || "").slice(0, 16), n: s.data().n | 0 } : null;
  await db.doc("plaza/now").set({ rows, top, star, at: Date.now() });
  return rows.length;
}
