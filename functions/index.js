/* BinBin daily — Rainbow Vault payments (Stripe Checkout + Managed Payments).
 *
 *  createCheckout  POST {item}  (Authorization: Bearer <Firebase ID token>)
 *                  → creates a Stripe Checkout Session and returns {url}
 *  stripeWebhook   Stripe → us. Verifies the signature, then records the purchase in
 *                  Firestore purchases/{sessionId}. Only this server can write that collection;
 *                  the game reads it and hands out the items once (field "claimed").
 *                  Refunds and disputes mark the purchase so the game takes the items back.
 *
 * Secrets live in Google Secret Manager (set by the deploy workflow from GitHub Secrets):
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Nothing secret is in this file.
 */
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { runPush } from "./push.js";
import { runWellDraw, runWellExpire, prevMonth } from "./well.js";
import { runPlaza } from "./plaza.js";
import { runCheatScan } from "./cheat.js";
import { eraseUser, runCleanup, RTDB_URL } from "./account.js";
import { runStats, runErrWatch } from "./ops.js";
import { runCv, cvLeft } from "./cv.js";
import { getDatabaseWithUrl } from "firebase-admin/database";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "node:crypto";

initializeApp();
const db = getFirestore();
const STRIPE_KEY = defineSecret("STRIPE_SECRET_KEY");
const WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const VAPID_PRIVATE = defineSecret("VAPID_PRIVATE");
const AI_KEY = defineSecret("ANTHROPIC_API_KEY");
const REGION = "europe-west1";
const STRIPE_VERSION = "2026-04-22.dahlia";
const SITE = "https://binbindaily.com/";
const ORIGINS = ["https://binbindaily.com", "https://www.binbindaily.com", "https://cheche0102.github.io", "https://binbin-daily.pages.dev", "http://localhost:8765"];

// What each vault item gives. Prices are created in the Stripe dashboard; only the ID lives here.
// test=true: sandbox item, only testers may buy it.
const CATALOG = {
  charm3: { price: "price_1URwQO8z3lVUqS5jPxa6225l", grant: { charms: 3 }, test: true },
  // monthly memberships: a supporter badge that gets finer the longer you stay (monthly recurring Stripe prices).
  // plus = premium: radiant badges and more style coins every paid month (PLUS_GIFT vs SUB_GIFT)
  sub: { price: "price_1USDPd8z3lVUqS5jraN2B4s7", grant: {}, mode: "subscription", plan: "sub", test: true },
  plus: { price: "price_1USC5g8z3lVUqS5jVO8jvv5J", grant: {}, mode: "subscription", plan: "plus", test: true },
  // style-coin packs (looks only). price: null = not on sale yet (needs a one-time price in Stripe)
  style250: { price: null, grant: { style: 250 }, test: true },
  style700: { price: null, grant: { style: 700 }, test: true },
  style1600: { price: null, grant: { style: 1600 }, test: true },
};
// monthly gift = style coins only (looks, effects, sounds): no gold or battle items, so paying never buys strength
const SUB_GIFT = { style: 300 }, PLUS_GIFT = { style: 800 };
const planOfPrice = id => Object.values(CATALOG).find(c => c.mode === "subscription" && c.price && c.price === id)?.plan || null;
// months subscribed → badge tier (same five badges as the old supporter badges)
const SUB_TIERS = [[24, 5], [12, 4], [6, 3], [3, 2], [1, 1]];
const subTier = m => (SUB_TIERS.find(([n]) => m >= n) || [0, 0])[1];
// sha256 of tester e-mail addresses (sandbox only; keeps the address itself out of this public repo)
const TESTERS = new Set(["d64a281160d50a9cd12426bc8ee395a2315b913497c840ed9c65feb367d56fc0"]);
const sha = s => crypto.createHash("sha256").update(String(s || "").toLowerCase()).digest("hex");
// sha256 of the developer's e-mail (same account as isAdmin() in the Firestore rules)
const ADMIN_SHA = "d64a281160d50a9cd12426bc8ee395a2315b913497c840ed9c65feb367d56fc0";

async function stripe(path, params) {
  const body = new URLSearchParams();
  const add = (k, v) => { if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) add(`${k}[${kk}]`, vv); else if (v !== undefined && v !== null) body.append(k, String(v)); };
  for (const [k, v] of Object.entries(params || {})) add(k, v);
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: params ? "POST" : "GET",
    headers: { Authorization: "Bearer " + STRIPE_KEY.value(), "Stripe-Version": STRIPE_VERSION, ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: params ? body : undefined,
  });
  const j = await r.json();
  if (!r.ok) { const e = new Error(j.error?.message || "stripe " + r.status); e.code = j.error?.code; throw e; }
  return j;
}

