// One-off read-only check: is any trace of a deleted nickname left in Auth or Firestore?
// Prints counts and collection names only (the Actions log is public), never emails or uids.
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
const NAME = (process.env.CHECK_NAME || "").toLowerCase();
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA)) });
const auth = getAuth(), db = getFirestore();
const hit = v => typeof v === "string" ? v.toLowerCase() === NAME : v && typeof v === "object" ? Object.values(v).some(hit) : false;
let users = [], tok;
do { const r = await auth.listUsers(1000, tok); users.push(...r.users); tok = r.pageToken; } while (tok);
console.log("Auth users:", users.length, "| with this name as displayName:", users.filter(u => (u.displayName || "").toLowerCase() === NAME).length);
const uids = new Set(users.map(u => u.uid));
const found = {}; let docs = 0, orphanUsers = 0;
async function scan(ref, depth) {
  for (const c of await ref.listCollections()) {
    const snap = await c.get();
    for (const d of snap.docs) { docs++;
      if (hit(d.data()) || d.id.toLowerCase() === NAME) found[c.path.replace(/\/[^/]+\//g, "/*/")] = (found[c.path.replace(/\/[^/]+\//g, "/*/")] || 0) + 1;
      if (c.id === "users" && depth === 0 && !uids.has(d.id)) orphanUsers++;
      if (depth < 1) await scan(d.ref, depth + 1);
    }
  }
}
await scan(db, 0);
console.log("Firestore docs scanned:", docs);
console.log("Docs still containing the name:", Object.keys(found).length ? JSON.stringify(found) : "none");
console.log("users/{uid} docs with no matching Auth account:", orphanUsers);
