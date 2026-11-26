/* ===== 履歷桌 AI CV writer (CheChe 2026-11-26) =====
   Next to the reading corner in the plaza. The player answers a few questions (Chinese is fine), the server asks the AI to
   write an Irish-style CV in English (functions/cv.js), and here we show it, let the player edit it and make a PDF.
   Irish CV norms used: 1-2 pages, no photo / date of birth / marital status, personal statement at the top, a right-to-work
   line, experience before education, Irish/UK spelling, "References available on request".
   Privacy: the answers and the CV stay in this phone's storage (key che-cv, cleared on sign-out); contact details are never
   sent anywhere, the rest goes to our server only to be written into English and is not stored there.
   Loaded on demand by index.html (cvOpen) as games/cv.js; it uses the page's CSS variables and, when present, toast/sfx. */
(function () {
  "use strict";
  const KEY = "che-cv", JSPDF = "games/vendor/jspdf.umd.min.js";   // jsPDF 2.5.2 (MIT), served by us so no other site sees the player
  let O = {}, D = null, box = null, busy = false, edit = false, left = null;

  // ---------- words (Chinese + English; other languages use English) ----------
  const W = {
    title: ["履歷桌", "CV Desk"],
    sub: ["用愛爾蘭的方式做一份英文履歷", "Make an English CV the Irish way"],
    start: ["開始", "Start"], next: ["下一步", "Next"], back: ["上一步", "Back"], close: ["關閉", "Close"],
    introH: ["愛爾蘭的履歷長這樣", "What a CV looks like in Ireland"],
    intro: [["最多 2 頁，經驗少的話 1 頁就好", "不放照片、生日、年齡、婚姻狀況", "最上面是一段 Personal Statement（自我介紹）", "寫清楚你的簽證和能不能工作", "工作經驗放在學歷前面，最新的在最上面", "英式拼寫，結尾寫 References available on request"],
      ["1 page with little experience, never more than 2", "No photo, date of birth, age or marital status", "A short personal statement at the top", "Say clearly what visa you have and that you can work", "Experience before education, newest first", "Irish/UK spelling, and \"References available on request\" at the end"]],
    gift: ["💛 寫履歷的 AI 費用由 BinBin 的創作者幫你付。等你真的找到工作，也請把這份好意傳下去，好好回饋社會 🍀", "💛 The AI cost of your CV is paid for by BinBin's creator. When you land a job, please pass the kindness on and give back to your community 🍀"],
    how: ["你用中文回答就可以，AI 會寫成英文履歷，還會告訴你哪裡可以更好。", "Answer in Chinese or English: the AI writes the English CV and tells you what could be better."],
    privacy: ["隱私：回答只存在這支手機。按「AI 幫我寫」時，除了姓名和聯絡方式以外的回答會傳給 AI 寫成英文，伺服器不會留存。姓名、電話、Email 永遠不會離開手機。", "Privacy: your answers stay on this phone. When you press \"Write it for me\", everything except your name and contact details is sent to the AI to be written in English; our server keeps none of it. Name, phone and e-mail never leave the phone."],
    leftN: ["今天還可以讓 AI 寫 {d} 次（本月 {m} 次）· 🌟 精修版本月 {p} 次", "AI writes left: {d} today ({m} this month) · 🌟 premium: {p} this month"],
    writePro: ["🌟 精修版（每月 1 次）", "🌟 Premium write (1 a month)"],
    proInfo: ["精修版用最強的 AI，寫得更細、建議更具體。每人每月 1 次，全站每月限量 20 份，不扣一般次數。", "Premium uses our strongest AI: richer wording and more specific advice. Once a month each, 20 a month for everyone, on top of the normal writes."],
    proTag: ["🌟 這份是精修版", "🌟 Premium version"],
    e_proOut: ["這個月的 20 份精修版已經被大家用完了，下個月 1 號再來（一般版還可以用）", "This month's 20 premium writes are all taken; try again next month (normal writes still work)"],
    proAll: ["全站本月精修版剩 {n} 份", "{n} premium writes left this month for everyone"],
    e_pro: ["這個月的精修版用過了，下個月再來（一般版還可以用）", "You've used this month's premium write; normal writes still work"],
    resume: ["繼續上次的履歷", "Continue my CV"], fresh: ["重新開始", "Start over"], clearAsk: ["確定清除所有回答和履歷？", "Clear all answers and the CV?"],
    s_target: ["想做什麼工作", "Target job"], s_visa: ["簽證與工作", "Visa & availability"], s_work: ["工作經驗", "Work experience"], s_edu: ["學歷", "Education"], s_skills: ["技能與語言", "Skills & languages"], s_contact: ["聯絡方式", "Contact details"], s_result: ["你的履歷", "Your CV"],
    jobs: ["想應徵的工作", "Jobs you want"], jobsPh: ["例：咖啡師、餐廳外場", "e.g. barista, waiter"], jobsPick: ["常見工作（點一下加入）", "Common jobs (tap to add)"],
    industry: ["產業或公司類型（可不填）", "Industry or type of company (optional)"], industryPh: ["例：咖啡店、飯店、科技公司", "e.g. cafés, hotels, tech"],
    tnotes: ["還想讓雇主知道什麼？（可不填）", "Anything else employers should know? (optional)"], tnotesPh: ["例：有台灣餐飲經驗、可以排週末班", "e.g. hospitality experience in Taiwan, can work weekends"],
    city: ["你在哪個城市找工作", "City you are looking in"],
    visa: ["簽證種類", "Visa / permission"], until: ["簽證到期（月份）", "Valid until (month)"], untilPh: ["例：2027 年 6 月", "e.g. June 2027"],
    pps: ["PPS 號碼", "PPS number"], avail: ["什麼時候可以開始上班", "When can you start"], availPh: ["例：馬上、12 月 1 日", "e.g. immediately, 1 December"], hours: ["想要的班別", "Hours you want"],
    jobN: ["工作 {n}", "Job {n}"], addJob: ["＋ 再加一份工作", "+ Add a job"], del: ["刪除", "Remove"],
    wTitle: ["職稱", "Job title"], wTitlePh: ["例：咖啡師、業務助理", "e.g. barista, sales assistant"], wOrg: ["公司／店名", "Employer"], wPlace: ["城市、國家", "City, country"], wPlacePh: ["例：台北，台灣", "e.g. Taipei, Taiwan"],
    from: ["開始", "From"], to: ["結束", "To"], fromPh: ["例：2022/3", "e.g. 03/2022"], toPh: ["例：2024/8 或 現在", "e.g. 08/2024 or now"],
    did: ["做了什麼、有什麼成果", "What you did and achieved"], didPh: ["例：每天做約 150 杯咖啡；教 3 個新人；處理收銀和開關店", "e.g. made about 150 coffees a day; trained 3 new staff; cash handling, opening and closing"],
    eduN: ["學歷 {n}", "Education {n}"], addEdu: ["＋ 再加一個學歷", "+ Add education"],
    eQual: ["學位／科系", "Qualification / subject"], eQualPh: ["例：企業管理學士", "e.g. BA Business Administration"], eSchool: ["學校", "School"], eNotes: ["補充（可不填）", "Notes (optional)"], eNotesPh: ["例：畢業專題、社團幹部、成績", "e.g. final project, clubs, grades"],
    langs: ["語言能力", "Languages"], langsPh: ["例：中文母語、英文 IELTS 6.5、台語", "e.g. Mandarin native, English IELTS 6.5"],
    skills: ["技能", "Skills"], skillsPh: ["例：拉花、POS 收銀、Excel、Photoshop、駕照", "e.g. latte art, POS tills, Excel, driving licence"],
    certs: ["證照／訓練（可不填）", "Certificates / training (optional)"], certsPh: ["例：Manual Handling、HACCP、急救、丙級廚師", "e.g. Manual Handling, HACCP, first aid"],
    extras: ["志工、興趣、其他（可不填）", "Volunteering, interests, other (optional)"], extrasPh: ["例：學校志工、跑步、攝影", "e.g. volunteering, running, photography"],
    cName: ["英文姓名", "Full name"], cNamePh: ["例：Ching-Che Huang", "e.g. Ching-Che Huang"], cEmail: ["Email", "E-mail"], cPhone: ["電話", "Phone"], cPhonePh: ["例：+353 87 123 4567", "e.g. +353 87 123 4567"], cLoc: ["所在地", "Location"], cLocPh: ["例：Dublin 8", "e.g. Dublin 8"], cLink: ["LinkedIn（可不填）", "LinkedIn (optional)"],
    onPhone: ["🔒 這一頁只存在你的手機", "🔒 This page stays on your phone"],
    write: ["✨ AI 幫我寫", "✨ Write it for me"], rewrite: ["✨ 依照回答重新寫", "✨ Write it again"], writing: ["AI 正在寫你的履歷…（約 20–40 秒）", "The AI is writing your CV… (about 20–40 s)"],
    needSome: ["至少要填一份工作或一個學歷", "Add at least one job or one education entry"],
    tips: ["💡 給你的建議", "💡 Advice for you"], missing: ["❓ 補上這些會更好", "❓ Answer these to make it stronger"], fixAns: ["回去補充", "Add answers"],
    tpl: ["樣式", "Style"], tpl_classic: ["經典", "Classic"], tpl_fresh: ["清爽", "Fresh"],
    pdf: ["⬇️ 下載 PDF", "⬇️ Download PDF"], copy: ["📋 複製文字", "📋 Copy text"], copied: ["已複製，可以貼到求職網站", "Copied: paste it into job sites"],
    edit: ["✏️ 修改文字", "✏️ Edit text"], editDone: ["✓ 完成修改", "✓ Done"], lines: ["一行一項", "one per line"],
    pages: ["目前約 {n} 頁", "About {n} page(s)"], tooLong: ["超過 2 頁了，刪掉比較舊或不相關的內容", "Over 2 pages: cut older or less relevant parts"],
    nonLatin: ["PDF 只能放英文字，中文字已拿掉：請把姓名、地點改成英文", "The PDF only takes English letters: Chinese characters were left out, write names and places in English"],
    e_login: ["要先登入 Google 才能用 AI 寫履歷", "Sign in with Google to use the AI writer"], e_setup: ["AI 還沒開通，請稍後再試", "The AI writer is not switched on yet"],
    e_day: ["今天的 3 次用完了，明天再來", "You've used today's 3 writes, come back tomorrow"], e_month: ["這個月的 10 次用完了", "You've used this month's 10 writes"],
    e_full: ["今天大家寫的份數已經滿了，明天再來", "Today's writes for everyone are used up, come back tomorrow"], e_busy: ["現在太多人在用，等一下再試", "Too busy right now, try again soon"], e_refused: ["AI 沒辦法處理這些內容，請修改後再試", "The AI couldn't write this, change your answers and try again"],
    e_net: ["連線失敗或 AI 出錯，請再試一次（AI 出錯不扣次數）", "Connection or AI error, try again (AI errors are not counted)"], e_banned: ["這個帳號不能使用", "This account can't use it"],
    nextT: ["📌 接下來", "📌 Next steps"], nextL: [["每種工作各存一版，標題寫你要應徵的職位", "咖啡店、餐廳、零售店：印幾份 PDF 直接走進店裡問", "線上投：Indeed.ie、IrishJobs.ie、Jobs.ie、LinkedIn", "附一段短短的 Cover letter／Email 說明你為什麼想做這份工作"],
      ["Keep one version per kind of job, with that job in the headline", "Cafés, restaurants, shops: print a few copies and walk in", "Online: Indeed.ie, IrishJobs.ie, Jobs.ie, LinkedIn", "Add a short cover letter or e-mail saying why you want this job"]],
    tip_target: ["愛爾蘭的雇主一份履歷只看幾秒。想做不同工作（咖啡店、零售、辦公室）的話，每種各做一版，效果最好。", "Employers in Ireland look at a CV for seconds. If you want different kinds of jobs, make one version for each."],
    tip_visa: ["雇主最想知道你能不能合法工作、能做多久。PPS 號碼本身不要寫在履歷上，寫「已有 PPS」就好。", "Employers want to know you can work legally and for how long. Never write the PPS number itself, only that you have one."],
    tip_work: ["台灣的工作也很有用！盡量寫數字：一天服務幾位客人、帶過幾個人、業績多少。用中文寫沒關係。不用寫薪水和離職原因。", "Work from home counts! Use numbers: customers a day, people trained, sales. No salary or reasons for leaving."],
    tip_edu: ["寫最高學歷就好（大學、碩士）。高中只有在那是你最高學歷時才寫。", "Your highest qualifications are enough. Secondary school only if it is your highest."],
    tip_skills: ["語言寫清楚程度，有 IELTS／TOEIC 分數就寫。Manual Handling、Safe Pass、HACCP、急救這些愛爾蘭證照很加分。", "Give each language a level and any IELTS/TOEIC score. Irish certificates like Manual Handling, Safe Pass, HACCP and first aid help a lot."],
    tip_contact: ["用護照上的英文名字。電話最好是愛爾蘭號碼 +353。地址寫到區就好（例：Dublin 8）。", "Use the name on your passport. An Irish +353 number is best. Area is enough for the address (e.g. Dublin 8)."],
  };
  const zh = () => (O.lang || "zh") === "zh";
  const t = (k, v) => { const w = W[k]; let s = w ? (zh() ? w[0] : w[1]) : k; if (v && typeof s === "string") for (const [a, b] of Object.entries(v)) s = s.split("{" + a + "}").join(b); return s; };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (O.toast || (x => alert(x)))(m), sfx = n => { try { O.sfx && O.sfx(n); } catch (e) { } };

  const JOBS = [["Barista", "咖啡師"], ["Waiter / Waitress", "餐廳外場"], ["Kitchen porter", "廚房助手"], ["Chef / Commis chef", "廚師"], ["Retail assistant", "零售店員"], ["Warehouse operative", "倉庫作業員"], ["Cleaner / Housekeeping", "清潔／房務"], ["Hotel receptionist", "飯店櫃檯"], ["Customer service", "客服"], ["Childcare / Au pair", "托育／保母"], ["Office administrator", "行政助理"], ["Software / IT", "軟體／IT"]];
  const VISAS = [["", "—", "—"], ["Working Holiday Authorisation", "打工度假 (WHA)", "Working Holiday (WHA)"], ["Stamp 2 student (20 h/week in term, 40 h in holidays)", "學生 Stamp 2", "Student, Stamp 2"], ["Stamp 1G graduate", "畢業生 Stamp 1G", "Graduate, Stamp 1G"],
    ["Stamp 4", "Stamp 4", "Stamp 4"], ["Employment permit (Stamp 1)", "工作許可 Stamp 1", "Employment permit, Stamp 1"], ["EU/EEA, UK or Irish citizen (no permit needed)", "歐盟／英國／愛爾蘭公民", "EU/EEA, UK or Irish citizen"], ["Other", "其他", "Other"]];
  const PPS = [["", "—", "—"], ["PPS number held", "已經有", "I have one"], ["PPS number applied for", "申請中", "Applied for"], ["No PPS number yet", "還沒有", "Not yet"]];
  const HOURS = [["", "—", "—"], ["Full-time", "全職", "Full-time"], ["Part-time", "兼職", "Part-time"], ["Weekends and evenings", "週末和晚上", "Weekends & evenings"], ["Flexible, any shift", "都可以", "Flexible"]];
  const CITIES = ["Dublin", "Cork", "Galway", "Limerick", "Waterford", "Kilkenny", "Athlone", "Sligo", "Remote"];
  const STEPS = ["intro", "target", "visa", "work", "edu", "skills", "contact", "result"];

  const blank = () => ({ v: 1, step: 0, tpl: "classic", a: { target: { jobs: "", industry: "", notes: "" }, city: "Dublin", visa: { type: "", until: "", pps: "", avail: "", hours: "" }, work: [{}], education: [{}], languages: "", skills: "", certs: "", extras: "" }, c: { name: "", email: "", phone: "", loc: "", link: "" }, cv: null });
  const load = () => { try { const x = JSON.parse(localStorage.getItem(KEY) || "null"); if (x && x.v === 1) return x; } catch (e) { } return blank(); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { } };
  const get = (o, p) => p.split(".").reduce((x, k) => x == null ? x : x[k], o);
  const set = (o, p, v) => { const k = p.split("."); let x = o; for (let i = 0; i < k.length - 1; i++) x = x[k[i]] = x[k[i]] ?? (/^\d+$/.test(k[i + 1]) ? [] : {}); x[k[k.length - 1]] = v; };

  // ---------- style ----------
  const CSS = `
.cvb{position:fixed;inset:0;z-index:38;background:rgba(10,20,16,.55);display:grid;place-items:center;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom));font-family:var(--f-ui,system-ui,sans-serif);animation:cvIn .18s ease-out both}
@keyframes cvIn{from{opacity:0}to{opacity:1}}
.cvb *{box-sizing:border-box}
.cvb-in{width:min(460px,100%);height:min(760px,100%);background:var(--card,#fff);color:var(--ink,#18221F);border-radius:22px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.cvb-h{display:flex;align-items:center;gap:8px;padding:12px 14px 8px}
.cvb-h b{font-size:18px;flex:1}
.cvb-x{border:0;background:var(--accent-soft,#DCEDE7);color:var(--accent,#1D6A5A);border-radius:999px;width:34px;height:34px;font-size:16px}
.cvb-dots{display:flex;gap:4px;padding:0 14px 8px}.cvb-dots i{flex:1;height:4px;border-radius:2px;background:var(--line,#D3DCD8)}.cvb-dots i.on{background:var(--accent,#1D6A5A)}
.cvb-b{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 14px 14px;display:flex;flex-direction:column;gap:10px;user-select:text;-webkit-user-select:text}
.cvb-b>*{flex:none}
.cvb-f{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--line,#D3DCD8)}
.cvb-f button{flex:1}
.cvb .btn{background:var(--accent,#1D6A5A);color:var(--accent-ink,#fff);border:0;border-radius:999px;padding:12px 16px;font-weight:600;font-size:15px}
.cvb .btn.ghost{background:transparent;color:var(--accent,#1D6A5A);border:1px solid var(--line,#D3DCD8)}
.cvb .btn:disabled{opacity:.5}
.cvb h3{margin:4px 0 0;font-size:17px}
.cvb label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted,#5B6A66);font-weight:600}
.cvb input,.cvb select,.cvb textarea{font:inherit;font-size:16px;color:var(--ink,#18221F);background:var(--paper,#F2F5F3);border:1px solid var(--line,#D3DCD8);border-radius:10px;padding:9px 10px;width:100%;font-weight:400}
.cvb textarea{min-height:84px;resize:vertical}
.cvb .row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cvb-gift{background:var(--accent-soft,#DCEDE7);color:var(--ink,#18221F);border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.5}
.cvb-tip{background:var(--gorse-soft,#FBEBC0);border-radius:12px;padding:9px 11px;font-size:13.5px;line-height:1.45}
.cvb-card{border:1px solid var(--line,#D3DCD8);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:8px}
.cvb-card .hd{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:14px}
.cvb-card .hd button{border:0;background:none;color:var(--bad,#C0443B);font-size:13px}
.cvb-add{border:1px dashed var(--accent,#1D6A5A);background:none;color:var(--accent,#1D6A5A);border-radius:12px;padding:10px;font-weight:600;font-size:14px}
.cvb-chips{display:flex;flex-wrap:wrap;gap:6px}
.cvb-chips button{border:1px solid var(--line,#D3DCD8);background:var(--card,#fff);color:var(--ink,#18221F);border-radius:999px;padding:6px 10px;font-size:13px}
.cvb-chips button.on{background:var(--accent-soft,#DCEDE7);border-color:var(--accent,#1D6A5A);color:var(--accent,#1D6A5A)}
.cvb ul.cvb-l{margin:0;padding-left:20px;font-size:14px;line-height:1.55}
.cvb small.mut{color:var(--muted,#5B6A66);font-size:12.5px;line-height:1.45}
.cvb-hero{text-align:center;padding:8px 0 2px}.cvb-hero .ic{font-size:44px}.cvb-hero p{margin:4px 0 0;color:var(--muted,#5B6A66);font-size:14px}
.cvb-wait{display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 10px;text-align:center}
.cvb-spin{width:44px;height:44px;border-radius:50%;border:4px solid var(--accent-soft,#DCEDE7);border-top-color:var(--accent,#1D6A5A);animation:cvSp 1s linear infinite}@keyframes cvSp{to{transform:rotate(360deg)}}
.cvb-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.cvb-bar .btn{padding:9px 13px;font-size:14px}
.cvb-paperw{background:#c9d1ce;border-radius:12px;padding:10px;overflow:hidden}
.cvb-paper{position:relative;background:#fff;color:#1b1b1b;width:595px;transform-origin:0 0;padding:48px 48px 40px;font-family:Helvetica,Arial,sans-serif;font-size:10.2px;line-height:1.3;box-shadow:0 2px 8px rgba(0,0,0,.2);user-select:text;-webkit-user-select:text}
.cvb-paper .nm{font-size:22px;font-weight:700;letter-spacing:.3px}
.cvb-paper .hl{font-size:11.5px;margin-top:2px}
.cvb-paper .ct{font-size:9.5px;color:#444;margin-top:4px}
.cvb-paper .wr{font-size:9.5px;color:#444;margin-top:2px;font-style:italic}
.cvb-paper .sh{font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:.8px;margin:10px 0 6px;padding-bottom:3px;border-bottom:1px solid #333}
.cvb-paper .jb{margin-bottom:4px}.cvb-paper .jt{display:flex;justify-content:space-between;gap:10px}.cvb-paper .jt b{font-size:11px}.cvb-paper .jt span{color:#555;white-space:nowrap}
.cvb-paper .jo{font-style:italic;color:#333}
.cvb-paper ul{margin:3px 0 0;padding-left:14px}.cvb-paper li{margin:0 0 1px}
.cvb-paper .sk{columns:2;column-gap:20px;margin:0;padding-left:14px}
.cvb-paper .ref{margin-top:10px;font-style:italic;color:#444}
.cvb-paper.c .hd0{text-align:center}
.cvb-paper.f .nm{color:#1D6A5A}.cvb-paper.f .hd0{border-left:5px solid #1D6A5A;padding-left:12px}
.cvb-paper.f .sh{color:#1D6A5A;border-bottom:2px solid #1D6A5A}
.cvb-pg{border-top:2px dashed #E39B3B;margin:12px -48px;position:relative}.cvb-pg span{position:absolute;right:6px;top:-9px;background:#fff;color:#E39B3B;font-size:9px;padding:0 4px}
.cvb-ed{display:flex;flex-direction:column;gap:8px}
.cvb-warn{color:var(--bad,#C0443B);font-size:13px}
`;

  // ---------- form pieces ----------
  const inp = (p, lab, ph, type) => `<label>${lab}<input data-f="${p}" value="${esc(get(D, p) || "")}" placeholder="${esc(ph || "")}" ${type ? `type="${type}" inputmode="${type === "email" ? "email" : "tel"}"` : ""} autocomplete="off"></label>`;
  const area = (p, lab, ph) => `<label>${lab}<textarea data-f="${p}" placeholder="${esc(ph || "")}">${esc(get(D, p) || "")}</textarea></label>`;
  const sel = (p, lab, opts) => `<label>${lab}<select data-f="${p}">${opts.map(o => `<option value="${esc(o[0])}" ${get(D, p) === o[0] ? "selected" : ""}>${esc(zh() ? o[1] : o[2])}</option>`).join("")}</select></label>`;
  const tip = k => `<div class="cvb-tip">💡 ${t("tip_" + k)}</div>`;

  function stepHtml(s) {
    const a = D.a;
    if (s === "intro") return `<div class="cvb-hero"><div class="ic">📝</div><h3>${t("title")}</h3><p>${t("sub")}</p></div>
      <div class="cvb-card"><b>🇮🇪 ${t("introH")}</b><ul class="cvb-l">${t("intro").map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="cvb-gift">${t("gift")}</div><div class="cvb-tip">${t("how")}</div><small class="mut">${t("privacy")}</small>
      ${leftHtml()}`;
    if (s === "target") return `<h3>🎯 ${t("s_target")}</h3>${tip("target")}${inp("a.target.jobs", t("jobs"), t("jobsPh"))}
      <small class="mut">${t("jobsPick")}</small><div class="cvb-chips">${JOBS.map(j => `<button data-job="${esc(j[0])}" class="${(a.target.jobs || "").includes(j[0]) ? "on" : ""}">${esc(zh() ? j[1] : j[0])}</button>`).join("")}</div>
      ${inp("a.target.industry", t("industry"), t("industryPh"))}${area("a.target.notes", t("tnotes"), t("tnotesPh"))}`;
    if (s === "visa") return `<h3>🛂 ${t("s_visa")}</h3>${tip("visa")}
      <label>${t("city")}<input data-f="a.city" list="cvbCities" value="${esc(a.city || "")}" autocomplete="off"></label><datalist id="cvbCities">${CITIES.map(c => `<option value="${c}">`).join("")}</datalist>
      ${sel("a.visa.type", t("visa"), VISAS)}${inp("a.visa.until", t("until"), t("untilPh"))}<div class="row2">${sel("a.visa.pps", t("pps"), PPS)}${sel("a.visa.hours", t("hours"), HOURS)}</div>${inp("a.visa.avail", t("avail"), t("availPh"))}`;
    if (s === "work") return `<h3>💼 ${t("s_work")}</h3>${tip("work")}${a.work.map((w, i) => `<div class="cvb-card"><div class="hd">${t("jobN", { n: i + 1 })}${a.work.length > 1 ? `<button data-del="work" data-i="${i}">✕ ${t("del")}</button>` : ""}</div>
      ${inp(`a.work.${i}.title`, t("wTitle"), t("wTitlePh"))}${inp(`a.work.${i}.org`, t("wOrg"))}${inp(`a.work.${i}.place`, t("wPlace"), t("wPlacePh"))}
      <div class="row2">${inp(`a.work.${i}.from`, t("from"), t("fromPh"))}${inp(`a.work.${i}.to`, t("to"), t("toPh"))}</div>${area(`a.work.${i}.did`, t("did"), t("didPh"))}</div>`).join("")}
      ${a.work.length < 8 ? `<button class="cvb-add" data-add="work">${t("addJob")}</button>` : ""}`;
    if (s === "edu") return `<h3>🎓 ${t("s_edu")}</h3>${tip("edu")}${a.education.map((e, i) => `<div class="cvb-card"><div class="hd">${t("eduN", { n: i + 1 })}${a.education.length > 1 ? `<button data-del="education" data-i="${i}">✕ ${t("del")}</button>` : ""}</div>
      ${inp(`a.education.${i}.qual`, t("eQual"), t("eQualPh"))}${inp(`a.education.${i}.school`, t("eSchool"))}${inp(`a.education.${i}.place`, t("wPlace"), t("wPlacePh"))}
      <div class="row2">${inp(`a.education.${i}.from`, t("from"), t("fromPh"))}${inp(`a.education.${i}.to`, t("to"), t("toPh"))}</div>${area(`a.education.${i}.notes`, t("eNotes"), t("eNotesPh"))}</div>`).join("")}
      ${a.education.length < 5 ? `<button class="cvb-add" data-add="education">${t("addEdu")}</button>` : ""}`;
    if (s === "skills") return `<h3>🧰 ${t("s_skills")}</h3>${tip("skills")}${area("a.languages", t("langs"), t("langsPh"))}${area("a.skills", t("skills"), t("skillsPh"))}${area("a.certs", t("certs"), t("certsPh"))}${area("a.extras", t("extras"), t("extrasPh"))}`;
    if (s === "contact") return `<h3>📇 ${t("s_contact")}</h3><div class="cvb-tip">${t("onPhone")}<br>${t("tip_contact")}</div>
      ${inp("c.name", t("cName"), t("cNamePh"))}${inp("c.email", t("cEmail"), "name@example.com", "email")}${inp("c.phone", t("cPhone"), t("cPhonePh"), "tel")}${inp("c.loc", t("cLoc"), t("cLocPh"))}${inp("c.link", t("cLink"), "linkedin.com/in/…")}`;
    if (s === "result") return resultHtml();
    return "";
  }

  // ---------- the CV itself ----------
  const contactLine = () => [D.c.loc, D.c.phone, D.c.email, D.c.link].map(x => (x || "").trim()).filter(Boolean);
  function paperHtml(cv, tpl) {
    const sec = (h, inner) => inner ? `<div class="sh">${h}</div>${inner}` : "";
    const ul = arr => arr && arr.length ? `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    return `<div class="cvb-paper ${tpl === "fresh" ? "f" : "c"}"><div class="hd0"><div class="nm">${esc(D.c.name || "Your Name")}</div>${cv.headline ? `<div class="hl">${esc(cv.headline)}</div>` : ""}
      <div class="ct">${contactLine().map(esc).join("  |  ")}</div>${cv.workRight ? `<div class="wr">${esc(cv.workRight)}</div>` : ""}</div>
      ${sec("Personal Statement", cv.statement ? `<div>${esc(cv.statement)}</div>` : "")}
      ${sec("Key Skills", cv.skills && cv.skills.length ? `<ul class="sk">${cv.skills.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "")}
      ${sec("Work Experience", (cv.experience || []).map(j => `<div class="jb"><div class="jt"><b>${esc(j.title)}</b><span>${esc(j.dates)}</span></div><div class="jo">${esc([j.org, j.place].filter(Boolean).join(", "))}</div>${ul(j.bullets)}</div>`).join(""))}
      ${sec("Education", (cv.education || []).map(e => `<div class="jb"><div class="jt"><b>${esc(e.qual)}</b><span>${esc(e.dates)}</span></div><div class="jo">${esc([e.school, e.place].filter(Boolean).join(", "))}</div>${e.notes ? `<div>${esc(e.notes)}</div>` : ""}</div>`).join(""))}
      ${sec("Certifications & Training", ul(cv.certs))}${sec("Languages", short(cv.languages) ? `<div>${cv.languages.map(esc).join(" &nbsp;•&nbsp; ")}</div>` : ul(cv.languages))}${sec("Additional Information", ul(cv.extras))}
      <div class="ref">References available on request.</div></div>`;
  }
  const short = a => a && a.length > 1 && a.join("  '+B+'  ").length <= 95;   // few short items: one line instead of a list
  const lines = a => (a || []).join("\n"), unlines = s => String(s || "").split("\n").map(x => x.replace(/^[•\-\*]\s*/, "").trim()).filter(Boolean);
  function editHtml(cv) {
    const ta = (p, lab, v, h) => `<label>${lab}<textarea data-cv="${p}" style="min-height:${h || 84}px">${esc(v)}</textarea></label>`;
    const ln = ` <small class="mut">(${t("lines")})</small>`;
    return `<div class="cvb-ed"><label>Headline<input data-cv="headline" value="${esc(cv.headline)}"></label>${ta("statement", "Personal Statement", cv.statement, 120)}
      <label>Work right<input data-cv="workRight" value="${esc(cv.workRight)}"></label>${ta("skills", "Key Skills" + ln, lines(cv.skills))}
      ${(cv.experience || []).map((j, i) => `<div class="cvb-card"><div class="row2"><label>Title<input data-cv="experience.${i}.title" value="${esc(j.title)}"></label><label>Dates<input data-cv="experience.${i}.dates" value="${esc(j.dates)}"></label></div>
        <div class="row2"><label>Employer<input data-cv="experience.${i}.org" value="${esc(j.org)}"></label><label>Place<input data-cv="experience.${i}.place" value="${esc(j.place)}"></label></div>${ta(`experience.${i}.bullets`, "Bullets" + ln, lines(j.bullets), 110)}</div>`).join("")}
      ${(cv.education || []).map((e, i) => `<div class="cvb-card"><div class="row2"><label>Qualification<input data-cv="education.${i}.qual" value="${esc(e.qual)}"></label><label>Dates<input data-cv="education.${i}.dates" value="${esc(e.dates)}"></label></div>
        <div class="row2"><label>School<input data-cv="education.${i}.school" value="${esc(e.school)}"></label><label>Place<input data-cv="education.${i}.place" value="${esc(e.place)}"></label></div><label>Notes<input data-cv="education.${i}.notes" value="${esc(e.notes)}"></label></div>`).join("")}
      ${ta("certs", "Certifications" + ln, lines(cv.certs))}${ta("languages", "Languages" + ln, lines(cv.languages))}${ta("extras", "Additional Information" + ln, lines(cv.extras))}</div>`;
  }
  const leftHtml = () => left ? `<small class="mut">✨ ${t("leftN", { d: Math.max(0, left.day), m: Math.max(0, left.month), p: Math.max(0, left.pro ?? 1) })}</small>` : "";
  const writeBtns = again => `<button class="btn ${again ? "ghost" : ""}" data-go="write">${again ? t("rewrite") : t("write")}</button>
      <button class="btn ghost" data-go="writePro" ${left && left.pro <= 0 ? "disabled" : ""}>${t("writePro")}</button><small class="mut">${t("proInfo")}${left && left.proAll != null ? " " + t("proAll", { n: left.proAll }) : ""}</small>`;
  function resultHtml() {
    const cv = D.cv;
    if (busy) return `<div class="cvb-wait"><div class="cvb-spin"></div><b>${t("writing")}</b><small class="mut">${t("tip_target")}</small></div>`;
    if (!cv) return `<h3>✨ ${t("s_result")}</h3><div class="cvb-tip">${t("how")}</div><small class="mut">${t("privacy")}</small>${leftHtml()}
      ${writeBtns(false)}`;
    return `${D.pro ? `<div class="cvb-gift" style="padding:6px 10px">${t("proTag")}</div>` : ""}<div class="cvb-bar"><b style="font-size:14px">${t("tpl")}</b><div class="cvb-chips">${["classic", "fresh"].map(k => `<button data-tpl="${k}" class="${D.tpl === k ? "on" : ""}">${t("tpl_" + k)}</button>`).join("")}</div>
        <span style="flex:1"></span><button class="btn ghost" data-go="edit">${edit ? t("editDone") : t("edit")}</button></div>
      ${edit ? editHtml(cv) : `<div class="cvb-paperw"><div class="cvb-paperbox">${paperHtml(cv, D.tpl)}</div></div><small class="mut cvb-pages"></small>`}
      <div class="cvb-bar"><button class="btn" data-go="pdf">${t("pdf")}</button><button class="btn ghost" data-go="copy">${t("copy")}</button></div>
      <div class="cvb-gift">${t("gift")}</div>
      ${cv.tips && cv.tips.length ? `<div class="cvb-card"><b>${t("tips")}</b><ul class="cvb-l">${cv.tips.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      ${cv.missing && cv.missing.length ? `<div class="cvb-card"><b>${t("missing")}</b><ul class="cvb-l">${cv.missing.map(x => `<li>${esc(x)}</li>`).join("")}</ul><button class="btn ghost" data-step="3">${t("fixAns")}</button></div>` : ""}
      <div class="cvb-card"><b>${t("nextT")}</b><ul class="cvb-l">${t("nextL").map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      ${leftHtml()}${writeBtns(true)}`;
  }
  // scale the A4 paper preview to the card width and mark where page 2 starts
  function fitPaper() {
    const w = box && box.querySelector(".cvb-paperw"), p = w && w.querySelector(".cvb-paper"), pb = w && w.querySelector(".cvb-paperbox"); if (!p) return;
    p.querySelectorAll(".cvb-pg").forEach(x => x.remove());
    const sc = (w.clientWidth - 20) / 595, pageH = 842 - 48 - 40;   // A4 at 72 dpi minus the PDF margins
    const kids = [...p.children]; let n = 1;
    for (const k of kids) { if (k.offsetTop - 48 + k.offsetHeight > pageH * n) { const m = document.createElement("div"); m.className = "cvb-pg"; m.innerHTML = `<span>${n + 1}</span>`; p.insertBefore(m, k); n++; } }
    p.style.transform = `scale(${sc})`; pb.style.height = p.offsetHeight * sc + "px";
    const info = box.querySelector(".cvb-pages"); if (info) { info.textContent = t("pages", { n }) + (n > 2 ? " · " + t("tooLong") : ""); info.classList.toggle("cvb-warn", n > 2); }
  }

  // ---------- PDF (real text, so job sites can read it) ----------
  const ALLOW = /[–—‘’“”•…€]/;
  let dropped = false;
  const pdfSafe = s => String(s || "").replace(/[^\x00-\xFF]/g, c => ALLOW.test(c) ? c : (dropped = true, "")).replace(/\s{2,}/g, " ").trim();
  function loadJsPdf() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    return new Promise((ok, no) => { const s = document.createElement("script"); s.src = JSPDF; s.onload = () => ok(window.jspdf); s.onerror = no; document.head.appendChild(s); });
  }
  function buildPdf(jsPDF, cv, tpl) {
    dropped = false;
    const doc = new jsPDF({ unit: "mm", format: "a4" }), PW = 210, PH = 297, M = 17, CW = PW - 2 * M, ACC = tpl === "fresh" ? [29, 106, 90] : [20, 20, 20];
    let y = M;
    const lh = sz => sz * 0.3528 * 1.3;
    const room = h => { if (y + h > PH - 14) { doc.addPage(); y = M; } };
    const font = (sz, st, col) => { doc.setFont("helvetica", st || "normal"); doc.setFontSize(sz); doc.setTextColor(...(col || [27, 27, 27])); };
    const para = (s, sz, st, col, x, w, align) => { s = pdfSafe(s); if (!s) return; font(sz, st, col); const L = doc.splitTextToSize(s, w || CW); for (const l of L) { room(lh(sz)); doc.text(l, align === "center" ? PW / 2 : (x || M), y + lh(sz) * .78, align === "center" ? { align: "center" } : undefined); y += lh(sz); } };
    const bullets = (arr, sz) => { for (const b of arr || []) { const s = pdfSafe(b); if (!s) continue; font(sz); const L = doc.splitTextToSize(s, CW - 5); room(lh(sz)); doc.text("•", M + 1, y + lh(sz) * .78); L.forEach((l, i) => { if (i) room(lh(sz)); doc.text(l, M + 5, y + lh(sz) * .78); y += lh(sz); }); y += .4; } };
    const head = h => { room(14); y += 3.6; font(11.5, "bold", ACC); if (tpl === "fresh") { doc.text(h, M, y + 4); doc.setDrawColor(...ACC); doc.setLineWidth(.6); doc.line(M, y + 6, PW - M, y + 6); } else { doc.text(h.toUpperCase(), M, y + 4, { charSpace: .3 }); doc.setDrawColor(40, 40, 40); doc.setLineWidth(.3); doc.line(M, y + 6, PW - M, y + 6); } y += 8; };
    const entry = (title, dates, sub) => { room(lh(11) + lh(10) + 4); font(11, "bold"); const dw = dates ? doc.getTextWidth(pdfSafe(dates)) : 0; font(11, "bold"); const tl = doc.splitTextToSize(pdfSafe(title), CW - dw - 6);
      tl.forEach((l, i) => { doc.text(l, M, y + lh(11) * .78); if (!i && dates) { font(10, "normal", [85, 85, 85]); doc.text(pdfSafe(dates), PW - M, y + lh(11) * .78, { align: "right" }); font(11, "bold"); } y += lh(11); });
      if (sub) para(sub, 10, "italic", [60, 60, 60]); y += .8; };
    // header
    const center = tpl !== "fresh";
    if (!center) { doc.setFillColor(...ACC); doc.rect(M - 6, y, 1.6, 20, "F"); }
    para(D.c.name || "Your Name", 22, "bold", center ? [20, 20, 20] : ACC, M, CW, center ? "center" : null); y += 1;
    if (cv.headline) para(cv.headline, 11.5, "normal", [40, 40, 40], M, CW, center ? "center" : null);
    const cl = contactLine().map(pdfSafe).filter(Boolean).join("  |  "); if (cl) para(cl, 9.5, "normal", [70, 70, 70], M, CW, center ? "center" : null);
    if (cv.workRight) para(cv.workRight, 9.5, "italic", [70, 70, 70], M, CW, center ? "center" : null);
    if (cv.statement) { head("Personal Statement"); para(cv.statement, 10.2); }
    if (cv.skills && cv.skills.length) { head("Key Skills"); const half = Math.ceil(cv.skills.length / 2), colW = CW / 2 - 4; let y0 = y, yMax = y;
      [cv.skills.slice(0, half), cv.skills.slice(half)].forEach((col, ci) => { y = y0; const x = M + ci * (CW / 2); for (const s of col) { font(10.2); const L = doc.splitTextToSize(pdfSafe(s), colW - 5); doc.text("•", x + 1, y + lh(10.2) * .78); L.forEach(l => { doc.text(l, x + 5, y + lh(10.2) * .78); y += lh(10.2); }); y += .4; } yMax = Math.max(yMax, y); }); y = yMax; }
    if (cv.experience && cv.experience.length) { head("Work Experience"); for (const j of cv.experience) { entry(j.title, j.dates, [j.org, j.place].filter(Boolean).join(", ")); bullets(j.bullets, 10.2); y += 1.4; } }
    if (cv.education && cv.education.length) { head("Education"); for (const e of cv.education) { entry(e.qual, e.dates, [e.school, e.place].filter(Boolean).join(", ")); if (e.notes) para(e.notes, 10.2); y += 1.4; } }
    if (cv.certs && cv.certs.length) { head("Certifications & Training"); bullets(cv.certs, 10.2); }
    if (cv.languages && cv.languages.length) { head("Languages"); if (short(cv.languages)) para(cv.languages.join("  •  "), 10.2); else bullets(cv.languages, 10.2); }
    if (cv.extras && cv.extras.length) { head("Additional Information"); bullets(cv.extras, 10.2); }
    y += 3; para("References available on request.", 10, "italic", [70, 70, 70]);
    return doc;
  }
  const fileName = () => ((pdfSafe(D.c.name) || "My").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "My") + "_CV.pdf";
  async function makePdf() {
    let lib; try { lib = await loadJsPdf(); } catch (e) { return toast(t("e_net")); }
    const doc = buildPdf(lib.jsPDF, D.cv, D.tpl), name = fileName(), blob = doc.output("blob");
    if (dropped) toast(t("nonLatin"));
    sfx("coin");
    if (O.onPdf) return O.onPdf(blob, name);   // preview / tests
    try { const f = new File([blob], name, { type: "application/pdf" }); if (navigator.canShare && navigator.canShare({ files: [f] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { await navigator.share({ files: [f], title: name }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30e3);
  }
  function plainText(cv) {
    const out = [D.c.name || "", cv.headline || "", contactLine().join(" | "), cv.workRight || ""].filter(Boolean);
    const sec = (h, body) => { if (body) out.push("", h.toUpperCase(), body); };
    sec("Personal Statement", cv.statement); sec("Key Skills", (cv.skills || []).map(x => "• " + x).join("\n"));
    sec("Work Experience", (cv.experience || []).map(j => `${j.title} | ${j.dates}\n${[j.org, j.place].filter(Boolean).join(", ")}\n${(j.bullets || []).map(b => "• " + b).join("\n")}`).join("\n\n"));
    sec("Education", (cv.education || []).map(e => `${e.qual} | ${e.dates}\n${[e.school, e.place].filter(Boolean).join(", ")}${e.notes ? "\n" + e.notes : ""}`).join("\n\n"));
    sec("Certifications & Training", (cv.certs || []).map(x => "• " + x).join("\n")); sec("Languages", (cv.languages || []).map(x => "• " + x).join("\n")); sec("Additional Information", (cv.extras || []).map(x => "• " + x).join("\n"));
    out.push("", "References available on request."); return out.join("\n");
  }

  // ---------- server ----------
  const tipsLang = () => ({ zh: O.sc ? "Simplified Chinese" : "Traditional Chinese (Taiwan)", en: "English", hi: "Hindi", es: "Spanish", ja: "Japanese", ko: "Korean" })[O.lang] || "English";
  async function call(body) {
    const tok = O.token ? await O.token() : null; if (!tok) return { error: "login" };
    try { const r = await fetch(O.fn + "/cvWrite", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return r.ok ? j : { error: j.error || "net" }; }
    catch (e) { return { error: "net" }; }
  }
  async function checkLeft() { const r = await call({ check: true }); if (r && r.left) { left = r.left; if (box) draw(true); } }
  async function write(pro) {
    if (busy) return;
    const a = JSON.parse(JSON.stringify(D.a)), has = o => Object.values(o || {}).some(v => String(v || "").trim());
    a.work = a.work.filter(has); a.education = a.education.filter(has); a.tipsLang = tipsLang();
    if (!a.work.length && !a.education.length) return toast(t("needSome"));
    busy = true; edit = false; D.step = STEPS.indexOf("result"); draw();
    const r = await call(pro ? { answers: a, pro: true } : { answers: a });   // contact details (D.c) are never sent
    busy = false;
    if (r && r.cv) { D.cv = r.cv; D.pro = !!r.pro; if (r.left) left = r.left; save(); sfx("prize"); }
    else if (r.error === "empty") toast(t("needSome"));
    else toast(t("e_" + (["login", "setup", "day", "month", "busy", "full", "refused", "banned", "pro", "proOut"].includes(r.error) ? r.error : "net")));
    draw();
  }

  // ---------- frame ----------
  function draw(keepScroll) {
    const s = STEPS[D.step] || "intro", b = box.querySelector(".cvb-b"), top = keepScroll && b ? b.scrollTop : 0;
    box.querySelector(".cvb-dots").innerHTML = STEPS.slice(1).map((x, i) => `<i class="${i < D.step ? "on" : ""}"></i>`).join("");
    b.innerHTML = stepHtml(s);
    const f = box.querySelector(".cvb-f"), last = s === "result", first = s === "intro";
    const started = D.step > 0 || D.cv || D.a.work.some(w => w.title || w.did);
    f.innerHTML = first ? (started && D.cv ? `<button class="btn ghost" data-go="clear">${t("fresh")}</button><button class="btn" data-step="7">${t("resume")}</button>` : `${started ? `<button class="btn ghost" data-go="clear">${t("fresh")}</button>` : ""}<button class="btn" data-step="1">${t("start")}</button>`)
      : last ? `<button class="btn ghost" data-step="${D.step - 1}" ${busy ? "disabled" : ""}>‹ ${t("back")}</button>`
        : `<button class="btn ghost" data-step="${D.step - 1}">‹ ${t("back")}</button><button class="btn" data-step="${D.step + 1}">${t("next")} ›</button>`;
    b.scrollTop = top; if (s === "result" && D.cv && !edit) requestAnimationFrame(fitPaper);
  }
  function onInput(e) {
    const el = e.target;
    if (el.dataset.f) { set(D, el.dataset.f, el.value.slice(0, 1200)); save(); return; }
    if (el.dataset.cv && D.cv) { const p = el.dataset.cv, arr = /(^|\.)(skills|bullets|certs|languages|extras)$/.test(p); set(D.cv, p, arr ? unlines(el.value) : el.value); save(); }
  }
  async function onClick(e) {
    const b = e.target.closest("button"); if (!b || !box.contains(b)) return;
    if (b.classList.contains("cvb-x")) return close();
    if (b.dataset.step != null) { D.step = Math.max(0, Math.min(STEPS.length - 1, +b.dataset.step)); edit = false; save(); sfx("tap"); return draw(); }
    if (b.dataset.job) { const cur = (D.a.target.jobs || "").split(/\s*[,，、]\s*/).filter(Boolean), j = b.dataset.job, i = cur.indexOf(j); if (i < 0) cur.push(j); else cur.splice(i, 1); D.a.target.jobs = cur.join(", "); save(); return draw(true); }
    if (b.dataset.add) { D.a[b.dataset.add].push({}); save(); draw(true); const c = box.querySelectorAll(".cvb-card"); if (c.length) c[c.length - 1].scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (b.dataset.del) { D.a[b.dataset.del].splice(+b.dataset.i, 1); save(); return draw(true); }
    if (b.dataset.tpl) { D.tpl = b.dataset.tpl; save(); return draw(true); }
    const g = b.dataset.go;
    if (g === "write") return write(false);
    if (g === "writePro") return write(true);
    if (g === "edit") { edit = !edit; return draw(); }
    if (g === "pdf") return makePdf();
    if (g === "copy") { try { await navigator.clipboard.writeText(plainText(D.cv)); toast(t("copied")); } catch (er) { toast("✕"); } return; }
    if (g === "clear") { if (!confirm(t("clearAsk"))) return; D = blank(); save(); return draw(); }
  }
  function close() { if (!box) return; box.remove(); box = null; document.removeEventListener("keydown", onKey); if (O.onClose) O.onClose(); }
  const onKey = e => { if (e.key === "Escape") close(); };

  window.CVB = {
    open(opt) {
      O = opt || {}; D = load(); edit = false;
      if (!document.getElementById("cvbCss")) { const st = document.createElement("style"); st.id = "cvbCss"; st.textContent = CSS; document.head.appendChild(st); }
      if (box) box.remove();
      box = document.createElement("div"); box.className = "cvb";
      box.innerHTML = `<div class="cvb-in" role="dialog" aria-label="${esc(t("title"))}"><div class="cvb-h"><b>📝 ${t("title")}</b><button class="cvb-x" aria-label="${esc(t("close"))}">✕</button></div><div class="cvb-dots"></div><div class="cvb-b"></div><div class="cvb-f"></div></div>`;
      box.addEventListener("input", onInput); box.addEventListener("change", onInput); box.addEventListener("click", onClick);
      box.addEventListener("click", e => { if (e.target === box) close(); });
      document.addEventListener("keydown", onKey);
      (O.root || document.body).appendChild(box); draw(); checkLeft();
      addEventListener("resize", () => { if (box && !edit) fitPaper(); });
    },
    close, clear() { try { localStorage.removeItem(KEY); } catch (e) { } },
    _pdf: (cv, c, tpl) => { D = D || blank(); if (c) D.c = c; return loadJsPdf().then(l => buildPdf(l.jsPDF, cv, tpl)); },   // used by the test script
  };
})();