export const createCheckout = onRequest({ region: REGION, secrets: [STRIPE_KEY], cors: ORIGINS, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const tok = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const user = await getAuth().verifyIdToken(tok).catch(() => null);
    if (!user) return res.status(401).json({ error: "login" });
    const id = String(req.body?.item || ""), it = CATALOG[id];
    if (!it) return res.status(400).json({ error: "item" });
    if (!it.price) return res.status(403).json({ error: "closed" });
    const testMode = STRIPE_KEY.value().startsWith("sk_test_");
    if ((testMode || it.test) && !(user.email_verified && TESTERS.has(sha(user.email)))) return res.status(403).json({ error: "closed" });
    const lang = String(req.body?.lang || "auto").slice(0, 5);
    const sub = it.mode === "subscription";
    if (sub) {
      const cur = await db.doc("supporters/" + user.uid).get();
      if (cur.exists && cur.data().sub === true) return res.status(409).json({ error: "already" });
    }
    const nick = String(req.body?.nick || "").slice(0, 16);
    const s = await stripe("checkout/sessions", {
      mode: sub ? "subscription" : "payment",
      ...(sub ? { subscription_data: { metadata: { uid: user.uid, nick, plan: it.plan } } } : {}),
      line_items: { 0: { price: it.price, quantity: 1 } },
      managed_payments: { enabled: true },
      client_reference_id: user.uid,
      metadata: { uid: user.uid, item: id },
      customer_email: user.email || undefined,
      locale: ["zh-TW", "zh", "en", "hi", "es", "ja", "ko"].includes(lang) ? lang : "auto",
      success_url: SITE + "?pay=ok&sid={CHECKOUT_SESSION_ID}",
      cancel_url: SITE + "?pay=cancel",
    });
    await db.doc("purchases/" + s.id).set({ uid: user.uid, item: id, status: "open", test: testMode, at: FieldValue.serverTimestamp() }, { merge: true });
    res.json({ url: s.url, id: s.id });
  } catch (e) {
    logger.error("createCheckout", e.message, e.code);
    res.status(500).json({ error: "server", detail: e.message });
  }
});

function verifySig(raw, header, secret) {
  const parts = Object.fromEntries(String(header || "").split(",").map(p => p.split("=")).filter(p => p.length === 2).map(([k, v]) => [k, v]));
  const sigs = String(header || "").split(",").filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  const t = parts.t; if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const exp = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some(s => s.length === exp.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp)));
}

async function markByPaymentIntent(pi, data) {
  if (!pi) return 0;
  const q = await db.collection("purchases").where("pi", "==", pi).limit(5).get();
  await Promise.all(q.docs.map(d => d.ref.set(data, { merge: true })));
  return q.size;
}

