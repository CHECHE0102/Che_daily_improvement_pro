// One-off check of the CV writer with made-up sample answers (no player data). Run by .github/workflows/cv-try.yml.
import { callAi, cleanAnswers } from "../cv.js";
const sample = {
  target: { jobs: "Barista, Waiter / Waitress", industry: "咖啡店、餐廳", notes: "在台灣做過兩年咖啡師，可以排週末" }, city: "Dublin",
  visa: { type: "Working Holiday Authorisation", until: "2027 年 9 月", pps: "PPS number held", avail: "馬上", hours: "Full-time" },
  work: [{ title: "咖啡師", org: "路易莎咖啡", place: "台北，台灣", from: "2022/3", to: "2024/8", did: "每天做約 150 杯飲料，尖峰時段一個人顧吧台；教 3 個新人；負責收銀、開關店和盤點；拉花" },
    { title: "行政助理", org: "小型貿易公司", place: "新北，台灣", from: "2020/7", to: "2022/2", did: "處理訂單和出貨、回覆客人 email、用 Excel 做月報" }],
  education: [{ qual: "國際貿易學士", school: "銘傳大學", place: "台北，台灣", from: "2016", to: "2020", notes: "系學會活動長" }],
  languages: "中文母語、台語、英文 IELTS 6.0", skills: "拉花、義式咖啡機、POS 收銀、Excel", certs: "丙級飲料調製證照", extras: "喜歡爬山、攝影", tipsLang: "Traditional Chinese (Taiwan)",
};
const PRICE = { "claude-haiku-5-5": [0.10, 0.50], "claude-opus-5-5": [4, 20] };
const key = process.env.ANTHROPIC_API_KEY || "";
if (!key.startsWith("sk-ant-")) { console.log("::error::ANTHROPIC_API_KEY missing"); process.exit(1); }
for (const model of Object.keys(PRICE)) {
  const t0 = Date.now();
  try {
    const r = await callAi(key, JSON.stringify(cleanAnswers(sample)), model);
    const u = r.usage || {}, usd = (u.input_tokens * PRICE[model][0] + u.output_tokens * PRICE[model][1]) / 1e6;
    console.log(`===== ${model} | ${((Date.now() - t0) / 1000).toFixed(1)} s | in ${u.input_tokens} out ${u.output_tokens} tokens | US$${usd.toFixed(4)} | stop ${r.stop_reason}`);
    const txt = r.content.filter(b => b.type === "text").map(b => b.text).join("");
    console.log("CVJSON " + model + " " + JSON.stringify(JSON.parse(txt)));
  } catch (e) { console.log(`===== ${model} FAILED: ${e.status || ""} ${e.name} ${e.message}`); }
}
