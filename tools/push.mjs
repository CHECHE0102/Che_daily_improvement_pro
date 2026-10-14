// Daily news reminders (Web Push). Runs hourly from .github/workflows/push.yml.
// Morning: from 07:00 local time, once a day, when a news article the player hasn't been told about is out.
// Evening: from 19:00 local time, if the player hasn't opened any article today (their local date).
// No npm packages: VAPID (RFC 8292) + aes128gcm (RFC 8291) + Firestore REST with a service account.
import crypto from "node:crypto";

const PROJECT = "che-daily-improvement-pro";
const SITE = "https://cheche0102.github.io/Che_daily_improvement_pro/";
const NEWS_INDEX = "https://cheche0102.github.io/Che_daily_improvement/articles/index.json";
export const VAPID_PUBLIC = "BG8pT7pCPH1boxpKEe_fFinoQBJQDHonJyA7E-4Rf-5Wkxv0hM6cphsBOzz9M3ulvp6za-IVA6zItxjqXUV_zsw";
const AM = [7, 12], PM = [19, 23]; // [from, before) local hours

const b64u = b => Buffer.from(b).toString("base64url");
const unb64u = s => Buffer.from(String(s).replace(/=+$/, ""), "base64url");

/* ---------- web push encryption (RFC 8291) ---------- */
function hkdf(salt, ikm, info, len) {
  const prk = crypto.createHmac("sha256", salt).update(ikm).digest();
  return crypto.createHmac("sha256", prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
}
export function encrypt(payload, p256dh, authSecret, fixed = {}) {
  const uaPub = unb64u(p256dh), auth = unb64u(authSecret);
  const ecdh = crypto.createECDH("prime256v1");
  if (fixed.asPriv) ecdh.setPrivateKey(unb64u(fixed.asPriv)); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPub);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32);
  const salt = fixed.salt ? unb64u(fixed.salt) : crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = 65;
  return Buffer.concat([head, asPub, body]);
}