/* ----- membership (subscription) ----- */
// a paid month = the first bill or a monthly renewal. Switching plans in the portal makes a proration bill
// (billing_reason "subscription_update"): it is not a new month and gets no gift (else switching back and forth would farm coins).
const COUNTS = new Set(["subscription_create", "subscription_cycle"]);
const counts = inv => !inv.billing_reason || COUNTS.has(inv.billing_reason);
// the plan an invoice is for: its charged line (a proration bill also has a credit line for the old plan)
const planOfInvoice = inv => { const L = inv.lines?.data || []; const l = L.find(x => (x.amount || 0) > 0) || L[0] || {}; return planOfPrice(l.pricing?.price_details?.price || l.price?.id); };
// every counted paid invoice adds a month; the badge tier follows the months. Admin-given badges (field "manual") are never lowered.
async function subPaid(inv) {
  const sd = inv.parent?.subscription_details || inv.subscription_details || {};
  const subId = sd.subscription || inv.subscription;
  if (!subId || !(inv.amount_paid > 0 || inv.status === "paid")) return;
  const sref = db.doc("subscriptions/" + subId);
  await db.runTransaction(async tx => {
    const cur = await tx.get(sref), d = cur.exists ? cur.data() : {};
    const uid = d.uid || sd.metadata?.uid; if (!uid) { logger.warn("invoice without uid", inv.id); return; }
    const seen = d.invoices || []; if (seen.includes(inv.id)) return;   // Stripe can resend events
    if (!counts(inv)) { tx.set(sref, { invoices: [...seen, inv.id].slice(-40) }, { merge: true }); return; }   // plan comes from customer.subscription.updated
    const months = (d.months || 0) + 1;
    const plan = planOfInvoice(inv) || d.plan || sd.metadata?.plan || "sub";
    const pref = db.doc("supporters/" + uid), p = await tx.get(pref), pd = p.exists ? p.data() : {};
    const manual = pd.manual ?? (pd.sub ? 0 : pd.tier || 0);
    const end = inv.lines?.data?.[0]?.period?.end || null;
    // the monthly style-coin gift is handed out like a purchase (the game claims it once)
    tx.set(db.doc("purchases/" + inv.id), { uid, item: plan === "plus" ? "plusgift" : "subgift", grant: plan === "plus" ? PLUS_GIFT : SUB_GIFT, status: "paid", claimed: false, revoked: false,
        pi: inv.payment_intent || null, amount: 0, currency: inv.currency || null, test: !inv.livemode, paidAt: FieldValue.serverTimestamp() });
    tx.set(sref, { uid, plan, status: "active", months, invoices: [...seen, inv.id].slice(-40), periodEnd: end, customer: inv.customer || d.customer || null, test: !inv.livemode }, { merge: true });
    tx.set(pref, { tier: Math.max(subTier(months), manual), manual, sub: true, plus: plan === "plus", months, n: sd.metadata?.nick || pd.n || "", at: Date.now() }, { merge: true });
  });
}
async function subStatus(sub) {
  const sref = db.doc("subscriptions/" + sub.id), cur = await sref.get();
  const uid = (cur.exists && cur.data().uid) || sub.metadata?.uid; if (!uid) return;
  const ended = ["canceled", "unpaid", "incomplete_expired"].includes(sub.status);
  const plan = planOfPrice(sub.items?.data?.[0]?.price?.id);
  await sref.set({ uid, status: sub.status, cancelAtEnd: !!sub.cancel_at_period_end, ...(plan ? { plan } : {}) }, { merge: true });
  if (!ended) {   // switched between the two memberships (customer portal): plan from the subscription itself, months recounted from Stripe's paid bills
    let months = cur.exists ? cur.data().months || 0 : 0;
    try { const L = await stripe(`invoices?subscription=${sub.id}&status=paid&limit=100`); const n = (L.data || []).filter(counts).length; if (n) months = n; }
    catch (e) { logger.warn("recount", sub.id, e.message); }
    await sref.set({ months }, { merge: true });
    const pref = db.doc("supporters/" + uid), p = await pref.get();
    if (p.exists && p.data().sub) { const manual = p.data().manual || 0; await pref.set({ ...(plan ? { plus: plan === "plus" } : {}), months, tier: Math.max(subTier(months), manual), at: Date.now() }, { merge: true }); }
    return { plan, months, status: sub.status };
  }
  const pref = db.doc("supporters/" + uid), p = await pref.get(); if (!p.exists) return;
  const pd = p.data(), manual = pd.manual || 0;
  if (manual) await pref.set({ tier: manual, sub: false, plus: false }, { merge: true }); else await pref.delete();
}

// re-reads the player's subscriptions from Stripe and fixes plan / months (called when coming back from the portal)
export const subSync = onRequest({ region: REGION, secrets: [STRIPE_KEY], cors: ORIGINS, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const tok = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const user = await getAuth().verifyIdToken(tok).catch(() => null);
    if (!user) return res.status(401).json({ error: "login" });
    const q = await db.collection("subscriptions").where("uid", "==", user.uid).limit(10).get();
    let out = null;
    for (const doc of q.docs) {
      const sub = await stripe("subscriptions/" + doc.id).catch(() => null); if (!sub) continue;
      const r = await subStatus(sub); if (r && !out) out = r;
    }
    res.json(out || { plan: null });
  } catch (e) {
    logger.error("subSync", e.message, e.code);
    res.status(500).json({ error: "server", detail: e.message });
  }
});

// opens Stripe's page where a member can cancel or change their card
export const subPortal = onRequest({ region: REGION, secrets: [STRIPE_KEY], cors: ORIGINS, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const tok = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const user = await getAuth().verifyIdToken(tok).catch(() => null);
    if (!user) return res.status(401).json({ error: "login" });
    const q = await db.collection("subscriptions").where("uid", "==", user.uid).limit(10).get();
    const d = q.docs.map(x => x.data()).find(x => x.customer);
    if (!d) return res.status(404).json({ error: "none" });
    const p = await stripe("billing_portal/sessions", { customer: d.customer, return_url: SITE + "?pay=portal" });
    res.json({ url: p.url });
  } catch (e) {
    logger.error("subPortal", e.message, e.code);
    res.status(500).json({ error: "server", detail: e.message });
  }
});

