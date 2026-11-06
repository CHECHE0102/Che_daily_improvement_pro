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

export async function runPlaza(db) {
  const snap = await db.collection("leaderboard").orderBy("updatedAt", "desc").limit(PLAZA_SCAN).get();
  const rows = pickPlaza(snap.docs);
  await db.doc("plaza/now").set({ rows, at: Date.now() });
  return rows.length;
}