/* ---------- VAPID (RFC 8292) ---------- */
export function vapidKey(priv) {
  const p = unb64u(VAPID_PUBLIC);
  return crypto.createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: priv, x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33, 65)) } });
}
export function vapidAuth(endpoint, key) {
  const aud = new URL(endpoint).origin;
  const h = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const c = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE }));
  const sig = crypto.sign("sha256", Buffer.from(h + "." + c), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${VAPID_PUBLIC}`;
}
async function sendPush(sub, msg, key) {
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "14400", Urgency: "normal", Authorization: vapidAuth(sub.endpoint, key) },
    body: encrypt(JSON.stringify(msg), sub.p256dh, sub.auth),
  });
  return r.status;
}

/* ---------- Firestore REST ---------- */
async function googleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const c = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = crypto.sign("sha256", Buffer.from(h + "." + c), sa.private_key);
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${b64u(sig)}` }) });
  const j = await r.json(); if (!j.access_token) throw new Error("token: " + JSON.stringify(j)); return j.access_token;
}
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const plain = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, v.stringValue ?? v.booleanValue ?? v.integerValue ?? v.doubleValue ?? null]));
async function listSubs(tok) {
  const out = []; let page = "";
  do {
    const r = await fetch(`${FS}/push?pageSize=300${page ? "&pageToken=" + page : ""}`, { headers: { Authorization: "Bearer " + tok } });
    const j = await r.json(); if (j.error) throw new Error("list: " + JSON.stringify(j.error));
    for (const d of j.documents || []) out.push({ name: d.name, ...plain(d.fields) });
    page = j.nextPageToken || "";
  } while (page);
  return out;
}
async function patch(tok, name, fields) {
  const q = Object.keys(fields).map(k => "updateMask.fieldPaths=" + k).join("&");
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: String(v) }])) };
  await fetch(`https://firestore.googleapis.com/v1/${name}?${q}&currentDocument.exists=true`, { method: "PATCH", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const del = (tok, name) => fetch(`https://firestore.googleapis.com/v1/${name}`, { method: "DELETE", headers: { Authorization: "Bearer " + tok } });

/* ---------- messages ---------- */
const MSG = {
  zh: { am: "📰 今天的新聞來了", amB: "{t}\n點開來讀讀看，順便學幾個新單字吧！", pm: "📖 今天的新聞還沒看喔", pmB: "花 5 分鐘讀一篇，今天的英文就不會斷掉！" },
  sc: { am: "📰 今天的新闻来了", amB: "{t}\n点开来读读看，顺便学几个新单词吧！", pm: "📖 今天的新闻还没看哦", pmB: "花 5 分钟读一篇，今天的英文就不会断掉！" },
  en: { am: "📰 Today's news is here", amB: "{t}\nTap to read it and pick up a few new words!", pm: "📖 You haven't read today's news yet", pmB: "Five minutes with one story keeps your English going today!" },
  hi: { am: "📰 आज की ख़बरें आ गई हैं", amB: "{t}\nपढ़ने के लिए टैप करें और कुछ नए शब्द सीखें!", pm: "📖 आपने आज की ख़बर अभी तक नहीं पढ़ी", pmB: "बस 5 मिनट में एक ख़बर पढ़ें और आज की अंग्रेज़ी पूरी करें!" },
  es: { am: "📰 Ya están las noticias de hoy", amB: "{t}\n¡Toca para leerla y aprender palabras nuevas!", pm: "📖 Todavía no has leído las noticias de hoy", pmB: "¡Cinco minutos con una noticia y hoy también practicas inglés!" },
  ja: { am: "📰 今日のニュースが届きました", amB: "{t}\nタップして読んで、新しい単語を覚えよう！", pm: "📖 今日のニュースをまだ読んでいません", pmB: "5分で1本読んで、今日の英語を続けよう！" },
  ko: { am: "📰 오늘의 뉴스가 도착했어요", amB: "{t}\n눌러서 읽고 새 단어도 배워 보세요!", pm: "📖 오늘 뉴스를 아직 안 읽었어요", pmB: "5분만 투자해서 한 편 읽고 오늘의 영어를 이어가요!" },
};
export function localNow(tz, d = new Date()) {
  let parts; try { parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d); }
  catch { return localNow("Europe/Dublin", d); }
  const g = t => parts.find(p => p.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: +g("hour") };
}
// Decide what (if anything) a subscriber gets right now.
export function plan(s, news, now = new Date()) {
  const { date, hour } = localNow(s.tz, now);
  const L = MSG[s.sc === true || s.sc === "true" ? "sc" : s.lang] || MSG.en;
  if (hour >= AM[0] && hour < AM[1] && s.lastAm !== date && news && news.date !== s.lastArt && s.lastRead !== date)
    return { kind: "am", set: { lastAm: date, lastArt: news.date }, msg: { title: L.am, body: L.amB.replace("{t}", news.title), tag: "news-am", url: "./" } };
  if (hour >= PM[0] && hour < PM[1] && s.lastPm !== date && s.lastRead !== date)
    return { kind: "pm", set: { lastPm: date }, msg: { title: L.pm, body: L.pmB, tag: "news-pm", url: "./" } };
  return null;
}

async function main() {
  const saRaw = process.env.FIREBASE_SA, vpriv = process.env.VAPID_PRIVATE;
  if (!saRaw || !vpriv) { console.log("FIREBASE_SA or VAPID_PRIVATE secret is not set yet — nothing sent."); return; }
  const sa = JSON.parse(saRaw), key = vapidKey(vpriv.trim());
  let news = null;
  try { const j = await (await fetch(NEWS_INDEX + "?t=" + Date.now())).json();
    const top = (j.articles || []).filter(a => (a.rank || 1) === 1).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (top) news = { date: top.date, title: top.title }; } catch (e) { console.log("news index:", e.message); }
  const tok = await googleToken(sa), subs = await listSubs(tok);
  let sent = { am: 0, pm: 0 }, gone = 0, fail = 0;
  for (const s of subs) {
    if (!s.endpoint || !s.p256dh || !s.auth || s.on === false || s.on === "false") continue;
    const p = plan(s, news); if (!p) continue;
    try {
      const st = await sendPush(s, p.msg, key);
      if (st === 404 || st === 410) { await del(tok, s.name); gone++; continue; }
      if (st >= 200 && st < 300) { await patch(tok, s.name, p.set); sent[p.kind]++; } else { fail++; console.log("push", st, new URL(s.endpoint).host); }
    } catch (e) { fail++; console.log("push error", e.message); }
  }
  console.log(`subscribers ${subs.length} · morning ${sent.am} · evening ${sent.pm} · expired ${gone} · failed ${fail} · latest news ${news ? news.date : "none"}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