export const stripeWebhook = onRequest({ region: REGION, secrets: [STRIPE_KEY, WEBHOOK_SECRET], maxInstances: 5 }, async (req, res) => {
  const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
  if (!verifySig(raw, req.get("Stripe-Signature"), WEBHOOK_SECRET.value())) { logger.warn("bad signature"); return res.status(400).send("bad signature"); }
  let ev; try { ev = JSON.parse(raw); } catch (e) { return res.status(400).send("bad json"); }
  try {
    const o = ev.data?.object || {};
    if ((ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") && o.payment_status === "paid") {
      const uid = o.metadata?.uid || o.client_reference_id, item = o.metadata?.item, it = CATALOG[item];
      if (uid && it && o.mode === "subscription" && o.subscription) {
        await db.doc("subscriptions/" + o.subscription).set({ uid, customer: o.customer || null, test: !o.livemode, startedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      if (uid && it) {
        const ref = db.doc("purchases/" + o.id);
        await db.runTransaction(async tx => {
          const cur = await tx.get(ref), d = cur.exists ? cur.data() : {};
          if (d.status === "paid" || d.status === "refunded" || d.status === "disputed") return;   // already recorded (Stripe can resend events)
          tx.set(ref, { uid, item, grant: it.grant, status: "paid", claimed: d.claimed === true, revoked: false, pi: o.payment_intent || null,
            amount: o.amount_total ?? null, currency: o.currency || null, test: !o.livemode, paidAt: FieldValue.serverTimestamp() }, { merge: true });
        });
      } else logger.warn("session without uid/item", o.id);
    } else if (ev.type === "invoice.paid") {
      await subPaid(o);
    } else if (ev.type === "customer.subscription.deleted" || ev.type === "customer.subscription.updated") {
      await subStatus(o);
    } else if (ev.type === "checkout.session.expired" || ev.type === "checkout.session.async_payment_failed") {
      await db.doc("purchases/" + o.id).set({ status: "failed" }, { merge: true });
    } else if (ev.type === "charge.refunded") {
      if (o.refunded) await markByPaymentIntent(o.payment_intent, { status: "refunded", refundedAt: FieldValue.serverTimestamp() });
    } else if (ev.type === "charge.dispute.created") {
      await markByPaymentIntent(o.payment_intent, { status: "disputed", disputedAt: FieldValue.serverTimestamp() });
    }
    res.json({ received: true });
  } catch (e) {
    logger.error("webhook", ev.type, e.message);
    res.status(500).send("error");   // Stripe retries
  }
});

// Daily news reminders (and the plaza refresh). Cloud Scheduler calls this every 15 minutes, so the morning reminder goes out
// right after the news is published (08:00 Dublin) and the evening one at 19:00, every day.
// 刪除我的帳號與資料: the game calls this after the player confirms (and has signed in again recently).
// Removes all data tied to the uid with admin rights, then deletes the Google sign-in only if the player's own
// data is really gone. Answers {ok:true} or {error, failed:[steps]} so the game can say "try again".
export const deleteAccount = onRequest({ region: REGION, cors: ORIGINS, maxInstances: 5, timeoutSeconds: 300, memory: "512MiB" }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const tok = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const user = await getAuth().verifyIdToken(tok, true).catch(() => null);
  if (!user) return res.status(401).json({ error: "login" });
  // a stolen session must not be enough to wipe someone: the sign-in has to be recent (the game re-asks Google first)
  if (Date.now() / 1000 - (user.auth_time || 0) > 15 * 60) return res.status(403).json({ error: "recent" });
  const uid = user.uid;
  let rtdb = null; try { rtdb = getDatabaseWithUrl(RTDB_URL); } catch (e) { logger.warn("delete rtdb", e && e.message); }
  const { failed, blocking } = await eraseUser(db, uid, { rtdb, log: (step, err) => logger.warn("delete step", { step, err }) });
  if (blocking.length) { logger.error("delete blocked", { failed }); return res.status(500).json({ error: "partial", failed: blocking }); }
  // a step about someone else's record failed: note only which steps, so it can be finished by hand (no name kept)
  if (failed.length) await db.doc("deletions/" + uid).set({ failed, at: FieldValue.serverTimestamp() }).catch(() => {});
  try { await getAuth().deleteUser(uid); }
  catch (e) { if (e && e.code !== "auth/user-not-found") { logger.error("delete auth", e && e.message); return res.status(500).json({ error: "auth" }); } }
  logger.info("account deleted", { steps: failed.length ? "with follow-up" : "complete" });
  return res.json({ ok: true });
});

export const newsPush = onSchedule({ schedule: "every 15 minutes", timeZone: "Europe/Dublin", region: REGION, secrets: [VAPID_PRIVATE], timeoutSeconds: 300, retryCount: 0, maxInstances: 1 }, async () => {
  try { await runPlaza(db); } catch (e) { logger.warn("plaza", e && e.message); }   // 廣場: refresh who stands in the plaza (one doc)
  // new error reports → push to the developer's phone (no e-mail)
  try { const e = await runErrWatch(db, VAPID_PRIVATE.value(), (...a) => logger.warn(...a)); if (e.n) logger.info("errWatch", e); } catch (e) { logger.warn("errWatch", e && e.message); }
  const r = await runPush(db, VAPID_PRIVATE.value(), (...a) => logger.info(...a));
  if (r.am || r.pm || r.gone || r.fail || r.bad) logger.info("newsPush", r);
});

// 許願池 (Wishing Well): at 00:10 Irish time on the 1st of each month, draw last month's winners (game gold only).
export const wellDraw = onSchedule({ schedule: "10 0 1 * *", timeZone: "Europe/Dublin", region: REGION, timeoutSeconds: 120, retryCount: 3, maxInstances: 1 }, async () => {
  const r = await runWellDraw(db, prevMonth());
  logger.info("wellDraw", r);
});

// 許願池: every day at 00:20 Irish time, prizes not claimed within 7 days go back into the well (next draw's pool).
export const wellExpire = onSchedule({ schedule: "20 0 * * *", timeZone: "Europe/Dublin", region: REGION, timeoutSeconds: 120, retryCount: 3, maxInstances: 1 }, async () => {
  const r = await runWellExpire(db);
  if (r.length) logger.info("wellExpire", r);
  // 防作弊: same daily run (keeps us within the 3 free Cloud Scheduler jobs)
  try { logger.info("cheatScan", await runCheatScan(db)); } catch (e) { logger.warn("cheatScan", e && e.message); }
  // privacy policy: old error reports and feedback are removed on schedule
  try { logger.info("cleanup", await runCleanup(db)); } catch (e) { logger.warn("cleanup", e && e.message); }
  // developer panel numbers, worked out once a day (the panel can also ask for fresh ones: adminStats)
  try { const s = await runStats(db); logger.info("stats", { users: s.users, devices: s.ret && s.ret.devices }); } catch (e) { logger.warn("stats", e && e.message); }
});

// 開發者面板「重新整理」: the admin asks for fresh numbers now. Only the admin's own Google account may call it.
export const adminStats = onRequest({ region: REGION, cors: ORIGINS, maxInstances: 2, timeoutSeconds: 120, memory: "512MiB" }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const tok = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const user = await getAuth().verifyIdToken(tok).catch(() => null);
  if (!user || !user.email_verified || sha(user.email) !== ADMIN_SHA) return res.status(403).json({ error: "admin" });
  try { return res.json(await runStats(db)); } catch (e) { logger.error("adminStats", e && e.message); return res.status(500).json({ error: "stats" }); }
});

// 履歷桌 AI CV writer (functions/cv.js). POST {answers} → {cv, left}; POST {check:true} → {left} (how many tries are left).
// Signed-in players only; 3 per day and 10 per month each. Nothing the player wrote is stored or logged.
export const cvWrite = onRequest({ region: REGION, secrets: [AI_KEY], cors: ORIGINS, maxInstances: 5, concurrency: 20, timeoutSeconds: 120, memory: "256MiB" }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const tok = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const user = await getAuth().verifyIdToken(tok).catch(() => null);
  if (!user) return res.status(401).json({ error: "login" });
  const key = AI_KEY.value() || "";
  if (!key.startsWith("sk-ant-")) return res.status(503).json({ error: "setup" });
  try {
    if (req.body?.check) return res.json({ left: await cvLeft(db, user.uid) });
    const banned = await db.doc("banned/" + user.uid).get();
    if (banned.exists) return res.status(403).json({ error: "banned" });
    const admin = !!(user.email_verified && sha(user.email) === ADMIN_SHA);
    const r = await runCv(db, user.uid, req.body?.answers, key, admin);
    if (r.status === 200) logger.info("cvWrite", { tokens: r.json.usage });   // counts only, never the text
    return res.status(r.status).json(r.json);
  } catch (e) {
    logger.error("cvWrite", e && e.cvStatus, e && e.detail);
    return res.status(e && e.cvStatus === "busy" ? 429 : 500).json({ error: e && e.cvStatus || "server" });
  }
});
