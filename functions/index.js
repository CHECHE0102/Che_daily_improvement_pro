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
const REGION = "europe-west1";
const STRIPE_VERSION = "2026-04-22.dahlia";
const SITE = "https://binbindaily.com/";
const ORIGINS = ["https://binbindaily.com", "https://www.binbindaily.com", "https://cheche0102.github.io", "http://localhost:8765"];

// What each vault item gives. Prices are created in the Stripe dashboard; only the ID lives here.
// test=true: sandbox item, only testers may buy it.
const CATALOG = {
  charm3: { price: "price_1URwQO8z3lVUqS5jPxa6225l", grant: { charms: 3 }, test: true },
  // monthly membership: a supporter badge that gets finer the longer you stay (price: a monthly recurring Stripe price)
  sub: { price: "", grant: {}, mode: "subscription", test: true },
};
// months subscribed → badge tier (same five badges as the old supporter badges)
const SUB_TIERS = [[24, 5], [12, 4], [6, 3], [3, 2], [1, 1]];
const subTier = m => (SUB_TIERS.find(([n]) => m >= n) || [0, 0])[1];
// sha256 of tester e-mail addresses (sandbox only; keeps the address itself out of this public repo)
const TESTERS = new Set(["d64a281160d50a9cd12426bc8ee395a2315b913497c840ed9c65feb367d56fc0"]);
const sha = s => crypto.createHash("sha256").update(String(s || "").toLowerCase()).digest("hex");

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
      ...(sub ? { subscription_data: { metadata: { uid: user.uid, nick } } } : {}),
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
// every paid invoice adds a month; the badge tier follows the months. Admin-given badges (field "manual") are never lowered.
async function subPaid(inv) {
  const sd = inv.parent?.subscription_details || inv.subscription_details || {};
  const subId = sd.subscription || inv.subscription;
  if (!subId || !(inv.amount_paid > 0 || inv.status === "paid")) return;
  const sref = db.doc("subscriptions/" + subId);
  await db.runTransaction(async tx => {
    const cur = await tx.get(sref), d = cur.exists ? cur.data() : {};
    const uid = d.uid || sd.metadata?.uid; if (!uid) { logger.warn("invoice without uid", inv.id); return; }
    const seen = d.invoices || []; if (seen.includes(inv.id)) return;   // Stripe can resend events
    const months = (d.months || 0) + 1;
    const pref = db.doc("supporters/" + uid), p = await tx.get(pref), pd = p.exists ? p.data() : {};
    const manual = pd.manual ?? (pd.sub ? 0 : pd.tier || 0);
    const end = inv.lines?.data?.[0]?.period?.end || null;
    tx.set(sref, { uid, status: "active", months, invoices: [...seen, inv.id].slice(-40), periodEnd: end, customer: inv.customer || d.customer || null, test: !inv.livemode }, { merge: true });
    tx.set(pref, { tier: Math.max(subTier(months), manual), manual, sub: true, months, n: sd.metadata?.nick || pd.n || "", at: Date.now() }, { merge: true });
  });
}
async function subStatus(sub) {
  const sref = db.doc("subscriptions/" + sub.id), cur = await sref.get();
  const uid = (cur.exists && cur.data().uid) || sub.metadata?.uid; if (!uid) return;
  const ended = ["canceled", "unpaid", "incomplete_expired"].includes(sub.status);
  await sref.set({ uid, status: sub.status, cancelAtEnd: !!sub.cancel_at_period_end }, { merge: true });
  if (!ended) return;
  const pref = db.doc("supporters/" + uid), p = await pref.get(); if (!p.exists) return;
  const pd = p.data(), manual = pd.manual || 0;
  if (manual) await pref.set({ tier: manual, sub: false }, { merge: true }); else await pref.delete();
}

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

// Daily news reminders. Cloud Scheduler calls this every 15 minutes, so the morning reminder goes out
// right after the news is published (08:00 Dublin) and the evening one at 19:00, every day.
export const newsPush = onSchedule({ schedule: "every 15 minutes", timeZone: "Europe/Dublin", region: REGION, secrets: [VAPID_PRIVATE], timeoutSeconds: 300, retryCount: 0, maxInstances: 1 }, async () => {
  const r = await runPush(db, VAPID_PRIVATE.value(), (...a) => logger.info(...a));
  if (r.am || r.pm || r.gone || r.fail || r.bad) logger.info("newsPush", r);
});
