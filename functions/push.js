/* Daily news reminders (Web Push), run by Cloud Scheduler every 15 minutes (reliable timing, unlike GitHub's cron).
 * Morning: from 08:00 local time, once a day, when a news story the player hasn't been told about is out.
 * Evening: from 19:00 local time, if the player hasn't opened any story today (their local date).
 * Encryption, VAPID and the timing rules are the same as tools/push.mjs (which now only sends test notifications). */
import crypto from "node:crypto";

const NEWS_INDEX = "https://cheche0102.github.io/Che_daily_improvement_pro/articles/index.json";
const CONTACT = "mailto:binbindaily.help@gmail.com";
export const VAPID_PUBLIC = "BG8pT7pCPH1boxpKEe_fFinoQBJQDHonJyA7E-4Rf-5Wkxv0hM6cphsBOzz9M3ulvp6za-IVA6zItxjqXUV_zsw";
const AM = [8, 12], PM = [19, 23]; // [from, before) local hours

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
  const c = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT }));
  const sig = crypto.sign("sha256", Buffer.from(h + "." + c), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${VAPID_PUBLIC}`;
}
// only real browser push services are contacted (anyone can write a subscription, so never POST to arbitrary hosts)
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.services\.mozilla\.com$/];
export const pushHostOk = ep => { try { const u = new URL(ep); return u.protocol === "https:" && PUSH_HOSTS.some(r => r.test(u.hostname)); } catch { return false; } };
async function sendPush(sub, msg, key) {
  const r = await fetch(sub.endpoint, {
    signal: AbortSignal.timeout(10000), redirect: "manual",
    method: "POST",
    headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "14400", Urgency: "normal", Authorization: vapidAuth(sub.endpoint, key) },
    body: encrypt(JSON.stringify(msg), sub.p256dh, sub.auth),
  });
  return r.status;
}

/* ---------- messages ---------- */
const MSG = {
  zh: { am: "📰 今天的新聞來了", amB: "{t}\n點開來讀讀看，順便學幾個新單字吧！", pm: "🌙 今天還沒讀新聞哦", pmB: "睡前花 5 分鐘看一下吧！讀完今天的英文就完成了。" },
  test: { zh: ["🔔 測試通知", "通知設定成功！之後每天早上 7 點會提醒你看新聞 📰"], en: ["🔔 Test notification", "It works! You'll get a news reminder every morning at 7 📰"] },
  sc: { am: "📰 今天的新闻来了", amB: "{t}\n点开来读读看，顺便学几个新单词吧！", pm: "🌙 今天还没读新闻哦", pmB: "睡前花 5 分钟看一下吧！读完今天的英文就完成了。" },
  en: { am: "📰 Today's news is here", amB: "{t}\nTap to read it and pick up a few new words!", pm: "🌙 You haven't read today's news yet", pmB: "Take five minutes for it before bed!" },
  hi: { am: "📰 आज की ख़बरें आ गई हैं", amB: "{t}\nपढ़ने के लिए टैप करें और कुछ नए शब्द सीखें!", pm: "🌙 आपने आज की ख़बर अभी तक नहीं पढ़ी", pmB: "सोने से पहले 5 मिनट निकालकर पढ़ लीजिए!" },
  es: { am: "📰 Ya están las noticias de hoy", amB: "{t}\n¡Toca para leerla y aprender palabras nuevas!", pm: "🌙 Todavía no has leído las noticias de hoy", pmB: "¡Dedícale cinco minutos antes de dormir!" },
  ja: { am: "📰 今日のニュースが届きました", amB: "{t}\nタップして読んで、新しい単語を覚えよう！", pm: "🌙 今日のニュース、まだ読んでいませんよ", pmB: "寝る前に5分だけ読んでみよう！" },
  ko: { am: "📰 오늘의 뉴스가 도착했어요", amB: "{t}\n눌러서 읽고 새 단어도 배워 보세요!", pm: "🌙 오늘 뉴스를 아직 안 읽었어요", pmB: "자기 전에 5분만 읽어 봐요!" },
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


async function latestNews() {
  try {
    const j = await (await fetch(NEWS_INDEX + "?t=" + Date.now(), { signal: AbortSignal.timeout(10000) })).json();
    const top = (j.articles || []).filter(a => (a.rank || 1) === 1).sort((a, b) => b.date.localeCompare(a.date))[0];
    return top ? { date: top.date, title: top.title } : null;
  } catch (e) { return null; }
}

async function saveStats(db, subs, add) {
  const ref = db.doc("config/pushStats");
  await db.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() || {};
    const day = localNow("Europe/Dublin").date, days = cur.days || {};
    const d = days[day] || { am: 0, pm: 0, gone: 0, fail: 0, test: 0 };
    for (const k of Object.keys(add)) d[k] = (d[k] || 0) + add[k];
    days[day] = d;
    for (const k of Object.keys(days).sort().slice(0, -14)) delete days[k];
    tx.set(ref, { subs, updatedAt: new Date().toISOString(), days });
  });
}

export async function runPush(db, vapidPrivate, log) {
  const key = vapidKey(String(vapidPrivate).trim());
  const news = await latestNews();
  const snap = await db.collection("push").get();
  let sent = { am: 0, pm: 0 }, gone = 0, fail = 0, bad = 0;
  for (const doc of snap.docs) {
    const s = doc.data();
    if (!s.endpoint || !s.p256dh || !s.auth || s.on === false || s.on === "false") continue;
    if (!pushHostOk(s.endpoint) || String(s.p256dh).length > 200 || String(s.auth).length > 60) { await doc.ref.delete().catch(() => {}); bad++; continue; }
    const p = plan(s, news); if (!p) continue;
    // claim first: mark this notification as sent before sending, so a retry can never cause a duplicate
    try { await doc.ref.update(p.set); } catch (e) { fail++; continue; }
    try {
      const st = await sendPush(s, p.msg, key);
      if (st === 404 || st === 410) { await doc.ref.delete().catch(() => {}); gone++; continue; }
      if (st >= 200 && st < 300) sent[p.kind]++; else { fail++; log("push", st, new URL(s.endpoint).host); }
    } catch (e) { fail++; log("push error", e.message); }
  }
  if (sent.am + sent.pm + gone + fail + bad) await saveStats(db, snap.size - gone - bad, { am: sent.am, pm: sent.pm, gone, fail }).catch(e => log("stats", e.message));
  return { subs: snap.size, ...sent, gone, fail, bad, news: news ? news.date : null };
}
